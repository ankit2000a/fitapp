import { supabase } from './supabase';
import { calculateHealthScore } from './scoring';
import { getLocalDateString, getLocalDateStringFromUtc } from './userContext';
import { getHealthMetricsForDate } from './healthkit';

export async function syncHistoricalHealthData(
  userId: string,
  userGoals: {
    calorieGoal: number;
    proteinGoal: number;
    waterGoal: number;
    goal: string;
  },
  signupDateStr?: string
) {
  try {
    console.log("HistoricalSync: Starting sync check for the past 7 days...");
    
    // 1. Get list of dates to check (past 7 days, excluding today)
    const datesToCheck: Date[] = [];
    const dateStrings: string[] = [];
    
    const signupDate = signupDateStr ? new Date(signupDateStr) : null;
    if (signupDate) {
      signupDate.setHours(0, 0, 0, 0);
    }
    
    for (let i = 1; i <= 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      
      // Only sync days on or after the signup date
      if (signupDate && d < signupDate) {
        continue;
      }
      
      datesToCheck.push(d);
      dateStrings.push(getLocalDateString(d));
    }
    
    // 2. Fetch existing scores for these dates from Supabase
    const { data: existingScores, error: scoreErr } = await supabase
      .from('health_scores')
      .select('date, steps, score')
      .eq('user_id', userId)
      .in('date', dateStrings);
      
    if (scoreErr) {
      console.warn("HistoricalSync: Error fetching existing scores:", scoreErr);
      return;
    }
    
    const scoreMap = new Map<string, { steps: number; score: number }>();
    existingScores?.forEach(s => {
      scoreMap.set(s.date, { steps: s.steps || 0, score: s.score || 0 });
    });
    
    // 3. Check which days we need to query and sync
    // We sync a day if it is missing from the DB or steps/score is 0/null.
    const datesToSync: Date[] = [];
    datesToCheck.forEach(d => {
      const dateStr = getLocalDateString(d);
      const existing = scoreMap.get(dateStr);
      if (!existing || existing.steps === 0 || existing.score === 0) {
        datesToSync.push(d);
      }
    });
    
    if (datesToSync.length === 0) {
      console.log("HistoricalSync: All past 7 days are already synced and valid.");
      return;
    }
    
    console.log(`HistoricalSync: Found ${datesToSync.length} days that need sync:`, datesToSync.map(d => getLocalDateString(d)));
    
    // 4. Fetch food logs for the entire range from Supabase (to group them locally and avoid multiple queries)
    const oldestDate = datesToSync[datesToSync.length - 1]; // sorted newest to oldest
    const newestDate = datesToSync[0];
    
    const startRange = new Date(oldestDate);
    startRange.setHours(0, 0, 0, 0);
    const endRange = new Date(newestDate);
    endRange.setHours(23, 59, 59, 999);
    
    const { data: foodLogs, error: foodErr } = await supabase
      .from('food_logs')
      .select('calories, protein_g, logged_at, food_name')
      .eq('user_id', userId)
      .gte('logged_at', startRange.toISOString())
      .lte('logged_at', endRange.toISOString());
      
    if (foodErr) {
      console.warn("HistoricalSync: Error fetching food logs:", foodErr);
      return;
    }
    
    const foodLogsByDate = new Map<string, any[]>();
    foodLogs?.forEach(log => {
      const localDate = getLocalDateStringFromUtc(log.logged_at);
      if (!foodLogsByDate.has(localDate)) {
        foodLogsByDate.set(localDate, []);
      }
      foodLogsByDate.get(localDate)!.push(log);
    });
    
    // 5. Query HealthKit and upsert scores for each date
    let updatedAny = false;
    for (const d of datesToSync) {
      const dateStr = getLocalDateString(d);
      console.log(`HistoricalSync: Syncing HealthKit and recalculating score for date: ${dateStr}`);
      
      // Get historical HealthKit metrics for this specific day
      const metrics = await getHealthMetricsForDate(d);
      
      // Get food logs for this day
      const dayLogs = foodLogsByDate.get(dateStr) || [];
      const caloriesToday = dayLogs.reduce((sum, r) => sum + (r.calories || 0), 0);
      const proteinToday = dayLogs.reduce((sum, r) => sum + (r.protein_g || 0), 0);
      const mealsToday = dayLogs.filter(f => !f.food_name?.startsWith('__reward_lock:')).length;
      
      // Calculate score for this past day
      const scoreResultObj = calculateHealthScore({
        caloriesToday,
        calorieGoal: userGoals.calorieGoal,
        proteinToday,
        proteinGoal: userGoals.proteinGoal,
        mealsToday,
        currentHour: 23,
        currentMinute: 59,
        stepsToday: metrics.steps,
        stepsTracked: metrics.stepsTracked,
        workoutMinutesToday: metrics.workoutMinutes,
        activeMinutesToday: metrics.activeMinutes,
        activeMinutesTracked: metrics.activeMinutesTracked,
        sleepHoursLastNight: metrics.sleepHours,
        sleepTracked: metrics.sleepTracked,
        sleepStartLastNight: metrics.sleepStart,
        waterToday: 0, // Water is not tracked historically
        waterGoal: userGoals.waterGoal,
        isPastDay: true, // Crucial for normalizing scores without sleep penalties
        goal: userGoals.goal
      });
      
      console.log(`HistoricalSync: Date ${dateStr} - calculated score: ${scoreResultObj.totalScore} (steps: ${metrics.steps}, sleep: ${metrics.sleepHours})`);
      
      // Upsert to Supabase
      const { error: upsertErr } = await supabase.from('health_scores').upsert({
        user_id: userId,
        date: dateStr,
        score: scoreResultObj.totalScore,
        nutrition_score: scoreResultObj.nutritionScore,
        activity_score: scoreResultObj.activityScore,
        sleep_score: scoreResultObj.sleepScore,
        steps: metrics.steps,
        active_calories: metrics.activeCalories,
      }, { onConflict: 'user_id,date' });
      
      if (upsertErr) {
        console.warn(`HistoricalSync: Failed to upsert score for ${dateStr}:`, upsertErr.message);
      } else {
        updatedAny = true;
      }
    }
    
    // 6. Trigger challenge sync RPC if any days were updated
    if (updatedAny) {
      console.log("HistoricalSync: Triggering challenge sync database function...");
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const { error: syncErr } = await supabase.rpc('sync_user_challenges', { 
        p_user_id: userId,
        p_timezone: tz
      });
      if (syncErr) {
        console.warn("HistoricalSync: Error triggering sync_user_challenges:", syncErr.message);
      } else {
        console.log("HistoricalSync: Challenge sync completed successfully.");
      }
    }
    
  } catch (err) {
    console.error("HistoricalSync: Catch-all error in syncHistoricalHealthData:", err);
  }
}
