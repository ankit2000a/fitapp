import { supabase } from './supabase';
import { calculateHealthScore } from './scoring';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const getLocalDateString = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getLocalDateStringFromUtc = (utcStr: string): string => {
  const d = new Date(utcStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export interface UserContext {
  // Identity
  userId: string;
  firstName: string;
  name: string;

  // Physical
  age: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  birthday: string | null;
  hasDiabetes: boolean;

  // Goals
  goal: string;
  calorieGoal: number;
  proteinGoal: number;
  waterGoal: number;
  stepsGoal: number;

  // Preferences
  diet: string;
  cuisine: string;

  // Today's nutrition
  caloriesToday: number;
  proteinToday: number;
  carbsToday: number;
  fatToday: number;
  mealsToday: number;
  waterToday: number;
  caloriesRemaining: number;
  proteinRemaining: number;

  // Today's activity (from HealthKit or hardcoded)
  stepsToday: number;
  sleepLastNight: number;
  activeMinutesToday: number;
  distanceToday: number;
  workoutsToday: number;

  // Scores
  todayScore: number;
  weeklyScore: number;
  avgScoreThisWeek: number;
  bestScoreThisWeek: number;
  loggingStreak: number;

  // Time context
  currentHour: number;
  currentMinute: number;
  timeOfDay: string;
  dayOfWeek: string;

  // Food history (last 7 days)
  recentFoods: string[];
  mostEatenFood: string;
  daysLoggedThisWeek: number;
  nextUpdateDate: string | null;
  createdAt?: string;
}

export function getOriginalMacros(item: any) {
  const defaultVal = {
    calories: item.calories || 0,
    protein_g: item.protein_g || 0,
    carbs_g: item.carbs_g || 0,
    fat_g: item.fat_g || 0
  };
  if (!item.roast_text) return defaultVal;
  const parts = item.roast_text.split(' ||| ');
  if (parts.length < 2) return defaultVal;
  
  const macroPart = parts[1];
  const macros: any = {};
  macroPart.split(';').forEach((p: string) => {
    const [key, val] = p.split(':');
    if (key && val) {
      macros[key.toLowerCase()] = parseFloat(val) || 0;
    }
  });
  
  return {
    calories: macros.original_calories !== undefined ? macros.original_calories : defaultVal.calories,
    protein_g: macros.original_protein !== undefined ? macros.original_protein : defaultVal.protein_g,
    carbs_g: macros.original_carbs !== undefined ? macros.original_carbs : defaultVal.carbs_g,
    fat_g: macros.original_fat !== undefined ? macros.original_fat : defaultVal.fat_g
  };
}

export function getCleanRoastText(roastText: string | null): string {
  if (!roastText) return '';
  return roastText.split(' ||| ')[0];
}

export async function buildUserContext(
  healthData?: {
    steps?: number;
    sleep?: number;
    activeMinutes?: number;
    distance?: number;
    workouts?: number;
  }
): Promise<UserContext | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const todayLocalStr = getLocalDateString(new Date());
  
  const localTodayStart = new Date();
  localTodayStart.setHours(0,0,0,0);
  const localTodayEnd = new Date();
  localTodayEnd.setHours(23,59,59,999);
  
  const localWeekStart = new Date();
  localWeekStart.setDate(localWeekStart.getDate() - 6);
  localWeekStart.setHours(0,0,0,0);
  const weekStartLocalStr = getLocalDateString(localWeekStart);

  // Fetch everything in parallel
  const [profileRes, todayLogsRes, weekLogsRes, weekScoresRes] = await Promise.all([
    supabase.from('users').select('*').eq('id', user.id).single(),
    supabase.from('food_logs')
      .select('calories, protein_g, carbs_g, fat_g, food_name, logged_at, roast_text')
      .eq('user_id', user.id)
      .gte('logged_at', localTodayStart.toISOString())
      .lte('logged_at', localTodayEnd.toISOString()),
    supabase.from('food_logs')
      .select('calories, protein_g, food_name, logged_at')
      .eq('user_id', user.id)
      .gte('logged_at', localWeekStart.toISOString()),
    supabase.from('health_scores')
      .select('score, date')
      .eq('user_id', user.id)
      .gte('date', weekStartLocalStr)
      .order('date', { ascending: false }),
  ],);

  const profile = profileRes.data;
  const todayLogs = (todayLogsRes.data || []).filter(f => !f.food_name?.startsWith('__reward_lock:'));
  const weekLogs = (weekLogsRes.data || []).filter(f => !f.food_name?.startsWith('__reward_lock:'));
  const weekScores = weekScoresRes.data || [];

  // Calculate today's nutrition using actual logged values
  const caloriesToday = todayLogs.reduce((sum, r) => sum + (r.calories || 0), 0);
  const proteinToday = todayLogs.reduce((sum, r) => sum + (r.protein_g || 0), 0);
  const carbsToday = todayLogs.reduce((sum, r) => sum + (r.carbs_g || 0), 0);
  const fatToday = todayLogs.reduce((sum, r) => sum + (r.fat_g || 0), 0);

  const weight_kg = profile?.weight_kg || 70;
  const userGoal = profile?.goal || 'maintain';
  const userLevel = profile?.level || 1;

  // Calculate age from birthday
  let age = profile?.age || null;
  if (profile?.birthday) {
    const birth = new Date(profile.birthday);
    const today = new Date();
    age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  }

  // Retrieve activity level with AsyncStorage fallback
  let activityLevel = profile?.activity_level;
  if (!activityLevel) {
    try {
      activityLevel = await AsyncStorage.getItem(`@user_activity_level_${user.id}`) || 'lightly_active';
    } catch (e) {
      activityLevel = 'lightly_active';
    }
  }

  // Calculate V2 goals
  let proteinMultiplier = 1.6;
  if (userGoal === 'build_muscle') {
    proteinMultiplier = 1.8;
  } else if (userGoal === 'lose_fat') {
    proteinMultiplier = 2.0;
  } else {
    proteinMultiplier = 1.6;
  }
  const calculatedProteinGoal = Math.round(weight_kg * proteinMultiplier);
  const proteinGoal = profile?.protein_goal_g || calculatedProteinGoal;

  const waterGoal = Math.round(weight_kg * 35);

  const stepsGoal = 10000; // Flat standard target globally

  let calorieGoal = profile?.calorie_goal;
  if (!calorieGoal || calorieGoal === 2000) {
    if (profile?.weight_kg && profile?.height_cm && age) {
      calorieGoal = calculateCalorieGoal({
        weightKg: profile.weight_kg,
        heightCm: profile.height_cm,
        age: age,
        gender: profile.gender || 'male',
        goal: userGoal,
        activityLevel: activityLevel
      });
      // Save it back to the database in background so it's persisted
      supabase.from('users').update({ calorie_goal: calorieGoal }).eq('id', user.id).then();
    } else {
      calorieGoal = 2000;
    }
  }

  // Calculate scores
  const todayScore = weekScores.find(s => s.date === todayLocalStr)?.score || 0;
  const weeklyScore = weekScores.reduce((sum, s) => sum + (s.score || 0), 0);
  const nonZeroScores = weekScores.filter(s => s.score > 0);
  const avgScore = nonZeroScores.length > 0
    ? Math.round(nonZeroScores.reduce((sum, s) => sum + s.score, 0) / nonZeroScores.length)
    : 0;
  const bestScore = weekScores.length > 0 ? Math.max(...weekScores.map(s => s.score)) : 0;

  // Calculate streak
  let streak = 0;
  for (let i = 0; i <= 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const localDateStr = getLocalDateString(d);
    const hasLog = weekLogs.some(f => f.logged_at && getLocalDateStringFromUtc(f.logged_at) === localDateStr);
    if (hasLog) streak++;
    else if (i > 0) break;
  }

  // Age already calculated above

  // Recent foods
  const recentFoods = weekLogs
    .map(f => f.food_name)
    .filter(Boolean)
    .slice(0, 20);

  const foodCounts: Record<string, number> = {};
  recentFoods.forEach(f => { foodCounts[f] = (foodCounts[f] || 0) + 1; });
  const mostEatenFood = Object.entries(foodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';

  const daysLoggedThisWeek = new Set(
    weekLogs.map(f => f.logged_at ? getLocalDateStringFromUtc(f.logged_at) : '')
  ).size;

  // Time context
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const timeOfDay = currentHour < 6 ? 'late night' :
    currentHour < 12 ? 'morning' :
    currentHour < 17 ? 'afternoon' :
    currentHour < 21 ? 'evening' : 'night';
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  return {
    userId: user.id,
    firstName: profile?.first_name || profile?.name?.split(' ')[0] || 'there',
    name: profile?.name || '',
    age,
    weight_kg: profile?.weight_kg || null,
    height_cm: profile?.height_cm || null,
    birthday: profile?.birthday || null,
    hasDiabetes: profile?.has_diabetes || false,
    goal: profile?.goal || 'maintain',
    calorieGoal,
    proteinGoal,
    waterGoal,
    stepsGoal,
    diet: profile?.diet || 'nonveg',
    cuisine: profile?.cuisine || 'both',
    caloriesToday: Math.round(caloriesToday),
    proteinToday: Math.round(proteinToday),
    carbsToday: Math.round(carbsToday),
    fatToday: Math.round(fatToday),
    mealsToday: todayLogs.length,
    waterToday: profile?.water_ml || 0,
    caloriesRemaining: Math.max(0, calorieGoal - caloriesToday),
    proteinRemaining: Math.max(0, proteinGoal - proteinToday),
    stepsToday: healthData?.steps || 0,
    sleepLastNight: healthData?.sleep || 0,
    activeMinutesToday: healthData?.activeMinutes || 0,
    distanceToday: healthData?.distance || 0,
    workoutsToday: healthData?.workouts || 0,
    todayScore,
    weeklyScore,
    avgScoreThisWeek: avgScore,
    bestScoreThisWeek: bestScore,
    loggingStreak: streak,
    currentHour,
    currentMinute,
    timeOfDay,
    dayOfWeek,
    recentFoods,
    mostEatenFood,
    daysLoggedThisWeek,
    nextUpdateDate: profile?.next_update_date || null,
    createdAt: profile?.created_at || '',
  };
}

export function getDaysUntilNextUpdate(nextUpdateDateStr: string | null): number {
  if (!nextUpdateDateStr) return 0;
  const nextUpdate = new Date(nextUpdateDateStr);
  const now = new Date();
  const diffMs = nextUpdate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 0;
  return Math.min(diffDays, 2); // Returns 0, 1, or 2
}

export function contextToPromptString(ctx: UserContext): string {
  return `
USER PROFILE:
- Name: ${ctx.firstName}
- Age: ${ctx.age || 'unknown'}
- Weight: ${ctx.weight_kg ? `${ctx.weight_kg}kg` : 'unknown'}
- Height: ${ctx.height_cm ? `${ctx.height_cm}cm` : 'unknown'}
- Goal: ${ctx.goal}
- Diet: ${ctx.diet}
- Cuisine: ${ctx.cuisine}
- Diabetes: ${ctx.hasDiabetes ? 'YES — avoid high sugar, prioritize low GI foods' : 'No'}

TODAY (${ctx.dayOfWeek}, ${ctx.timeOfDay}):
- Time: ${ctx.currentHour}:${ctx.currentMinute.toString().padStart(2, '0')}
- Calories: ${ctx.caloriesToday}/${ctx.calorieGoal} (${ctx.caloriesRemaining} remaining)
- Protein: ${ctx.proteinToday}g/${ctx.proteinGoal}g (${ctx.proteinRemaining}g remaining)
- Carbs: ${ctx.carbsToday}g | Fat: ${ctx.fatToday}g
- Meals logged: ${ctx.mealsToday}
- Steps: ${ctx.stepsToday || 'not tracked'}
- Sleep last night: ${ctx.sleepLastNight ? `${ctx.sleepLastNight} hours` : 'not tracked'}
- Active minutes: ${ctx.activeMinutesToday || 'not tracked'}
- Workouts today: ${ctx.workoutsToday}

PERFORMANCE:
- Today's health score: ${ctx.todayScore}/100
- Weekly score: ${ctx.weeklyScore}/700
- Avg score this week: ${ctx.avgScoreThisWeek}/100
- Best day this week: ${ctx.bestScoreThisWeek}/100
- Logging streak: ${ctx.loggingStreak} days
- Days logged this week: ${ctx.daysLoggedThisWeek}/7

FOOD HISTORY (last 7 days):
- Most eaten: ${ctx.mostEatenFood || 'nothing yet'}
- Recent foods: ${ctx.recentFoods.slice(0, 10).join(', ') || 'none'}
`.trim();
}

export interface ScoreBreakdownItem {
  category: string;
  points: number;
  max: number;
  tip: string;
}

export interface ScoreBreakdownResult {
  total: number;
  breakdown: ScoreBreakdownItem[];
}

export function getScoreBreakdown(
  calories: number,
  protein: number,
  mealsLogged: number,
  steps: number,
  sleepHours: number,
  activeMinutes: number
): ScoreBreakdownResult {
  const result = calculateHealthScore({
    caloriesToday: calories,
    calorieGoal: 2000,
    proteinToday: protein,
    proteinGoal: 150,
    mealsToday: mealsLogged,
    currentHour: new Date().getHours(),
    stepsToday: steps,
    stepsTracked: true, // Legacy compatibility assumes tracked
    workoutMinutesToday: 0,
    activeMinutesToday: activeMinutes,
    activeMinutesTracked: true,
    sleepHoursLastNight: sleepHours,
    sleepTracked: sleepHours > 0
  });

  return {
    total: result.totalScore,
    breakdown: [
      { category: 'Steps', points: result.breakdown.steps.score, max: result.breakdown.steps.max, tip: result.breakdown.steps.reason },
      { category: 'Sleep', points: result.breakdown.sleepDuration.score + result.breakdown.sleepConsistency.score, max: 30, tip: result.breakdown.sleepDuration.reason },
      { category: 'Protein', points: result.breakdown.protein.score, max: result.breakdown.protein.max, tip: result.breakdown.protein.reason },
      { category: 'Meals', points: result.breakdown.mealDistribution.score, max: result.breakdown.mealDistribution.max, tip: result.breakdown.mealDistribution.reason },
      { category: 'Activity', points: result.breakdown.workout.score + result.breakdown.activeMinutes.score, max: 20, tip: result.breakdown.workout.reason },
      { category: 'Bonus', points: 0, max: 10, tip: "Hydration tracking coming soon — stay tuned!" }
    ]
  };
}

export interface Badge {
  id: string;
  name: string;
  emoji: string;
  unlockedAt: string;
  description: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  rarityText: string;
}

export async function getUserBadges(userId: string): Promise<Badge[]> {
  const today = getLocalDateString(new Date());
  
  // Fetch user profile for personalized thresholds
  const { data: profile } = await supabase
    .from('users')
    .select('weight_kg, goal, protein_goal_g')
    .eq('id', userId)
    .single();

  const weight = profile?.weight_kg || 70;
  let proteinMultiplier = 1.6;
  if (profile?.goal === 'build_muscle') {
    proteinMultiplier = 1.8;
  } else if (profile?.goal === 'lose_fat') {
    proteinMultiplier = 2.0;
  } else {
    proteinMultiplier = 1.6;
  }
  const proteinGoal = profile?.protein_goal_g || Math.round(weight * proteinMultiplier);

  // 1. Fetch completed challenges from challenge_participations_v2
  const { data: dbParticipations } = await supabase
    .from('challenge_participations_v2')
    .select('*, challenge:challenges_v2(*)')
    .eq('user_id', userId)
    .eq('status', 'COMPLETED');
  
  const completedChallenges = dbParticipations || [];

  // 2. Fetch food logs for perfect day count and protein streak calculation
  const { data: allFoodLogs } = await supabase
    .from('food_logs')
    .select('protein_g, logged_at, food_name')
    .eq('user_id', userId)
    .order('logged_at', { ascending: true });

  // 3. Fetch health scores for steps streak calculation
  const { data: stepScores } = await supabase
    .from('health_scores')
    .select('date, steps')
    .eq('user_id', userId)
    .order('date', { ascending: true });

  const badges: Badge[] = [];

  // Calculation A: Perfect Days Count
  const perfectDayLogs = (allFoodLogs || []).filter(f => f.food_name === '__reward_lock:perfect_day');
  const perfectDaysCount = perfectDayLogs.length;

  // Calculation B: Max 10K Steps Streak
  let maxStepsStreak = 0;
  if (stepScores && stepScores.length > 0) {
    let currentStepsStreak = 0;
    let prevDate: Date | null = null;
    
    for (const record of stepScores) {
      if (record.steps >= 10000) {
        if (prevDate === null) {
          currentStepsStreak = 1;
        } else {
          const diffTime = Math.abs(new Date(record.date).getTime() - prevDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            currentStepsStreak++;
          } else if (diffDays > 1) {
            currentStepsStreak = 1;
          }
        }
        prevDate = new Date(record.date);
        if (currentStepsStreak > maxStepsStreak) {
          maxStepsStreak = currentStepsStreak;
        }
      } else {
        currentStepsStreak = 0;
        prevDate = null;
      }
    }
  }

  // Calculation C: Max Protein Streak (consecutive days hitting protein goal)
  let maxProteinStreak = 0;
  if (allFoodLogs && allFoodLogs.length > 0) {
    const proteinByDate: Record<string, number> = {};
    allFoodLogs.forEach(log => {
      if (log.food_name?.startsWith('__reward_lock:')) return;
      const dStr = getLocalDateStringFromUtc(log.logged_at);
      proteinByDate[dStr] = (proteinByDate[dStr] || 0) + (log.protein_g || 0);
    });

    const sortedDates = Object.keys(proteinByDate).sort();
    let currentProteinStreak = 0;
    let prevDate: Date | null = null;

    for (const dStr of sortedDates) {
      if (proteinByDate[dStr] >= proteinGoal) {
        if (prevDate === null) {
          currentProteinStreak = 1;
        } else {
          const diffTime = Math.abs(new Date(dStr).getTime() - prevDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            currentProteinStreak++;
          } else if (diffDays > 1) {
            currentProteinStreak = 1;
          }
        }
        prevDate = new Date(dStr);
        if (currentProteinStreak > maxProteinStreak) {
          maxProteinStreak = currentProteinStreak;
        }
      } else {
        currentProteinStreak = 0;
        prevDate = null;
      }
    }
  }

  // Calculation D: Max Missions Streak (consecutive perfect days)
  let maxMissionsStreak = 0;
  if (perfectDayLogs.length > 0) {
    const sortedPerfectDates = perfectDayLogs.map(f => getLocalDateStringFromUtc(f.logged_at)).sort();
    let currentMissionsStreak = 0;
    let prevDate: Date | null = null;
    
    for (const dStr of sortedPerfectDates) {
      if (prevDate === null) {
        currentMissionsStreak = 1;
      } else {
        const diffTime = Math.abs(new Date(dStr).getTime() - prevDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          currentMissionsStreak++;
        } else if (diffDays > 1) {
          currentMissionsStreak = 1;
        }
      }
      prevDate = new Date(dStr);
      if (currentMissionsStreak > maxMissionsStreak) {
        maxMissionsStreak = currentMissionsStreak;
      }
    }
  }

  // Dev Tool Logging
  console.log("-----------------------------------------");
  console.log(`[DEV TOOL] Dynamic badge stats for user ${userId}:`);
  console.log(`- Perfect Days Count: ${perfectDaysCount} (Target: 25)`);
  console.log(`- Max 10K Steps Streak: ${maxStepsStreak} days (Target: 15)`);
  console.log(`- Max Protein Streak: ${maxProteinStreak} days (Target: 25, Goal: ${proteinGoal}g)`);
  console.log(`- Max Missions Streak: ${maxMissionsStreak} days (Target: 7)`);
  console.log("-----------------------------------------");

  // Unlock check 1: Perfect Month Master (25 Perfect Days)
  const hasPerfectMonth = perfectDaysCount >= 25 || completedChallenges.some(p => p.challenge?.metric === 'perfect_day' && p.challenge?.type === 'monthly');
  if (hasPerfectMonth) {
    badges.push({
      id: 'perfect_month_master',
      name: 'Perfect Month Master',
      emoji: '🏆',
      unlockedAt: today,
      description: 'Achieve a perfect 25-day streak of daily scoring & logging goals',
      rarity: 'Legendary',
      rarityText: 'Monthly Challenge Achievement'
    });
  }

  // Unlock check 2: 10K Endurance Titan -> 10K walk for 25 consecutive days
  const hasStepsStreak = maxStepsStreak >= 25 || completedChallenges.some(p => p.challenge?.metric === 'steps' && p.challenge?.type === 'monthly');
  if (hasStepsStreak) {
    badges.push({
      id: 'century_club_crusher',
      name: '10K Endurance Titan',
      emoji: '🏃‍♂️',
      unlockedAt: today,
      description: 'Complete 10k steps for 25 consecutive days',
      rarity: 'Legendary',
      rarityText: 'Monthly Walk Challenge Achievement'
    });
  }

  // Unlock check 3: Protein Master (25 consecutive days protein)
  const hasProteinStreak = maxProteinStreak >= 25 || completedChallenges.some(p => p.challenge?.metric === 'protein' && p.challenge?.type === 'monthly');
  if (hasProteinStreak) {
    badges.push({
      id: 'protein_streak_25',
      name: 'Protein Master',
      emoji: '🛡️',
      unlockedAt: today,
      description: 'Hit your daily protein target for 25 consecutive days',
      rarity: 'Epic',
      rarityText: 'Monthly Protein Challenge Achievement'
    });
  }

  // Unlock check 4: Mission Master (7 consecutive days complete all missions)
  const hasMissionsStreak = maxMissionsStreak >= 7 || completedChallenges.some(p => p.challenge?.type === 'weekly' || p.challenge?.metric === 'missions');
  if (hasMissionsStreak) {
    badges.push({
      id: 'savage_week_overlord',
      name: 'Savage Week Overlord',
      emoji: '⚡',
      unlockedAt: today,
      description: 'Score a perfect 100 on your health score for 7 consecutive days',
      rarity: 'Legendary',
      rarityText: 'Weekly Challenge Achievement'
    });
  }

  return badges;
}

export async function checkOnFireStatus(userId: string): Promise<boolean> {
  const badges = await getUserBadges(userId);
  return badges.some(b => b.id === 'on_fire');
}

export async function fetchOnFireStatuses(userIds: string[]): Promise<Record<string, boolean>> {
  const onFireMap: Record<string, boolean> = {};
  if (!userIds || userIds.length === 0) return {};

  await Promise.all(userIds.map(async (uid) => {
    onFireMap[uid] = await checkOnFireStatus(uid);
  }));

  return onFireMap;
}

export async function fetchUsersBadges(userIds: string[]): Promise<Record<string, Badge[]>> {
  const userBadgesMap: Record<string, Badge[]> = {};
  if (!userIds || userIds.length === 0) return {};

  await Promise.all(userIds.map(async (uid) => {
    userBadgesMap[uid] = await getUserBadges(uid);
  }));

  return userBadgesMap;
}

export function calculateCalorieGoal(params: {
  weightKg: number;
  heightCm: number;
  age: number;
  gender: string;
  goal: string;
  activityLevel?: string;
}): number {
  const genderLower = (params.gender || 'male').toLowerCase();
  let genderOffset = -78; // Midpoint between Male (+5) and Female (-161)
  if (genderLower === 'male') {
    genderOffset = 5;
  } else if (genderLower === 'female') {
    genderOffset = -161;
  }

  const bmr = (10 * params.weightKg) + (6.25 * params.heightCm) - (5 * params.age) + genderOffset;

  // Apply activity multiplier
  let multiplier = 1.375; // Default to Lightly Active
  const act = (params.activityLevel || 'lightly_active').toLowerCase().replace(/_/g, '');
  if (act === 'sedentary') {
    multiplier = 1.2;
  } else if (act === 'lightlyactive' || act === 'light') {
    multiplier = 1.375;
  } else if (act === 'moderatelyactive' || act === 'moderate') {
    multiplier = 1.55;
  } else if (act === 'veryactive' || act === 'very') {
    multiplier = 1.725;
  }

  const tdee = bmr * multiplier;

  let calorieTarget = tdee;
  const goalLower = (params.goal || 'maintain').toLowerCase();
  if (goalLower === 'build_muscle') {
    calorieTarget = tdee + 300;
  } else if (goalLower === 'lose_fat') {
    calorieTarget = tdee - 300;
  }

  // Round to nearest 50
  return Math.round(calorieTarget / 50) * 50;
}
