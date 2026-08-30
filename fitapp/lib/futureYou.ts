import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserContext, getLocalDateString, getLocalDateStringFromUtc } from './userContext';

export interface FutureProjection {
  generated_at: string;
  roast_generated_at?: string;
  future_direction: 'Improving' | 'Stable' | 'Declining';
  future_confidence: number;
  future_message: string;
  future_biggest_lever: string;
  future_biggest_lever_impact: string;
  future_biggest_lever_insight?: string;
  future_10day_outlook: 'Positive' | 'Neutral' | 'Negative';
  future_projection_data: {
    health_score_current: number;
    health_score_projected: number;
  };
  drivers: {
    status: 'success' | 'warning' | 'info';
    text: string;
  }[];
  isLocked?: boolean;
  progress?: number;
  dayName?: string;
  last_snapshot_metrics?: {
    calories: number;
    protein: number;
    steps: number;
    water: number;
  };
}

// Caching storage key
const CACHE_KEY_PREFIX = '@future_projection_';

/**
 * Checks if the user is currently in demo mode and returns the selected demo day, or null if demo mode is off.
 */
export async function getDemoModeState(userId: string): Promise<string | null> {
  try {
    // 1. Try to read from user-specific key
    let isEnabled = userId ? await AsyncStorage.getItem(`@future_you_demo_enabled_${userId}`) : null;
    let day = isEnabled === 'true' ? await AsyncStorage.getItem(`@future_you_demo_day_${userId}`) : null;

    // 2. No global fallback - sandbox is strictly user-specific
    if (isEnabled === 'true') {
      return day || 'day1';
    }
  } catch (e) {
    console.warn('Error reading demo mode state:', e);
  }
  return null;
}

/**
 * Sets the demo mode state in AsyncStorage.
 */
export async function setDemoModeState(userId: string, enabled: boolean, day: string): Promise<void> {
  try {
    const val = enabled ? 'true' : 'false';
    // Save to user-specific keys if userId is valid
    if (userId) {
      await AsyncStorage.setItem(`@future_you_demo_enabled_${userId}`, val);
      await AsyncStorage.setItem(`@future_you_demo_day_${userId}`, day);
    }
    // Always write to global keys to keep them synchronized
    await AsyncStorage.setItem('@future_you_demo_enabled_global', val);
    await AsyncStorage.setItem('@future_you_demo_day_global', day);
  } catch (e) {
    console.error('Error saving demo mode state:', e);
  }
}

/**
 * Returns hardcoded realistic projection values for testing layouts and animations in Demo Mode.
 */
export function getDemoProjection(day: string, firstName: string): FutureProjection & { dayName: string; isLocked: boolean; isReveal: boolean; progress: number; observation: string } {
  const defaultUser = firstName || 'Trainer';
  
  switch (day) {
    case 'day1':
      return {
        dayName: 'Day 1 of 7',
        isLocked: true,
        isReveal: false,
        progress: 1 / 7,
        observation: `Welcome, ${defaultUser}! We are learning your habits. Protein consistency starts today.`,
        generated_at: new Date().toISOString().split('T')[0],
        future_direction: 'Stable',
        future_confidence: 50,
        future_message: 'Future You is watching. Try not to ruin Day 1. (Spoilers: you probably will)',
        future_biggest_lever: 'Complete 7 days of logging',
        future_biggest_lever_impact: '+10 Score',
        future_10day_outlook: 'Neutral',
        future_projection_data: { health_score_current: 0, health_score_projected: 0 },
        drivers: [{ status: 'info', text: 'Day 1: Establishing habit baselines' }]
      };
    case 'day2':
      return {
        dayName: 'Day 2 of 7',
        isLocked: true,
        isReveal: false,
        progress: 2 / 7,
        observation: "We've already noticed your protein intake is more consistent than your water intake.",
        generated_at: new Date().toISOString().split('T')[0],
        future_direction: 'Stable',
        future_confidence: 52,
        future_message: "Day 2. Still tracking? Impressive. Let's see if you can survive the weekend without a pizza breakdown.",
        future_biggest_lever: 'Drink more water',
        future_biggest_lever_impact: '+3 Score',
        future_10day_outlook: 'Neutral',
        future_projection_data: { health_score_current: 0, health_score_projected: 0 },
        drivers: [{ status: 'info', text: 'Day 2: Protein consistency is active' }]
      };
    case 'day3':
      return {
        dayName: 'Day 3 of 7',
        isLocked: true,
        isReveal: false,
        progress: 3 / 7,
        observation: "You've hit your protein goal once. Technically that's a streak.",
        generated_at: new Date().toISOString().split('T')[0],
        future_direction: 'Stable',
        future_confidence: 55,
        future_message: "Day 3. You're actually still here. Future You is moderately surprised, but keeping expectations low.",
        future_biggest_lever: 'Hit protein target again',
        future_biggest_lever_impact: '+4 Score',
        future_10day_outlook: 'Neutral',
        future_projection_data: { health_score_current: 0, health_score_projected: 0 },
        drivers: [{ status: 'info', text: 'Day 3: Protein streak has begun' }]
      };
    case 'day4':
      return {
        dayName: 'Day 4 of 7',
        isLocked: true,
        isReveal: false,
        progress: 4 / 7,
        observation: "Your couch is wondering why you're walking so much.",
        generated_at: new Date().toISOString().split('T')[0],
        future_direction: 'Stable',
        future_confidence: 58,
        future_message: 'Logging is easy. Actually moving is hard. Walk, you lazy potato.',
        future_biggest_lever: 'Maintain daily steps',
        future_biggest_lever_impact: '+5 Score',
        future_10day_outlook: 'Neutral',
        future_projection_data: { health_score_current: 0, health_score_projected: 0 },
        drivers: [{ status: 'info', text: 'Day 4: Step logging is consistent' }]
      };
    case 'day5':
      return {
        dayName: 'Day 5 of 7',
        isLocked: true,
        isReveal: false,
        progress: 5 / 7,
        observation: "Calories have been surprisingly cooperative.",
        generated_at: new Date().toISOString().split('T')[0],
        future_direction: 'Stable',
        future_confidence: 60,
        future_message: "Almost a week. Future You is holding their breath. Please don't ruin it with a cookie binge.",
        future_biggest_lever: 'Log all meals',
        future_biggest_lever_impact: '+5 Score',
        future_10day_outlook: 'Neutral',
        future_projection_data: { health_score_current: 0, health_score_projected: 0 },
        drivers: [{ status: 'info', text: 'Day 5: Calorie targets cooperating' }]
      };
    case 'day6':
      return {
        dayName: 'Day 6 of 7',
        isLocked: true,
        isReveal: false,
        progress: 6 / 7,
        observation: "One more day and Future You will have enough data.",
        generated_at: new Date().toISOString().split('T')[0],
        future_direction: 'Stable',
        future_confidence: 62,
        future_message: 'One more day. Do not ruin the entire week with a midnight freezer raid tonight.',
        future_biggest_lever: 'Complete tomorrow\'s log',
        future_biggest_lever_impact: '+8 Score',
        future_10day_outlook: 'Neutral',
        future_projection_data: { health_score_current: 0, health_score_projected: 0 },
        drivers: [{ status: 'info', text: 'Day 6: Finalizing data compile' }]
      };
    case 'day7':
      return {
        dayName: 'Profile Ready!',
        isLocked: false,
        isReveal: true,
        progress: 1.0,
        observation: "Congratulations! Future You has completed calculations.",
        generated_at: new Date().toISOString().split('T')[0],
        future_direction: 'Improving',
        future_confidence: 68,
        future_message: "7 days logged. Future You is officially less annoyed with you. For now.",
        future_biggest_lever: 'Improve Sleep Duration',
        future_biggest_lever_impact: '+5 Future Score',
        future_biggest_lever_insight: 'Your future self is begging you to go to bed before 2 AM.',
        future_10day_outlook: 'Positive',
        future_projection_data: {
          health_score_current: 64,
          health_score_projected: 72
        },
        drivers: [
          { status: 'success', text: 'Protein target hit 6 of last 7 days' },
          { status: 'success', text: 'Calories mostly on target' },
          { status: 'success', text: 'Activity improving' },
          { status: 'warning', text: 'Sleep data unavailable' }
        ]
      };
    case 'day8':
      return {
        dayName: 'Day 8 Unlocked',
        isLocked: false,
        isReveal: false,
        progress: 1.0,
        observation: '',
        generated_at: new Date().toISOString().split('T')[0],
        future_direction: 'Improving',
        future_confidence: 74,
        future_message: "Your protein is actually doing something. Shocking, I know.",
        future_biggest_lever: 'Improve Sleep',
        future_biggest_lever_impact: '+5 Future Score',
        future_biggest_lever_insight: 'Sleep is the cheat code for muscle recovery. Use it.',
        future_10day_outlook: 'Positive',
        future_projection_data: {
          health_score_current: 64,
          health_score_projected: 72
        },
        drivers: [
          { status: 'success', text: 'Protein target hit 6 of last 7 days' },
          { status: 'success', text: 'Calories mostly on target' },
          { status: 'success', text: 'Activity improving' },
          { status: 'warning', text: 'Sleep data unavailable' }
        ]
      };
    case 'day14':
      return {
        dayName: 'Day 14',
        isLocked: false,
        isReveal: false,
        progress: 1.0,
        observation: '',
        generated_at: new Date().toISOString().split('T')[0],
        future_direction: 'Improving',
        future_confidence: 82,
        future_message: "Two weeks of logging. Future You is starting to believe you might actually have discipline.",
        future_biggest_lever: 'Reduce Calorie Overages',
        future_biggest_lever_impact: '+6 Future Score',
        future_10day_outlook: 'Positive',
        future_projection_data: {
          health_score_current: 68,
          health_score_projected: 78
        },
        drivers: [
          { status: 'success', text: 'Protein hit 12 of last 14 days' },
          { status: 'success', text: 'Sleep connected & averaging 7.2h' },
          { status: 'warning', text: 'Caffeine after 2 PM increases likelihood of poor sleep by 43%' },
          { status: 'warning', text: 'Calorie logging has 2 overages' }
        ]
      };
    case 'day30':
    default:
      return {
        dayName: 'Day 30',
        isLocked: false,
        isReveal: false,
        progress: 1.0,
        observation: '',
        generated_at: new Date().toISOString().split('T')[0],
        future_direction: 'Improving',
        future_confidence: 91,
        future_message: "Cookies lost, steps won. Future You is almost proud. Don't make them regret saying that.",
        future_biggest_lever: 'Increase Protein Consistency',
        future_biggest_lever_impact: '+4 Future Score',
        future_10day_outlook: 'Positive',
        future_projection_data: {
          health_score_current: 74,
          health_score_projected: 85
        },
        drivers: [
          { status: 'success', text: 'Consistent food logging 28 of 30 days' },
          { status: 'success', text: 'Protein target met 25 of 30 days' },
          { status: 'success', text: 'High protein breakfasts correlate with 15% higher activity scores' },
          { status: 'success', text: 'Sleep averaging 7.6 hours daily' }
        ]
      };
  }
}

/**
 * Counts unique dates in health_scores to verify if the user is unlocked.
 */
export async function getTrackedDaysCount(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('health_scores')
      .select('date')
      .eq('user_id', userId);
    
    if (error) throw error;
    if (!data || data.length === 0) return 0;
    
    // Count unique dates
    const uniqueDates = new Set(data.map(d => d.date));
    return uniqueDates.size;
  } catch (err) {
    console.warn('Error fetching tracked days count from Supabase:', err);
    // Local fallback
    try {
      const cachedScores = await AsyncStorage.getItem(`@health_scores_local_${userId}`);
      if (cachedScores) {
        const scores = JSON.parse(cachedScores);
        return new Set(scores.map((s: any) => s.date)).size;
      }
    } catch (e) {}
    return 0;
  }
}

/**
 * Main engine function to compute mathematical scores, request Gemini roasts/levers, and cache.
 */
export async function fetchFutureYouData(
  userId: string,
  ctx: UserContext,
  forceRefresh = false
): Promise<FutureProjection> {
  const todayStr = getLocalDateString(new Date());
  const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;

  // 1. Check Demo Mode Override first
  const demoDay = await getDemoModeState(userId);
  if (demoDay) {
    console.log(`fetchFutureYouData: Demo mode active. Returning ${demoDay} simulation.`);
    return getDemoProjection(demoDay, ctx.firstName);
  }

  // 2. Try Cache
  let cachedData: FutureProjection | null = null;
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      cachedData = JSON.parse(cached) as FutureProjection;
    }
  } catch (e) {
    console.warn('Error reading from AsyncStorage cache:', e);
  }

  let isDailyCacheValid = false;
  let isRoastCacheValid = false;

  if (cachedData) {
    // Check if the daily calculation was done today (local calendar day)
    isDailyCacheValid = cachedData.generated_at === todayStr;
    if (isDailyCacheValid) {
      const nowTime = Date.now();
      const lastRoastTime = new Date(cachedData.roast_generated_at || cachedData.generated_at).getTime();
      
      // 2 hours time-based limit (allows up to 12 updates a day)
      const twoHoursMs = 2 * 60 * 60 * 1000;
      isRoastCacheValid = !isNaN(lastRoastTime) && (nowTime - lastRoastTime < twoHoursMs);
      
      // 15 minutes absolute cooldown (prevents spamming on every screen tap/step)
      const fifteenMinutesMs = 15 * 60 * 1000;
      const isWithinCooldown = !isNaN(lastRoastTime) && (nowTime - lastRoastTime < fifteenMinutesMs);

      // Check if user is active (metrics changed significantly since last snapshot)
      let hasSignificantActivityChange = false;
      const snapshot = cachedData.last_snapshot_metrics;
      if (snapshot) {
        // Dynamic thresholds based on goals (scales down if targets are small)
        const calorieThreshold = Math.max(100, Math.round((ctx.calorieGoal || 2000) * 0.10));
        const proteinThreshold = Math.max(10, Math.round((ctx.proteinGoal || 150) * 0.15));
        const stepsThreshold = Math.max(1000, Math.round((ctx.stepsGoal || 10000) * 0.15));
        const waterThreshold = Math.max(250, Math.round((ctx.waterGoal || 2000) * 0.25));

        const calDiff = Math.abs(ctx.caloriesToday - (snapshot.calories || 0));
        const proteinDiff = Math.abs(ctx.proteinToday - (snapshot.protein || 0));
        const stepsDiff = Math.abs(ctx.stepsToday - (snapshot.steps || 0));
        const waterDiff = Math.abs(ctx.waterToday - (snapshot.water || 0));

        if (calDiff >= calorieThreshold || 
            proteinDiff >= proteinThreshold || 
            stepsDiff >= stepsThreshold || 
            waterDiff >= waterThreshold) {
          hasSignificantActivityChange = true;
        }
      } else {
        // Self-healing: if no snapshot exists (old cache), trigger a refresh once to populate it
        hasSignificantActivityChange = true;
      }

      // Auto-invalidate if the cache contains mock data but demo mode is inactive
      const isMockCache = cachedData.future_projection_data?.health_score_current === 64 && 
                          cachedData.future_projection_data?.health_score_projected === 72 &&
                          cachedData.future_biggest_lever === 'Improve Sleep';
                          
      if (isMockCache && !demoDay) {
        console.log('fetchFutureYouData: Invalidation triggered. Cached data is mock but demo mode is inactive.');
        isDailyCacheValid = false;
        isRoastCacheValid = false;
      }
      
      // Return cache if within cooldown, or if cache is still valid and no significant activity changes
      if (!forceRefresh) {
        if (isWithinCooldown) {
          console.log('fetchFutureYouData: Within 15-minute cooldown. Returning cached daily projection.');
          return cachedData;
        }
        if (isRoastCacheValid && !hasSignificantActivityChange) {
          console.log('fetchFutureYouData: Cache is valid and no significant activity change. Returning cached daily projection.');
          return cachedData;
        }
        console.log('fetchFutureYouData: Cache invalidated due to 2hr expiry or significant activity change. Re-generating...');
      }
    }
  }

  console.log('fetchFutureYouData: Cache miss or force refreshed. Checking lock status and generating daily forecast...');

  // Fetch user created_at and food logs to calculate daysSinceSignup & check activity
  let daysSinceSignup = 1;
  let hasFoodLogs = false;
  let foodLogsCount = 0;
  let foodLogs: any[] = [];
  try {
    const [userProfileRes, foodLogsRes] = await Promise.all([
      supabase
        .from('users')
        .select('created_at')
        .eq('id', userId)
        .single(),
      supabase
        .from('food_logs')
        .select('calories, protein_g, logged_at, food_name')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
    ]);

    const userProfile = userProfileRes.data;
    const signupDateStr = userProfile?.created_at;
    if (signupDateStr) {
      const start = new Date(signupDateStr);
      const end = new Date();
      start.setHours(0,0,0,0);
      end.setHours(0,0,0,0);
      const diffTime = end.getTime() - start.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      daysSinceSignup = Math.max(1, diffDays);
    }

    const rawFetchedLogs = foodLogsRes.data || [];
    foodLogs = rawFetchedLogs.filter(f => !f.food_name?.startsWith('__reward_lock:'));
    foodLogsCount = foodLogs.length;
    hasFoodLogs = foodLogsCount > 0;
  } catch (err) {
    console.warn('Error fetching user created_at or food logs in fetchFutureYouData:', err);
  }

  const isLocked = daysSinceSignup < 7;

  if (isLocked) {
    const progress = Math.min(1.0, daysSinceSignup / 7);
    const dayName = `Day ${daysSinceSignup} of 7`;
    
    let futureMessage = 'Future You is watching. Try not to ruin Day 1.';
    let futureBiggestLever = 'Complete 7 days of logging';
    let futureBiggestLeverImpact = '+10 Score';
    let driversList: { status: 'success' | 'warning' | 'info'; text: string }[] = [];

    if (!hasFoodLogs) {
      futureBiggestLever = 'Log your first food entry';
      futureBiggestLeverImpact = '+15 Score';
      driversList = [{ status: 'warning', text: `0 meals tracked since signup (Day ${daysSinceSignup})` }];
      
      switch (daysSinceSignup) {
        case 1:
          futureMessage = 'Signed up today and logged absolutely nothing. Off to a stellar start, champion.';
          break;
        case 2:
          futureMessage = "Day 2: Still zero logs. Future You is wondering if you think food calories don't count if you don't type them.";
          break;
        case 3:
          futureMessage = 'Three days in and zero logs. Your diet must be a top-secret state secret. Open the logger.';
          break;
        case 4:
          futureMessage = 'Day 4 of absolute silence. Are you photosynthesizing, or is the log button too heavy to tap?';
          break;
        case 5:
          futureMessage = 'Day 5, empty logs. Future You is currently looking like a skeleton. Eat and log it.';
          break;
        case 6:
        default:
          futureMessage = 'Almost a week since signup and not a single food logged. Truly a masterclass in doing nothing.';
          break;
      }
    } else {
      const proteinGoalVal = ctx.proteinGoal || 130;
      const calorieGoalVal = ctx.calorieGoal || 2000;
      
      // Group by local date string
      const dailyTotals: Record<string, { protein: number; calories: number }> = {};
      foodLogs.forEach(l => {
        if (!l.logged_at) return;
        const d = getLocalDateStringFromUtc(l.logged_at);
        if (!dailyTotals[d]) dailyTotals[d] = { protein: 0, calories: 0 };
        dailyTotals[d].protein += l.protein_g || 0;
        dailyTotals[d].calories += l.calories || 0;
      });
      
      const daysMetProtein = Object.values(dailyTotals).filter(d => d.protein >= proteinGoalVal).length;
      const daysLogged = Object.keys(dailyTotals).length;
      
      if (daysMetProtein > 0) {
        futureBiggestLever = 'Hit protein target again';
        futureBiggestLeverImpact = '+4 Score';
        driversList = [
          { status: 'success', text: `Protein target hit ${daysMetProtein} of ${daysLogged} days logged` }
        ];
      } else {
        futureBiggestLever = 'Hit protein target for the first time';
        futureBiggestLeverImpact = '+5 Score';
        driversList = [
          { status: 'info', text: `Logged ${foodLogsCount} meals across ${daysLogged} days (No protein goals hit yet)` }
        ];
      }

      // Add a status about general consistency
      if (daysLogged >= 3) {
        driversList.push({ status: 'success', text: `Logged food consistently on ${daysLogged} days` });
      } else {
        driversList.push({ status: 'info', text: `Tracked food on ${daysLogged} days (Establishing baseline)` });
      }

      switch (daysSinceSignup) {
        case 1:
          futureMessage = 'Day 1. You logged something. Do you want a gold star or should we wait for you to quit tomorrow?';
          break;
        case 2:
          futureMessage = "Day 2. Still tracking? Outstanding. Let's see if you can survive the weekend without a pizza breakdown.";
          break;
        case 3:
          futureMessage = "Day 3. You're actually still here. Future You is moderately surprised, but keeping expectations extremely low.";
          break;
        case 4:
          futureMessage = 'Day 4. Logging is easy, but actually hitting your targets seems to be a math problem you can\'t solve yet.';
          break;
        case 5:
          futureMessage = "Day 5. Almost a week of logs. Don't get cocky, we all know you're one bad day away from a cookie binge.";
          break;
        case 6:
        default:
          futureMessage = 'Day 6. One more day. For the love of health, do not ruin this streak with a midnight freezer raid tonight.';
          break;
      }
    }

    const finalProjection: FutureProjection = {
      generated_at: todayStr,
      future_direction: 'Stable',
      future_confidence: 50 + daysSinceSignup * 2,
      future_message: futureMessage,
      future_biggest_lever: futureBiggestLever,
      future_biggest_lever_impact: futureBiggestLeverImpact,
      future_10day_outlook: 'Neutral',
      future_projection_data: {
        health_score_current: 0,
        health_score_projected: 0
      },
      drivers: driversList,
      isLocked: true,
      progress,
      dayName
    };

    // Save to Cache
    try {
      await AsyncStorage.setItem(cacheKey, JSON.stringify(finalProjection));
    } catch (e) {}

    return finalProjection;
  }


  // 3. Mathematical Engine Calculations (Progressively scale from 7 to 15 days)
  const evaluationDays = Math.min(15, daysSinceSignup);
  const evaluationDaysAgo = new Date();
  evaluationDaysAgo.setDate(evaluationDaysAgo.getDate() - (evaluationDays - 1));
  evaluationDaysAgo.setHours(0,0,0,0);
  const startStr = getLocalDateString(evaluationDaysAgo);

  // Fetch past logs & scores in parallel
  const [scoresRes, logsRes] = await Promise.all([
    supabase
      .from('health_scores')
      .select('score, date, sleep_score, activity_score, nutrition_score')
      .eq('user_id', userId)
      .gte('date', startStr)
      .order('date', { ascending: false }),
    supabase
      .from('food_logs')
      .select('calories, protein_g, logged_at, food_name')
      .eq('user_id', userId)
      .gte('logged_at', evaluationDaysAgo.toISOString()),
  ]);

  const scores = scoresRes.data || [];
  const rawLogs = logsRes.data || [];
  const logs = rawLogs.filter(f => !f.food_name?.startsWith('__reward_lock:'));

  // Determine tracked days (dates where user has logged food OR has a recorded health score)
  const trackedDates = new Set<string>();
  scores.forEach(s => trackedDates.add(s.date));
  logs.forEach(l => {
    if (l.logged_at) trackedDates.add(l.logged_at ? getLocalDateStringFromUtc(l.logged_at) : '');
  });

  const trackedDaysCount = trackedDates.size || 1; // avoid divide by zero

  // A. Protein Adherence (25% weight or 27.5% if no sleep)
  let proteinMetDays = 0;
  let caloriesMetDays = 0;
  let proteinTargetVal = ctx.proteinGoal || 130;
  let calorieTargetVal = ctx.calorieGoal || 2000;
  
  // Group food logs by date
  const foodLogsByDate: Record<string, { protein: number; calories: number; items: string[] }> = {};
  logs.forEach(log => {
    if (!log.logged_at) return;
    const dStr = getLocalDateStringFromUtc(log.logged_at);
    if (!foodLogsByDate[dStr]) {
      foodLogsByDate[dStr] = { protein: 0, calories: 0, items: [] };
    }
    foodLogsByDate[dStr].protein += log.protein_g || 0;
    foodLogsByDate[dStr].calories += log.calories || 0;
    if (log.food_name) {
      const logTime = new Date(log.logged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      foodLogsByDate[dStr].items.push(`${log.food_name} at ${logTime}`);
    }
  });

  // Calculate day-by-date adherences
  let calorieAdherenceSum = 0;
  let calorieTrackedDays = 0;
  let proteinTrackedDays = 0;

  Object.entries(foodLogsByDate).forEach(([dateStr, macros]) => {
    // Protein Adherence
    proteinTrackedDays++;
    if (macros.protein >= proteinTargetVal) {
      proteinMetDays++;
    }

    // Calorie Adherence
    calorieTrackedDays++;
    const userGoal = ctx.goal || 'maintain';
    const cals = macros.calories;
    const target = calorieTargetVal;
    
    let dayCalorieScore = 50; // default medium
    if (userGoal === 'lose_fat') {
      if (cals <= target) {
        dayCalorieScore = 100;
      } else {
        dayCalorieScore = Math.max(0, 100 - ((cals - target) / target) * 200);
      }
    } else if (userGoal === 'build_muscle') {
      if (cals >= target - 100 && cals <= target + 300) {
        dayCalorieScore = 100;
      } else {
        const diff = cals < target ? target - cals : cals - (target + 300);
        dayCalorieScore = Math.max(0, 100 - (diff / target) * 200);
      }
    } else { // Maintain
      const diff = Math.abs(cals - target);
      if (diff <= 150) {
        dayCalorieScore = 100;
      } else {
        dayCalorieScore = Math.max(0, 100 - ((diff - 150) / target) * 200);
      }
    }
    calorieAdherenceSum += dayCalorieScore;
  });

  const proteinAdherence = proteinTrackedDays > 0 ? (proteinMetDays / proteinTrackedDays) * 100 : 0;
  const calorieAdherence = calorieTrackedDays > 0 ? (calorieAdherenceSum / calorieTrackedDays) : 0;

  // B. Activity Adherence (20%)
  // Evaluate activity scores (max 30 pts) in past week
  let activityScoresSum = 0;
  scores.forEach(s => {
    activityScoresSum += s.activity_score || 0;
  });
  const activityAdherence = scores.length > 0 ? ((activityScoresSum / (scores.length * 30)) * 100) : 0;

  // C. Health Score Trend (15%)
  // Compare early average vs late average
  let first3Sum = 0;
  let first3Count = 0;
  let last3Sum = 0;
  let last3Count = 0;

  const sortedScores = [...scores].sort((a, b) => a.date.localeCompare(b.date)); // chronological
  sortedScores.forEach((s, idx) => {
    if (idx < 3) {
      first3Sum += s.score || 0;
      first3Count++;
    }
    if (idx >= sortedScores.length - 3) {
      last3Sum += s.score || 0;
      last3Count++;
    }
  });

  const recentAvg = first3Count > 0 ? first3Sum / first3Count : 0;
  const firstAvg = last3Count > 0 ? last3Sum / last3Count : 0;
  const healthScoreTrend = Math.max(0, Math.min(100, 50 + (recentAvg - firstAvg) * 5));

  // D. Consistency (10%)
  const consistency = (trackedDaysCount / evaluationDays) * 100;

  // E. Sleep (5% or reallocated if missing)
  const daysWithSleep = scores.filter(s => s.sleep_score && s.sleep_score > 0);
  const sleepAvailable = daysWithSleep.length > 0;
  let sleepAdherence = 0;
  if (sleepAvailable) {
    const sleepSum = daysWithSleep.reduce((sum, s) => sum + (s.sleep_score || 0), 0);
    sleepAdherence = (sleepSum / (daysWithSleep.length * 25)) * 100; // max sleep is 25
  }

  // Adjust Weights if sleep is unavailable
  const proteinWeight = sleepAvailable ? 0.25 : 0.275;
  const calorieWeight = sleepAvailable ? 0.25 : 0.275;
  const activityWeight = 0.20;
  const trendWeight = 0.15;
  const consistencyWeight = 0.10;
  const sleepWeight = sleepAvailable ? 0.05 : 0.0;

  const futureScore = Math.round(
    proteinAdherence * proteinWeight +
    calorieAdherence * calorieWeight +
    activityAdherence * activityWeight +
    healthScoreTrend * trendWeight +
    consistency * consistencyWeight +
    sleepAdherence * sleepWeight
  );

  // Confidence calculation
  const totalTrackedDaysAllTime = await getTrackedDaysCount(userId);
  let baseConfidence = 55;
  if (totalTrackedDaysAllTime < 14) {
    baseConfidence = 55 + Math.min(10, (totalTrackedDaysAllTime - 7) * 1.5);
  } else if (totalTrackedDaysAllTime < 30) {
    baseConfidence = 65 + Math.min(15, (totalTrackedDaysAllTime - 14) * 1.0);
  } else {
    baseConfidence = 80 + Math.min(15, (totalTrackedDaysAllTime - 30) * 0.5);
  }

  let confidenceModifiers = 0;
  if (sleepAvailable) confidenceModifiers += 5;
  else confidenceModifiers -= 5;
  if (ctx.weight_kg && ctx.weight_kg !== 70) confidenceModifiers += 5;
  if (consistency >= 85) confidenceModifiers += 5;

  // 5. Build/Lock Projections & Directions
  let direction: 'Improving' | 'Stable' | 'Declining' = 'Stable';
  let outlook: 'Positive' | 'Neutral' | 'Negative' = 'Neutral';
  let projectedHealth = 50;
  let currentHealthScore = 50;
  let confidence = 50;
  let driversList: { status: 'success' | 'warning' | 'info'; text: string }[] = [];
  let futureBiggestLever = 'Improve Sleep';
  let futureBiggestLeverImpact = '+5 Future Score';

  if (isDailyCacheValid && cachedData) {
    // Lock and reuse the exact scores, drivers, and lever from today's daily cache
    direction = cachedData.future_direction;
    outlook = cachedData.future_10day_outlook;
    projectedHealth = cachedData.future_projection_data.health_score_projected;
    currentHealthScore = cachedData.future_projection_data.health_score_current;
    confidence = cachedData.future_confidence;
    driversList = cachedData.drivers || [];
    futureBiggestLever = cachedData.future_biggest_lever;
    futureBiggestLeverImpact = cachedData.future_biggest_lever_impact;
  } else {
    console.log('[FutureYou] Calculating fresh projections.');
    currentHealthScore = scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length) : 0;
    
    const futureDelta = Math.round((futureScore - currentHealthScore) * 0.15); // scaled projections
    direction = futureScore > currentHealthScore + 3 ? 'Improving' : futureScore < currentHealthScore - 3 ? 'Declining' : 'Stable';
    outlook = futureScore > currentHealthScore + 3 ? 'Positive' : futureScore < currentHealthScore - 3 ? 'Negative' : 'Neutral';
    projectedHealth = Math.min(100, Math.max(0, currentHealthScore + futureDelta));
    confidence = Math.max(50, Math.min(95, Math.round(baseConfidence + confidenceModifiers)));

    // Construct 100% factual, mathematical driving factors list (short bullet points)
    if (proteinTrackedDays > 0) {
      if (proteinAdherence >= 80) {
        driversList.push({ status: 'success', text: `Protein target hit (${proteinMetDays}/${proteinTrackedDays} days)` });
      } else {
        driversList.push({ status: 'warning', text: `Protein target missed (${proteinTrackedDays - proteinMetDays}/${proteinTrackedDays} days)` });
      }
    } else {
      driversList.push({ status: 'warning', text: 'No protein logs recorded' });
    }

    if (calorieTrackedDays > 0) {
      if (calorieAdherence >= 85) {
        driversList.push({ status: 'success', text: `Calorie consistency is high (${calorieAdherence.toFixed(0)}% average)` });
      } else {
        driversList.push({ status: 'warning', text: `Calorie consistency is low (${calorieAdherence.toFixed(0)}% average)` });
      }
    } else {
      driversList.push({ status: 'warning', text: 'No calorie logs recorded' });
    }

    if (activityAdherence >= 70) {
      driversList.push({ status: 'success', text: `Activity consistency hit (${activityAdherence.toFixed(0)}% adherence)` });
    } else {
      driversList.push({ status: 'info', text: `Activity consistency missed (${activityAdherence.toFixed(0)}% adherence)` });
    }

    if (sleepAvailable) {
      const sleepAvgHours = Math.round((daysWithSleep.length > 0 ? sleepAdherence : 0) * 7.5 / 100 * 10) / 10;
      driversList.push({ status: 'success', text: `Sleep tracker connected (${sleepAvgHours}h avg)` });
    } else {
      driversList.push({ status: 'warning', text: 'Sleep tracker not connected' });
    }

    // Mathematically calculate the Biggest Opportunity and its Score Impact
    // We select the metric that has the highest potential score improvement (highest impact)
    const proteinImpact = Math.round((100 - proteinAdherence) * 0.275); // Weight = 27.5%
    const calorieImpact = Math.round((100 - calorieAdherence) * 0.35);  // Weight = 35%
    const activityImpact = Math.round((100 - activityAdherence) * 0.225); // Weight = 22.5%
    const sleepImpact = sleepAvailable ? Math.round((100 - sleepAdherence) * 0.05) : 5; // Weight = 5%
    
    let bestMetric = 'calories';
    let maxImpact = calorieImpact;
    
    if (proteinImpact > maxImpact) {
      bestMetric = 'protein';
      maxImpact = proteinImpact;
    }
    if (activityImpact > maxImpact) {
      bestMetric = 'activity';
      maxImpact = activityImpact;
    }
    if (sleepImpact > maxImpact) {
      bestMetric = 'sleep';
      maxImpact = sleepImpact;
    }
    
    let calculatedLever = calorieTrackedDays >= 3 ? 'Reduce Calorie Overages' : 'Track Calories Consistently';
    if (bestMetric === 'protein') {
      calculatedLever = proteinTrackedDays >= 3 ? 'Increase Protein Consistency' : 'Track Protein Consistently';
    } else if (bestMetric === 'activity') {
      calculatedLever = 'Increase Daily Activity';
    } else if (bestMetric === 'sleep') {
      calculatedLever = sleepAvailable ? 'Improve Sleep Duration' : 'Connect Sleep Tracking';
    }
    
    futureBiggestLever = calculatedLever;
    futureBiggestLeverImpact = `+${Math.max(1, maxImpact)} Future Score`;
  }

  // Build a clean history string of daily scores & logs for Gemini to analyze
  const dailyHistoryLines: string[] = [];
  const newestScoresFirst = [...scores].sort((a, b) => b.date.localeCompare(a.date)); // newest first
  newestScoresFirst.forEach((s) => {
    let line = `Date: ${s.date}, Score = ${s.score || 0}`;
    const macros = foodLogsByDate[s.date];
    if (macros) {
      const itemsStr = macros.items.length > 0 ? ` (${macros.items.join(', ')})` : '';
      line += `, Food = ${macros.calories} kcal, Protein = ${macros.protein}g${itemsStr}`;
    } else {
      line += `, Food/Protein = N/A`;
    }
    
    dailyHistoryLines.push(line);
  });
  const historyText = dailyHistoryLines.slice(0, evaluationDays).join('\n');

  // 4. Request Gemini via Supabase Functions for Witty Messages
  let futureMessage = "Future You is actually not mad. Let's keep it that way.";
  let futureBiggestLeverInsight = "Your future self will thank you.";

  console.log(`[FutureYou Cache Debug] ID: ${userId} | isDailyValid: ${isDailyCacheValid}`);

  try {
    const prompt = `You are the user's Future Self looking back at their health habits over the last 15 days.
Analyze their data and write a short, funny, sarcastic roast about their habits, as well as a short witty comment about their biggest opportunity.

User Context:
- Name: ${ctx.firstName}
- Average Health Score: ${currentHealthScore}/100
- Future Score: ${futureScore}/100
- 10-Day Outlook: ${outlook} (${direction})
- Protein Adherence: ${proteinAdherence.toFixed(1)}%
- Calorie Adherence: ${calorieAdherence.toFixed(1)}%
- Activity Adherence: ${activityAdherence.toFixed(1)}%
- Sleep Adherence: ${sleepAdherence.toFixed(1)}%
- Consistency (Logging): ${consistency.toFixed(1)}%
- Sleep Available: ${sleepAvailable ? 'Yes' : 'No'}

Daily Metrics History (last ${evaluationDays} days, newest first):
${historyText}

Return ONLY a raw JSON block with the following keys. No markdown (do not wrap in \`\`\`json blocks), no comments, no extra text:
{
  "future_message": "A very short, highly sarcastic, and funny remark in simple, casual, funny English (1-2 sentences maximum, under 90 characters total). CRITICAL: Do NOT start with 'Your future self says', 'Future you says', 'I think', 'It looks like', or any other introductory phrases. Just deliver the roast directly, brutally, and sarcastically. Avoid complex or fancy words. E.g., 'The only thing you're consistently lifting is your fork.' or 'Your liver is begging for a vegetable.' or 'Are you training for a marathon or a Netflix binge?' Keep it funny, slightly mock-ish, and extremely brief.",
  "future_biggest_lever_insight": "A short, witty, 1-sentence tip or comment (under 75 characters) addressing their biggest opportunity: '${futureBiggestLever}'. Avoid complex words. E.g., for 'Start Tracking Calories': 'Your phone is in your hand anyway, log the food.' or for 'Reduce Calorie Overages': 'Your future self is begging you to put down the cookie.'"
}`;

    const { data: edgeData, error: invokeError } = await supabase.functions.invoke('gemini-proxy', {
      body: {
        contents: [{
          parts: [{ text: prompt }]
        }]
      }
    });

    if (!invokeError && edgeData && !edgeData.error) {
      let rawText = edgeData.candidates[0].content.parts[0].text.trim();
      if (rawText.startsWith('```')) {
        rawText = rawText.replace(/^```(json)?\n/, '').replace(/\n```$/, '');
      }
      const parsed = JSON.parse(rawText);
      if (parsed.future_message) futureMessage = parsed.future_message;
      if (parsed.future_biggest_lever_insight) futureBiggestLeverInsight = parsed.future_biggest_lever_insight;
    } else {
      throw new Error(invokeError?.message || edgeData?.error?.message || 'Gemini proxy error');
    }
  } catch (err) {
    console.warn('Error fetching coach forecast from Gemini proxy:', err);
    
    if (isDailyCacheValid && cachedData) {
      futureMessage = cachedData.future_message;
      futureBiggestLeverInsight = cachedData.future_biggest_lever_insight || "Your future self will thank you.";
    } else {
      // Fallback based on scores (only for a new day)
      if (proteinAdherence < 70) {
        futureMessage = 'Where is the protein? You look like a deflated balloon.';
      } else if (!sleepAvailable) {
        futureMessage = 'No sleep data? You are basically a zombie. Connect Apple Health.';
      }
      
      // Fallback for insight
      if (futureBiggestLever.includes('Calories')) {
        futureBiggestLeverInsight = "Your future self is begging you to log those meals.";
      } else if (futureBiggestLever.includes('Protein')) {
        futureBiggestLeverInsight = "Eat some chicken, save a gym bro.";
      } else {
        futureBiggestLeverInsight = "Small changes today make a huge difference tomorrow.";
      }
    }
  }

  // 5. Build Final Projection Object
  const finalProjection: FutureProjection = {
    generated_at: isDailyCacheValid && cachedData ? cachedData.generated_at : todayStr,
    roast_generated_at: new Date().toISOString(),
    future_direction: direction,
    future_confidence: confidence,
    future_message: futureMessage,
    future_biggest_lever: futureBiggestLever,
    future_biggest_lever_impact: futureBiggestLeverImpact,
    future_biggest_lever_insight: futureBiggestLeverInsight,
    future_10day_outlook: outlook,
    future_projection_data: {
      health_score_current: currentHealthScore,
      health_score_projected: projectedHealth
    },
    drivers: driversList,
    isLocked: false,
    progress: 1.0,
    dayName: `Day ${daysSinceSignup}`,
    last_snapshot_metrics: {
      calories: ctx.caloriesToday,
      protein: ctx.proteinToday,
      steps: ctx.stepsToday,
      water: ctx.waterToday
    }
  };

  // 6. Write to Cache (AsyncStorage)
  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(finalProjection));
  } catch (e) {
    console.warn('Error writing cache to AsyncStorage:', e);
  }

  // 7. Write to Supabase Table (with graceful fallback if table does not exist)
  try {
    const { error: dbError } = await supabase.from('future_projection').upsert({
      user_id: userId,
      future_direction: direction,
      future_confidence: confidence,
      future_projection_data: finalProjection.future_projection_data,
      future_message: futureMessage,
      future_biggest_lever: `${futureBiggestLever} (${futureBiggestLeverImpact})`,
      generated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    if (dbError) {
      // Graceful warn, relation error is expected if table doesn't exist
      console.log(`Supabase write warning: ${dbError.message || dbError}. Fallback cache is fully operational.`);
    } else {
      console.log('Successfully saved Future You projection to Supabase database.');
    }
  } catch (err) {
    console.log('Graceful fallback: Supabase write failed. Using AsyncStorage cache.', err);
  }

  return finalProjection;
}
