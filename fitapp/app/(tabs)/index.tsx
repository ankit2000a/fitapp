import { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, Alert, AppState, TouchableWithoutFeedback, Image, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle as SvgCircle, Rect, Line, Path } from 'react-native-svg';
import { useRouter, useNavigation } from 'expo-router';
import { fetchFutureYouData, getDemoModeState, getTrackedDaysCount, getDemoProjection } from '../../lib/futureYou';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import { buildUserContext, getLocalDateString, getLocalDateStringFromUtc } from '../../lib/userContext';
import * as Haptics from 'expo-haptics';
import { initHealthKit, getTodaySteps, getLastNightSleep, getTodayActiveMinutes, getTodayDistance, isHealthKitAvailable, getTodayWorkoutMinutes, getSleepDetails, getTodayActiveCalories } from '../../lib/healthkit';
import { appEvents, FOOD_LOGGED_EVENT, PROFILE_UPDATED_EVENT, FUTURE_YOU_UPDATED_EVENT } from '../../lib/events';
import { calculateHealthScore, HealthScoreResult } from '../../lib/scoring';
import { syncHistoricalHealthData } from '../../lib/historicalSync';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 4) return 'Hello';
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  if (hour < 21) return 'Good Evening';
  return 'Hello';
};

const getDate = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long', month: 'long', day: 'numeric'
});

export function getXpNeededForLevel(level: number): number {
  if (level < 1) return 100;
  
  let req = 100;
  if (level <= 7) {
    req = 100 * Math.pow(1.20, level - 1);
  } else if (level <= 20) {
    const req7 = 100 * Math.pow(1.20, 6);
    req = req7 * Math.pow(1.12, level - 7);
  } else {
    const req7 = 100 * Math.pow(1.20, 6);
    const req20 = req7 * Math.pow(1.12, 13);
    req = req20 * Math.pow(1.08, level - 20);
  }
  return Math.round(req);
}

export function calculateLevel(xp: number) {
  let level = 1;
  let xpNeeded = getXpNeededForLevel(level);
  let remainingXp = xp;
  while (remainingXp >= xpNeeded) {
    remainingXp -= xpNeeded;
    level++;
    xpNeeded = getXpNeededForLevel(level);
  }
  return { level, xpNeeded, currentLevelXp: remainingXp };
}

let hasInitiallyLoaded = false;
let globalScrollY = 0;

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const scrollRef = useRef<ScrollView>(null);
  const [scrollRestored, setScrollRestored] = useState(false);
  
  // Basic stats state
  const [userName, setUserName] = useState('there');
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [score, setScore] = useState(0);
  const [mealsLogged, setMealsLogged] = useState(0);
  const [loading, setLoading] = useState(!hasInitiallyLoaded);
  const [refreshing, setRefreshing] = useState(false);
  const [steps, setSteps] = useState(0);
  const [sleep, setSleep] = useState(0);
  const [activeMinutes, setActiveMinutes] = useState(0);
  const [distance, setDistance] = useState(0);
  const [activeCalories, setActiveCalories] = useState(0);
  const [healthKitConnected, setHealthKitConnected] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [missionsExpanded, setMissionsExpanded] = useState(false);

  // Gamification & Water state
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);
  const [waterMl, setWaterMl] = useState(0);
  const [chronologicalAge, setChronologicalAge] = useState(20);
  const [healthAge, setHealthAge] = useState(20);
  const [streakDays, setStreakDays] = useState(0);

  // New gamified card states
  const [scoreDelta, setScoreDelta] = useState(4);
  const [dailyBracket, setDailyBracket] = useState(15);
  const [waterStreak, setWaterStreak] = useState(2);
  const [proteinStreak, setProteinStreak] = useState(1);
  const [sleepStreak, setSleepStreak] = useState(3);
  const [scoreStreak, setScoreStreak] = useState(4);
  
  // Custom interactive body scanner states
  const [userGender, setUserGender] = useState('male');
  const [scanAnim] = useState(new Animated.Value(0));

  // Future You States
  const [futureYouData, setFutureYouData] = useState<any>(null);
  const [trackedDays, setTrackedDays] = useState(0);
  const [demoActive, setDemoActive] = useState(false);
  const [demoDay, setDemoDay] = useState('day1');
  const [futureLoading, setFutureLoading] = useState(true);
  const [day7Opened, setDay7Opened] = useState(false);
  const revealScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 120, // sweep height matching container
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        })
      ])
    ).start();
  }, []);

  useEffect(() => {
    const isRevealDay = demoActive ? demoDay === 'day7' : trackedDays === 6;
    if (isRevealDay) {
      revealScale.setValue(1);
      Animated.loop(
        Animated.sequence([
          Animated.timing(revealScale, {
            toValue: 1.03,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(revealScale, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      revealScale.setValue(1);
    }
  }, [trackedDays, demoDay, demoActive]);

  const renderMaleOutline = () => (
    <Svg width={70} height={120} viewBox="0 0 100 200">
      <SvgCircle cx="50" cy="20" r="12" fill="none" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="1.8" opacity="0.85" />
      <Line x1="50" y1="32" x2="50" y2="40" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="2" opacity="0.85" />
      <Path 
        d="M 24 45 L 76 45 L 70 105 L 30 105 Z" 
        fill="none" 
        stroke={level >= 50 ? '#F59E0B' : colors.accent} 
        strokeWidth="1.8" 
        opacity="0.85" 
      />
      <Path d="M 22 47 L 14 90 L 15 110" fill="none" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
      <Path d="M 78 47 L 86 90 L 85 110" fill="none" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
      <Path d="M 33 105 L 33 150 L 30 192" fill="none" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <Path d="M 67 105 L 67 150 L 70 192" fill="none" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
    </Svg>
  );

  const renderFemaleOutline = () => (
    <Svg width={70} height={120} viewBox="0 0 100 200">
      <SvgCircle cx="50" cy="20" r="11" fill="none" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="1.8" opacity="0.85" />
      <Line x1="50" y1="31" x2="50" y2="40" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="1.8" opacity="0.85" />
      <Path 
        d="M 29 45 L 71 45 C 67 65, 62 82, 69 105 L 31 105 C 38 82, 33 65, 29 45 Z" 
        fill="none" 
        stroke={level >= 50 ? '#F59E0B' : colors.accent} 
        strokeWidth="1.8" 
        opacity="0.85" 
      />
      <Path d="M 26 47 L 18 90 L 20 108" fill="none" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
      <Path d="M 74 47 L 82 90 L 80 108" fill="none" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
      <Path d="M 34 105 L 35 150 L 32 192" fill="none" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
      <Path d="M 66 105 L 65 150 L 68 192" fill="none" stroke={level >= 50 ? '#F59E0B' : colors.accent} strokeWidth="1.8" strokeLinecap="round" opacity="0.85" />
    </Svg>
  );

  const showBioCharacterInfo = () => {
    Alert.alert(
      "Bio-Character Progression 🧬",
      "• What is XP? Experience Points (XP) represent your health consistency. Complete your daily quests to earn XP.\n\n• Leveling Up: Earning XP increases your Level, evolving your character stage from Hatchling all the way up to Legend.\n\n• Ultimate Legend State (Lv. 50+): Once you reach the Legend tier, your body scanner achieves Anatomical Equilibrium, unlocking a Golden Scan visual effect and permanent completion badge.",
      [{ text: "Awesome" }]
    );
  };
  
  // V2 dashboard state variables
  const [sleepPoints, setSleepPoints] = useState(0);
  const [nutritionPoints, setNutritionPoints] = useState(0);
  const [movementPoints, setMovementPoints] = useState(0);
  const [recoveryPoints, setRecoveryPoints] = useState(0);
  const [stepsGoal, setStepsGoal] = useState(8000);
  const [proteinGoal, setProteinGoal] = useState(120);
  const [waterGoal, setWaterGoal] = useState(2000);
  
  // Basic states for V1 Refinement
  const [userGoal, setUserGoal] = useState('maintain');
  const [calorieGoal, setCalorieGoal] = useState(2000);
  const [scoreBreakdown, setScoreBreakdown] = useState<any>(null);
  const [scoreModalVisible, setScoreModalVisible] = useState(false);

  useEffect(() => {
    console.log('HomeScreen MOUNTED');
    
    const handleFoodLogged = () => {
      loadTodayData();
    };

    const handleProfileUpdated = () => {
      loadTodayData();
    };

    const handleFutureYouUpdated = () => {
      loadTodayData();
    };

    appEvents.on(FOOD_LOGGED_EVENT, handleFoodLogged);
    appEvents.on(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    appEvents.on(FUTURE_YOU_UPDATED_EVENT, handleFutureYouUpdated);

    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        console.log('HomeScreen: App became active. Reloading today\'s data...');
        loadTodayData();
      }
    });

    // Load data once on initial mount
    loadTodayData();

    return () => {
      console.log('HomeScreen UNMOUNTED');
      appEvents.off(FOOD_LOGGED_EVENT, handleFoodLogged);
      appEvents.off(PROFILE_UPDATED_EVENT, handleProfileUpdated);
      appEvents.off(FUTURE_YOU_UPDATED_EVENT, handleFutureYouUpdated);
      appStateSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('HomeScreen FOCUSED, reloading data & restoring scroll to:', globalScrollY);
      loadTodayData();
      setScrollRestored(false);
      if (globalScrollY > 0) {
        scrollRef.current?.scrollTo({ y: globalScrollY, animated: false });
        const t = setTimeout(() => {
          scrollRef.current?.scrollTo({ y: globalScrollY, animated: false });
        }, 120);
        return () => clearTimeout(t);
      }
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!loading && !scrollRestored && globalScrollY > 0) {
      scrollRef.current?.scrollTo({ y: globalScrollY, animated: false });
      const t = setTimeout(() => {
        scrollRef.current?.scrollTo({ y: globalScrollY, animated: false });
        setScrollRestored(true);
      }, 60);
      return () => clearTimeout(t);
    }
  }, [loading, scrollRestored]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTodayData();
    setRefreshing(false);
  };

  const getCharacterTitle = (lvl: number) => {
    if (lvl < 5) return 'Health Novice';
    if (lvl < 10) return 'Fitness Squire';
    if (lvl < 15) return 'Nutrition Warrior';
    return 'Bio-Hacking Legend';
  };

  const checkAndAwardGoalXp = async (params: {
    currentXp: number;
    currentLevel: number;
    currentSteps: number;
    currentSleep: number;
    currentMeals: number;
    currentProtein: number;
    proteinGoal: number;
    caloriesGoalMet: boolean;
    userId: string;
    currentCalories: number;
    calorieGoal: number;
    userGoal: string;
    waterMl: number;
    waterGoal: number;
  }) => {
    const {
      currentXp,
      currentLevel,
      currentSteps,
      currentSleep,
      currentMeals,
      currentProtein,
      proteinGoal,
      caloriesGoalMet,
      userId,
      currentCalories,
      calorieGoal,
      userGoal,
      waterMl,
      waterGoal
    } = params;

    let additionalXp = 0;
    const today = getLocalDateString(new Date());
    const localTodayStart = new Date();
    localTodayStart.setHours(0,0,0,0);
    const localTodayEnd = new Date();
    localTodayEnd.setHours(23,59,59,999);

    try {
      // 1. Fetch any reward locks for today from Supabase
      const { data: dbLocks, error: dbLocksError } = await supabase
        .from('food_logs')
        .select('food_name')
        .eq('user_id', userId)
        .gte('logged_at', localTodayStart.toISOString())
        .lte('logged_at', localTodayEnd.toISOString())
        .like('food_name', '__reward_lock:%');

      if (dbLocksError) {
        console.warn('Error fetching reward locks from Supabase:', dbLocksError);
      }

      const claimedRewards = new Set(
        (dbLocks || []).map(log => log.food_name.replace('__reward_lock:', ''))
      );

      const newLocksToAward: string[] = [];
      const locksToRemove: string[] = [];
      let alertMsg: string | null = null;
      let alertTitle: string | null = null;

      // 1. STEPS (Completed Quest: 45 XP when currentSteps >= 10000)
      if (currentSteps >= 10000 && !claimedRewards.has('steps_completed')) {
        additionalXp += 45;
        newLocksToAward.push('steps_completed');
      }

      // Compute calorie overage relative to Green limit (upper bound)
      const greenLimit = calorieGoal * 1.1;
      const overage = currentCalories - greenLimit;

      // 2. CALORIES & PERFECT DAY
      // Calories Quest (Stay Within Calories)
      if (caloriesGoalMet) {
        if (!claimedRewards.has('calories')) {
          additionalXp += 30;
          newLocksToAward.push('calories');
        }
        // Refund any calorie penalties if they got back in Green zone
        if (claimedRewards.has('calories_orange_penalty')) {
          additionalXp += 5;
          locksToRemove.push('calories_orange_penalty');
        }
        if (claimedRewards.has('calories_red_penalty')) {
          additionalXp += 10;
          locksToRemove.push('calories_red_penalty');
        }
      } else {
        // If not in green zone, check for penalties or refunds
        if (overage <= 0) {
          // In Yellow/deficient range but not Green - refund penalties if any exist
          if (claimedRewards.has('calories_orange_penalty')) {
            additionalXp += 5;
            locksToRemove.push('calories_orange_penalty');
          }
          if (claimedRewards.has('calories_red_penalty')) {
            additionalXp += 10;
            locksToRemove.push('calories_red_penalty');
          }
        } else if (overage > 0 && overage <= 500) {
          // Yellow overage zone: no penalty, refund penalties if they came down from Orange/Red
          if (claimedRewards.has('calories_orange_penalty')) {
            additionalXp += 5;
            locksToRemove.push('calories_orange_penalty');
          }
          if (claimedRewards.has('calories_red_penalty')) {
            additionalXp += 10;
            locksToRemove.push('calories_red_penalty');
          }
        } else if (overage > 500 && overage <= 1000) {
          // Orange overage zone: -5 XP penalty
          if (!claimedRewards.has('calories_orange_penalty')) {
            additionalXp -= 5;
            newLocksToAward.push('calories_orange_penalty');
            alertTitle = "⚠️ Calorie Target Exceeded";
            alertMsg = "You exceeded your calorie limit by more than 500 kcal. A -5 XP penalty has been applied.";
          }
          if (claimedRewards.has('calories_red_penalty')) {
            additionalXp += 10; // refund red penalty
            locksToRemove.push('calories_red_penalty');
          }
        } else {
          // Red overage zone: -10 XP penalty
          if (!claimedRewards.has('calories_red_penalty')) {
            additionalXp -= 10;
            newLocksToAward.push('calories_red_penalty');
            alertTitle = "❌ Extreme Calorie Overage";
            alertMsg = "You exceeded your calorie limit by more than 1000 kcal. A -10 XP penalty has been applied.";
          }
          if (claimedRewards.has('calories_orange_penalty')) {
            additionalXp += 5; // refund orange penalty
            locksToRemove.push('calories_orange_penalty');
          }
        }
      }

      // Perfect Day Quest
      const stepsGoalMet = currentSteps >= 10000;
      const proteinGoalMet = currentProtein >= proteinGoal;
      const waterGoalMet = waterMl >= waterGoal;
      const nutritionGoalMet = currentMeals >= 4;
      const perfectDayGoalMet = stepsGoalMet && proteinGoalMet && caloriesGoalMet && waterGoalMet && nutritionGoalMet;

      if (perfectDayGoalMet && !claimedRewards.has('perfect_day')) {
        additionalXp += 45;
        newLocksToAward.push('perfect_day');
      }

      // 3. LOG MEALS (Completed Quest: 30 XP when currentMeals >= 4)
      if (currentMeals >= 4 && !claimedRewards.has('meals_completed')) {
        additionalXp += 30;
        newLocksToAward.push('meals_completed');
      }

      // 4. PROTEIN GOAL (Completed Quest: 50 XP when currentProtein >= proteinGoal)
      if (proteinGoal > 0 && currentProtein >= proteinGoal && !claimedRewards.has('protein_completed')) {
        additionalXp += 50;
        newLocksToAward.push('protein_completed');
      }

      // 5. WATER GOAL (Completed Quest: 40 XP when waterMl >= waterGoal)
      if (waterMl >= waterGoal && !claimedRewards.has('water_completed')) {
        additionalXp += 40;
        newLocksToAward.push('water_completed');
      }

      // Apply DB operations: inserts first
      if (newLocksToAward.length > 0) {
        const inserts = newLocksToAward.map(type => ({
          user_id: userId,
          food_name: `__reward_lock:${type}`,
          calories: 0,
          protein_g: 0,
          carbs_g: 0,
          fat_g: 0,
          roast_text: '__reward_lock',
          meal_type: 'snack',
          logged_at: `${today}T12:00:00.000Z`
        }));
        const { error: insertError } = await supabase.from('food_logs').insert(inserts);
        if (insertError) {
          throw new Error('Failed to record reward locks: ' + insertError.message);
        }
      }

      // Apply DB operations: removals
      if (locksToRemove.length > 0) {
        const { error: deleteError } = await supabase
          .from('food_logs')
          .delete()
          .eq('user_id', userId)
          .gte('logged_at', localTodayStart.toISOString())
          .lte('logged_at', localTodayEnd.toISOString())
          .in('food_name', locksToRemove.map(type => `__reward_lock:${type}`));
        if (deleteError) {
          console.warn('Failed to delete reward locks:', deleteError);
        }
      }

      // Update local and remote XP if there is any difference
      if (additionalXp !== 0) {
        const finalXp = Math.max(0, currentXp + additionalXp);
        const { level: calcLvl } = calculateLevel(finalXp);
        let leveledUp = false;
        let nextLvl = currentLevel;

        if (calcLvl > currentLevel) {
          nextLvl = calcLvl;
          leveledUp = true;
        }

        setXp(finalXp);
        setLevel(nextLvl);

        // Update DB & storage
        await AsyncStorage.setItem(`@user_xp_${userId}`, String(finalXp));
        await AsyncStorage.setItem(`@user_level_${userId}`, String(nextLvl));
        
        await supabase
          .from('users')
          .update({ xp: finalXp, level: nextLvl })
          .eq('id', userId);

        if (additionalXp > 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (leveledUp) {
            setTimeout(() => {
              Alert.alert('🎉 LEVEL UP!', `Congratulations! You leveled up to Level ${nextLvl}! You unlocked the title: "${getCharacterTitle(nextLvl)}".`);
            }, 800);
          }
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          if (alertTitle && alertMsg) {
            setTimeout(() => {
              Alert.alert(alertTitle, alertMsg);
            }, 800);
          }
        }
      }
    } catch (e) {
      console.log('Error checking goal XP award:', e);
    }
  };

  const handleAddWater = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const newWater = waterMl + 250;
      setWaterMl(newWater);

      const { data: { session } } = await supabase.auth.getSession();
      if (session && session.user) {
        const userId = session.user.id;
        await AsyncStorage.setItem(`@user_water_${userId}`, String(newWater));

        // Increment water streak if goal met
        let newWaterStreak = waterStreak;
        if (newWater >= waterGoal && waterMl < waterGoal) {
          newWaterStreak = waterStreak + 1;
          setWaterStreak(newWaterStreak);
          await AsyncStorage.setItem(`@streak_water_${userId}`, String(newWaterStreak));
        }

        // Update Supabase
        await supabase
          .from('users')
          .update({
            water_ml: newWater
          })
          .eq('id', userId);

        // Re-run XP check with updated water value
        await checkAndAwardGoalXp({
          currentXp: xp,
          currentLevel: level,
          currentSteps: steps,
          currentSleep: sleep,
          currentMeals: mealsLogged,
          currentProtein: protein,
          proteinGoal: proteinGoal,
          caloriesGoalMet: caloriesGoalMet,
          userId: userId,
          currentCalories: calories,
          calorieGoal: calorieGoal,
          userGoal: userGoal,
          waterMl: newWater,
          waterGoal: waterGoal
        });
        
        // Refresh home screen data to trigger Future You recalculation
        loadTodayData();
      }
    } catch (e) {
      console.log('Error adding water:', e);
    }
  };

  const loadTodayData = async () => {
    console.log('HomeScreen: loadTodayData started');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        hasInitiallyLoaded = true;
        setLoading(false);
        return;
      }
      const userId = session.user.id;
      let todaySteps = 0;
      let lastSleep = 0;
      let activeMins = 0;
      let todayDistance = 0;
      let workoutMins = 0;
      let sleepStartLastNight: Date | null = null;
      let sleepStartNightBefore: Date | null = null;
      let hasHKPermission = false;
      let activeCaloriesBurned = 0;

      // Initialize HealthKit
      if (isHealthKitAvailable) {
        try {
          const hkSuccess = await initHealthKit();
          if (hkSuccess) {
            hasHKPermission = true;
            const [fetchedSteps, sleepDetails, fetchedActiveMins, todayWorkoutMinutes, fetchedActiveCals] = await Promise.all([
              getTodaySteps(),
              getSleepDetails(),
              getTodayActiveMinutes(),
              getTodayWorkoutMinutes(),
              getTodayActiveCalories()
            ]);
            todaySteps = fetchedSteps;
            lastSleep = sleepDetails.lastNightHours;
            sleepStartLastNight = sleepDetails.lastNightStart;
            sleepStartNightBefore = sleepDetails.nightBeforeStart;
            activeMins = fetchedActiveMins;
            workoutMins = todayWorkoutMinutes;
            todayDistance = Math.round(todaySteps * 0.000762 * 10) / 10;

            let activeCals = fetchedActiveCals;
            if (activeCals === 0 && todaySteps > 0) {
              activeCals = Math.round(todaySteps * 0.04);
            }
            activeCaloriesBurned = activeCals;

            setSteps(fetchedSteps);
            setSleep(lastSleep);
            setActiveMinutes(fetchedActiveMins);
            setDistance(todayDistance);
            setActiveCalories(activeCals);
            setHealthKitConnected(true);
          } else {
            setHealthKitConnected(false);
            setActiveCalories(0);
          }
        } catch (e: any) {
          console.error('HealthKit error:', e);
          setHealthKitConnected(false);
        }
      }

      const ctx = await buildUserContext({
        steps: todaySteps,
        sleep: lastSleep,
        activeMinutes: activeMins,
        distance: todayDistance,
        workouts: workoutMins
      });
      if (!ctx) {
        hasInitiallyLoaded = true;
        setLoading(false);
        return;
      }

      setUserName(ctx.firstName);
      setCalories(ctx.caloriesToday);
      setProtein(ctx.proteinToday);
      setMealsLogged(ctx.mealsToday);
      setStreakDays(ctx.loggingStreak);

      // Fetch avatar & RPG database columns (with local AsyncStorage caches)
      let userXp = 0;
      let userLevel = 1;
      let userWater = 0;
      let userBirthday = null;
      let userAge = 20;
      let fetchedGender = 'male';

      try {
        const { data: userData } = await supabase
          .from('users')
          .select('avatar_url, xp, level, water_ml, last_water_reset, birthday, age, gender')
          .eq('id', ctx.userId)
          .single();

        if (userData) {
          userXp = userData.xp || 0;
          userLevel = userData.level || 1;
          userWater = userData.water_ml || 0;
          userBirthday = userData.birthday;
          userAge = userData.age || 20;
          fetchedGender = userData.gender || 'male';
          setAvatarUrl(userData.avatar_url);
        }
        
        // Caches
        const localAvatar = await AsyncStorage.getItem(`@user_avatar_${ctx.userId}`);
        if (localAvatar && !userData?.avatar_url) {
          setAvatarUrl(localAvatar);
        }

        const cachedXp = await AsyncStorage.getItem(`@user_xp_${ctx.userId}`);
        const cachedLevel = await AsyncStorage.getItem(`@user_level_${ctx.userId}`);
        const cachedWater = await AsyncStorage.getItem(`@user_water_${ctx.userId}`);
        const cachedReset = await AsyncStorage.getItem(`@user_water_reset_${ctx.userId}`);
        const cachedGender = await AsyncStorage.getItem(`@user_gender_${ctx.userId}`);

        if (cachedXp && (!userData || userData.xp === undefined)) userXp = parseInt(cachedXp);
        if (cachedLevel && (!userData || userData.level === undefined)) userLevel = parseInt(cachedLevel);
        if (cachedWater && (!userData || userData.water_ml === undefined)) userWater = parseInt(cachedWater);
        if (cachedGender && (!userData || !userData.gender)) {
          fetchedGender = cachedGender;
        }

        setUserGender(fetchedGender);

        // Midnight Reset checks for daily water
        const todayDateStr = getLocalDateString(new Date());
        const dbResetStr = userData?.last_water_reset || cachedReset;

        if (dbResetStr && dbResetStr !== todayDateStr) {
          userWater = 0;
          await supabase.from('users').update({ water_ml: 0, last_water_reset: todayDateStr }).eq('id', ctx.userId);
          await AsyncStorage.setItem(`@user_water_${ctx.userId}`, '0');
          await AsyncStorage.setItem(`@user_water_reset_${ctx.userId}`, todayDateStr);
        }

        setXp(userXp);
        setLevel(userLevel);
        setWaterMl(userWater);
      } catch (ae) {
        console.log('Error loading RPG data on home screen:', ae);
      }

      // Load standard steps goal
      let calculatedStepsGoal = 10000;
      setStepsGoal(calculatedStepsGoal);
      setProteinGoal(ctx.proteinGoal);
      setWaterGoal(ctx.waterGoal);

      // Calculate score
      const scoreResultObj = calculateHealthScore({
        caloriesToday: ctx.caloriesToday,
        calorieGoal: ctx.calorieGoal,
        proteinToday: ctx.proteinToday,
        proteinGoal: ctx.proteinGoal,
        mealsToday: ctx.mealsToday,
        currentHour: ctx.currentHour,
        currentMinute: ctx.currentMinute,
        stepsToday: ctx.stepsToday,
        stepsTracked: hasHKPermission,
        workoutMinutesToday: ctx.workoutsToday,
        activeMinutesToday: ctx.activeMinutesToday,
        activeMinutesTracked: hasHKPermission,
        sleepHoursLastNight: ctx.sleepLastNight,
        sleepTracked: hasHKPermission,
        sleepStartLastNight,
        sleepStartNightBefore,
        waterToday: userWater,
        waterGoal: ctx.waterGoal,
        stepsGoal: calculatedStepsGoal,
        goal: ctx.goal
      });
      console.log('[DEBUG HOME SCORE] scoreResultObj:', JSON.stringify(scoreResultObj, null, 2));
      setScore(scoreResultObj.totalScore);
      setScoreBreakdown(scoreResultObj);
      setSleepPoints(scoreResultObj.breakdown.sleepDuration.score);
      setNutritionPoints(scoreResultObj.breakdown.protein.score + scoreResultObj.breakdown.calories.score + scoreResultObj.breakdown.mealDistribution.score);
      setMovementPoints(scoreResultObj.breakdown.steps.score + scoreResultObj.breakdown.workout.score);
      setRecoveryPoints(scoreResultObj.breakdown.water.score);
      ctx.todayScore = scoreResultObj.totalScore;
      setUserGoal(ctx.goal || 'maintain');
      setCalorieGoal(ctx.calorieGoal || 2000);

      // Biological Age and Health Age calculations
      let baseAge = userAge || 20;
      if (userBirthday) {
        const birth = new Date(userBirthday);
        const today = new Date();
        baseAge = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) baseAge--;
      }
      setChronologicalAge(baseAge);

      let ageModifier = 0;
      if (scoreResultObj.totalScore >= 50) {
        // Continuous linear formula: score 50 (0 modifier) to 100 (-2.5 yrs modifier)
        ageModifier = -((scoreResultObj.totalScore - 50) / 50) * 2.5;
      } else {
        // Continuous linear formula: score 50 (0 modifier) to 0 (+3.0 yrs modifier)
        ageModifier = ((50 - scoreResultObj.totalScore) / 50) * 3.0;
      }
      setHealthAge(Math.round((baseAge + ageModifier) * 10) / 10);

      // Save score to Supabase
      const today = getLocalDateString(new Date());
      await supabase.from('health_scores').upsert({
        user_id: ctx.userId,
        date: today,
        score: scoreResultObj.totalScore,
        nutrition_score: scoreResultObj.nutritionScore,
        activity_score: scoreResultObj.activityScore,
        sleep_score: scoreResultObj.sleepScore,
        steps: todaySteps,
        active_calories: activeCaloriesBurned,
      }, { onConflict: 'user_id,date' });

      // Calculate score delta from yesterday
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = getLocalDateString(yesterday);

        // One-time correction to repair yesterday's score from feedback loop
        if (yesterdayStr === '2026-06-19') {
          try {
            const { data: yScore } = await supabase
              .from('health_scores')
              .select('score')
              .eq('user_id', ctx.userId)
              .eq('date', yesterdayStr)
              .maybeSingle();
            if (yScore && yScore.score > 5) {
              await supabase
                .from('health_scores')
                .update({ score: 4, sleep_score: 0 })
                .eq('user_id', ctx.userId)
                .eq('date', yesterdayStr);
            }
          } catch (e) {
            console.log('Error repairing score:', e);
          }
        }

        const { data: yesterdayScoreObj } = await supabase
          .from('health_scores')
          .select('score')
          .eq('user_id', ctx.userId)
          .eq('date', yesterdayStr)
          .single();
        const yestScore = yesterdayScoreObj ? yesterdayScoreObj.score : 0;
        setScoreDelta(scoreResultObj.totalScore - yestScore);
      } catch (err) {
        console.log('Error loading yesterday score for delta:', err);
        setScoreDelta(4); // default fallback
      }

      // Calculate bracket dynamically
      let bracket = 100;
      if (scoreResultObj.totalScore > 0) {
        try {
          const { count: totalUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

          const { data: higherScoresToday } = await supabase
            .from('health_scores')
            .select('user_id')
            .eq('date', today)
            .gt('score', scoreResultObj.totalScore);
          
          const uniqueUsersWithHigherScoreToday = new Set(higherScoresToday?.map(s => s.user_id) || []).size;
          const rank = uniqueUsersWithHigherScoreToday + 1;
          const calculatedPercentile = Math.ceil((rank / (totalUsers || 1)) * 100);
          bracket = Math.max(2, Math.min(100, calculatedPercentile));
        } catch (err) {
          console.log('Error calculating dynamic bracket:', err);
          bracket = Math.max(2, Math.min(25, 100 - scoreResultObj.totalScore));
        }
      } else {
        bracket = 100;
      }
      setDailyBracket(bracket);

      // Load streaks from cache
      try {
        const ws = await AsyncStorage.getItem(`@streak_water_${ctx.userId}`);
        setWaterStreak(ws ? parseInt(ws) : (ctx.loggingStreak > 0 ? ctx.loggingStreak : 2));
        
        const ps = await AsyncStorage.getItem(`@streak_protein_${ctx.userId}`);
        let newProteinStreak = ps ? parseInt(ps) : (ctx.loggingStreak > 0 ? Math.max(0, ctx.loggingStreak - 1) : 1);
        if (ctx.proteinToday >= 120) {
          const lastProteinDate = await AsyncStorage.getItem(`@streak_protein_date_${ctx.userId}`);
          if (lastProteinDate !== today) {
            newProteinStreak++;
            await AsyncStorage.setItem(`@streak_protein_${ctx.userId}`, String(newProteinStreak));
            await AsyncStorage.setItem(`@streak_protein_date_${ctx.userId}`, today);
          }
        }
        setProteinStreak(newProteinStreak);

        const ss = await AsyncStorage.getItem(`@streak_sleep_${ctx.userId}`);
        let newSleepStreak = ss ? parseInt(ss) : (ctx.loggingStreak > 0 ? ctx.loggingStreak : 3);
        if (ctx.sleepLastNight >= 7) {
          const lastSleepDate = await AsyncStorage.getItem(`@streak_sleep_date_${ctx.userId}`);
          if (lastSleepDate !== today) {
            newSleepStreak++;
            await AsyncStorage.setItem(`@streak_sleep_${ctx.userId}`, String(newSleepStreak));
            await AsyncStorage.setItem(`@streak_sleep_date_${ctx.userId}`, today);
          }
        }
        setSleepStreak(newSleepStreak);

        const sc = await AsyncStorage.getItem(`@streak_score_${ctx.userId}`);
        let newScoreStreak = sc ? parseInt(sc) : (ctx.loggingStreak > 0 ? ctx.loggingStreak : 4);
        if (scoreResultObj.totalScore >= 80) {
          const lastScoreDate = await AsyncStorage.getItem(`@streak_score_date_${ctx.userId}`);
          if (lastScoreDate !== today) {
            newScoreStreak++;
            await AsyncStorage.setItem(`@streak_score_${ctx.userId}`, String(newScoreStreak));
            await AsyncStorage.setItem(`@streak_score_date_${ctx.userId}`, today);
          }
        }
        setScoreStreak(newScoreStreak);
      } catch (e) {
        console.log('Error loading local streaks:', e);
      }

      // Award goal check-ins XP (Once per day / progressive)
      const userGoal = ctx.goal || 'maintain';
      const calsMet = ctx.caloriesToday >= ctx.calorieGoal * 0.9 && ctx.caloriesToday <= ctx.calorieGoal * 1.1;

      await checkAndAwardGoalXp({
        currentXp: userXp,
        currentLevel: userLevel,
        currentSteps: todaySteps,
        currentSleep: lastSleep,
        currentMeals: ctx.mealsToday,
        currentProtein: ctx.proteinToday,
        proteinGoal: ctx.proteinGoal,
        caloriesGoalMet: calsMet,
        userId: ctx.userId,
        currentCalories: ctx.caloriesToday,
        calorieGoal: ctx.calorieGoal,
        userGoal: userGoal,
        waterMl: userWater,
        waterGoal: ctx.waterGoal
      });

      // Normalize past day scores if they weren't normalized yet
      try {
        const todayStr = getLocalDateString(new Date());
        const { data: pastScores } = await supabase
          .from('health_scores')
          .select('score, date, sleep_score, activity_score, nutrition_score')
          .eq('user_id', ctx.userId)
          .lt('date', todayStr)
          .order('date', { ascending: false })
          .limit(7);

        if (pastScores && pastScores.length > 0) {
          const updates = [];
          for (const s of pastScores) {
            const isUnnormalized = (s.sleep_score === 0 || s.sleep_score === null) && s.score <= 75;
            if (isUnnormalized && s.score > 0) {
              const normalized = Math.min(100, Math.round((s.score / 75) * 100));
              updates.push(
                supabase
                  .from('health_scores')
                  .update({ score: normalized, sleep_score: -1 })
                  .eq('user_id', ctx.userId)
                  .eq('date', s.date)
              );
            }
          }
          if (updates.length > 0) {
            await Promise.all(updates);
          }
        }
      } catch (err) {
        console.log('Error normalizing past day scores on load:', err);
      }

      // Load Future You projection data
      try {
        setFutureLoading(true);
        const demoModeDay = await getDemoModeState(ctx.userId);
        const signupDateStr = ctx.createdAt;
        let daysSinceSignup = 1;
        if (signupDateStr) {
          const start = new Date(signupDateStr);
          const end = new Date();
          start.setHours(0,0,0,0);
          end.setHours(0,0,0,0);
          const diffTime = end.getTime() - start.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
          daysSinceSignup = Math.max(1, diffDays);
        }
        setTrackedDays(daysSinceSignup - 1);

        if (demoModeDay) {
          setDemoActive(true);
          setDemoDay(demoModeDay);
          const demoProj = getDemoProjection(demoModeDay, ctx.firstName);
          setFutureYouData(demoProj);
        } else {
          setDemoActive(false);
          const data = await fetchFutureYouData(ctx.userId, ctx);
          setFutureYouData(data);
        }

        const openedVal = await AsyncStorage.getItem('@future_you_day7_opened');
        setDay7Opened(openedVal === 'true');
      } catch (err) {
        console.log('Error loading Future You data in HomeScreen:', err);
      } finally {
        setFutureLoading(false);
      }

      // Asynchronously trigger historical sync for the past 7 days to sync missing health data (when app wasn't opened)
      if (hasHKPermission) {
        setTimeout(() => {
          syncHistoricalHealthData(ctx.userId, {
            calorieGoal: ctx.calorieGoal,
            proteinGoal: ctx.proteinGoal,
            waterGoal: ctx.waterGoal,
            goal: ctx.goal
          }, ctx.createdAt).catch(syncErr => {
            console.error("HomeScreen: Error running historical sync:", syncErr);
          });
        }, 1000);
      }

      // Notifications logic removed for MVP

    } catch (err) {
      console.error("loadTodayData error:", err);
    } finally {
      hasInitiallyLoaded = true;
      setLoading(false);
    }
  };

  const getObservationText = (day: number) => {
    switch (day) {
      case 1:
        return "We are learning your habits. Protein consistency starts today!";
      case 2:
        return "We've already noticed your protein intake is more consistent than your water intake.";
      case 3:
        return "You've hit your protein goal once. Technically that's a streak.";
      case 4:
        return "Your couch is wondering why you're walking so much.";
      case 5:
        return "Calories have been surprisingly cooperative.";
      case 6:
      default:
        return "One more day and Future You will have enough data.";
    }
  };

  const handleOpenDay7Forecast = async () => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await AsyncStorage.setItem('@future_you_day7_opened', 'true');
      setDay7Opened(true);
    } catch (e) {
      console.log('Error saving Day 7 opened state:', e);
    }
    router.push('/futureYou');
  };

  const renderFutureYouCard = () => {
    if (!futureYouData) {
      return (
        <View style={[styles.futureYouCard, { height: 160, justifyContent: 'center', alignItems: 'center' }]}>
          <ActivityIndicator size="small" color="#A78BFA" />
        </View>
      );
    }

    const {
      future_direction,
      future_confidence,
      future_10day_outlook,
      future_projection_data,
      future_message,
      dayName,
      isLocked,
      isReveal,
      progress,
      observation
    } = futureYouData as any;

    const lockedState = isLocked || (!demoActive && trackedDays < 6);
    const revealState = (isReveal || (!demoActive && trackedDays === 6)) && !day7Opened;

    if (lockedState) {
      const displayDayName = demoActive ? dayName : `Day ${trackedDays + 1} of 7`;
      const displayProgress = demoActive ? progress : (trackedDays + 1) / 7;
      const displayObservation = future_message || (demoActive ? observation : getObservationText(trackedDays + 1));

      return (
        <TouchableOpacity
          style={styles.futureYouCard}
          onPress={() => router.push('/futureYou')}
          activeOpacity={0.8}
        >
          <View style={styles.futureYouHeader}>
            <View style={styles.lockedAiStatusRow}>
              <View style={styles.pulsingDot} />
              <Text style={styles.lockedSub}>AI Analysing Habits...</Text>
            </View>
            <View style={styles.lockedDayBadge}>
              <Text style={styles.lockedDayBadgeText}>{displayDayName} ↗</Text>
            </View>
          </View>
          <View style={styles.futureYouProgressBarContainer}>
            <LinearGradient
              colors={['#8B5CF6', '#C084FC']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.futureYouProgressBarFill, { width: `${displayProgress * 100}%` }]}
            />
          </View>
          
          <View style={styles.quoteBubble}>
            <View style={styles.quoteHeader}>
              <LinearGradient
                colors={['#8B5CF6', '#A78BFA']}
                style={styles.quoteAvatar}
              >
                <Ionicons name="sparkles" size={10} color="#FFF" />
              </LinearGradient>
              <Text style={styles.quoteAuthor}>FUTURE YOU SAYS</Text>
            </View>
            <Text style={styles.quoteText}>"{displayObservation}"</Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (revealState) {
      return (
        <Animated.View style={{ transform: [{ scale: revealScale }] }}>
          <TouchableOpacity
            style={[styles.futureYouCard, { borderColor: '#A78BFA', borderWidth: 1.5 }]}
            onPress={handleOpenDay7Forecast}
            activeOpacity={0.8}
          >
            <View style={styles.futureYouHeader}>
              <View>
                <Text style={[styles.futureYouTitle, { color: '#A78BFA' }]}>Future You Profile Ready</Text>
                <Text style={styles.lockedSub}>Day 7 Unlock</Text>
              </View>
              <View style={styles.lockedDayBadge}>
                <Text style={styles.lockedDayBadgeText}>Unlock ↗</Text>
              </View>
            </View>
            <View style={styles.futureYouMain}>
              <View style={styles.futureYouDetailRow}>
                <Text style={styles.futureYouLabel}>Direction</Text>
                <Text style={[styles.futureYouDirection, { color: '#A78BFA', fontWeight: 'bold' }]}>↗ Improving</Text>
              </View>
              <View style={styles.futureYouDetailRow}>
                <Text style={styles.futureYouLabel}>Confidence</Text>
                <Text style={styles.futureYouValue}>68%</Text>
              </View>
              <View style={styles.futureYouDetailRow}>
                <Text style={styles.futureYouLabel}>10-Day Outlook</Text>
                <Text style={styles.futureYouValue}>Positive</Text>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      );
    }

    // Unlocked State
    const isImproving = future_direction === 'Improving';
    const isDeclining = future_direction === 'Declining';
    const currentScore = future_projection_data?.health_score_current ?? 50;
    const projectedScore = future_projection_data?.health_score_projected ?? 50;

    const delta = projectedScore - currentScore;
    const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;

    return (
      <TouchableOpacity
        style={styles.futureYouCard}
        onPress={() => router.push('/futureYou')}
        activeOpacity={0.8}
      >
        {/* Card Header Row inside the card */}
        <View style={styles.futureYouCardHeader}>
          <View style={styles.liveIndicatorRow}>
            <View style={styles.pulsingGreenDot} />
            <Text style={styles.liveIndicatorText}>Live Projection</Text>
          </View>
          <View style={styles.forecastBadge}>
            <Text style={styles.forecastBadgeText}>Forecast ↗</Text>
          </View>
        </View>

        <View style={styles.futureYouCardRow}>
          {/* Left Hero Area */}
          <View style={styles.futureYouCardLeft}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Text style={styles.futureYouCardHeroVal}>{deltaStr}</Text>
              <Text style={styles.futureYouCardHeroUnit}>Points</Text>
            </View>
            <Text style={styles.futureYouCardSub}>PROJECTED SCORE CHANGE</Text>
          </View>

          {/* Right Details Area */}
          <View style={styles.futureYouCardRight}>
            <View style={{ alignItems: 'flex-start' }}>
              <View style={styles.rightInfoRow}>
                <Ionicons name="person-outline" size={12} color="rgba(255, 255, 255, 0.4)" style={{ marginRight: 6 }} />
                <Text style={styles.rightInfoLabel}>
                  Recent Average: <Text style={styles.rightInfoValue}>{currentScore}</Text>
                </Text>
              </View>
              <View style={styles.rightInfoRow}>
                <Ionicons name="analytics-outline" size={12} color="rgba(255, 255, 255, 0.4)" style={{ marginRight: 6 }} />
                <Text style={styles.rightInfoLabel}>
                  Projected Score: <Text style={styles.rightInfoValue}>{projectedScore}</Text>
                </Text>
              </View>
              <View style={styles.rightInfoRow}>
                <Ionicons 
                  name={isImproving ? "trending-up-outline" : isDeclining ? "trending-down-outline" : "trending-up-outline"} 
                  size={12} 
                  color={isImproving ? '#A78BFA' : isDeclining ? '#F87171' : '#9CA3AF'} 
                  style={{ marginRight: 6 }} 
                />
                <Text style={styles.rightInfoLabel}>
                  Trend: <Text style={{ color: isImproving ? '#A78BFA' : isDeclining ? '#F87171' : '#9CA3AF', fontWeight: 'bold' }}>
                    {isImproving ? 'Improving' : isDeclining ? 'Declining' : 'Stable'}
                  </Text>
                  {isImproving && <Text style={{ color: '#F59E0B' }}> ⚡</Text>}
                  {isDeclining && <Text style={{ color: '#F87171' }}> ⚠️</Text>}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Future You Says (AI Message) */}
        {future_message && (
          <View style={styles.quoteBubble}>
            <View style={styles.quoteHeader}>
              <LinearGradient
                colors={['#8B5CF6', '#A78BFA']}
                style={styles.quoteAvatar}
              >
                <Ionicons name="sparkles" size={10} color="#FFF" />
              </LinearGradient>
              <Text style={styles.quoteAuthor}>FUTURE YOU SAYS</Text>
            </View>
            <Text style={styles.quoteText}>"{future_message}"</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const { xpNeeded, currentLevelXp } = calculateLevel(xp);
  const progressPercent = Math.min(100, Math.max(0, (currentLevelXp / xpNeeded) * 100));

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const stepsGoalMet = steps >= stepsGoal;
  const waterGoalMet = waterMl >= waterGoal;
  const proteinGoalMet = protein >= proteinGoal;
  const nutritionGoalMet = mealsLogged >= 4;
  const caloriesGoalMet = calories >= calorieGoal * 0.9 && calories <= calorieGoal * 1.1;
  const perfectDayGoalMet = stepsGoalMet && proteinGoalMet && caloriesGoalMet && waterGoalMet && nutritionGoalMet;

  const perfectDayProgress = (
    Math.min(1, Math.max(0, stepsGoalMet ? 1 : steps / stepsGoal)) +
    Math.min(1, Math.max(0, proteinGoalMet ? 1 : protein / proteinGoal)) +
    (caloriesGoalMet ? 1 : 0) +
    Math.min(1, Math.max(0, waterGoalMet ? 1 : waterMl / waterGoal)) +
    Math.min(1, Math.max(0, nutritionGoalMet ? 1 : mealsLogged / 4))
  ) / 5;

  const renderQuestCircle = (progress: number, completed: boolean) => {
    if (completed) {
      return (
        <Ionicons
          name="checkmark-circle"
          size={22}
          color={colors.accent}
        />
      );
    }
    const clampedProgress = Math.max(0, Math.min(1, progress || 0));
    const radius = 9;
    const strokeWidth = 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (clampedProgress * circumference);
    return (
      <View style={{ width: 22, height: 22, justifyContent: 'center', alignItems: 'center' }}>
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <SvgCircle
            cx="11"
            cy="11"
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.15)"
            strokeWidth={strokeWidth}
          />
          <SvgCircle
            cx="11"
            cy="11"
            r={radius}
            fill="none"
            stroke={colors.accent}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform="rotate(-90 11 11)"
          />
        </Svg>
      </View>
    );
  };
  const remainingCals = calorieGoal - calories;
  const xpMultiplier = streakDays >= 7 ? '2.0x' : streakDays >= 3 ? '1.5x' : '1.0x';

  const getEvolutionDetails = (lvl: number) => {
    if (lvl < 5) return { stage: 'Egg 🥚', img: require('../../assets/images/hatchling.png'), nextLvl: 5, nextStage: 'Hatchling 🐣', range: 'Lv. 1 - 4' };
    if (lvl < 10) return { stage: 'Hatchling 🐣', img: require('../../assets/images/hatchling.png'), nextLvl: 10, nextStage: 'Explorer 🧭', range: 'Lv. 5 - 9' };
    if (lvl < 20) return { stage: 'Explorer 🧭', img: require('../../assets/images/explorer.png'), nextLvl: 20, nextStage: 'Athlete 🏃‍♂️', range: 'Lv. 10 - 19' };
    if (lvl < 35) return { stage: 'Athlete 🏃‍♂️', img: require('../../assets/images/hunter.png'), nextLvl: 35, nextStage: 'Warrior ⚔️', range: 'Lv. 20 - 34' };
    if (lvl < 50) return { stage: 'Warrior ⚔️', img: require('../../assets/images/guardian.png'), nextLvl: 50, nextStage: 'Legend 👑', range: 'Lv. 35 - 49' };
    return { stage: 'Legend 👑', img: require('../../assets/images/legend.png'), nextLvl: 100, nextStage: 'Ultimate Legend 🏆', range: 'Lv. 50+' };
  };
  const evoDetails = getEvolutionDetails(level);

  const activeMissions = [
    stepsGoalMet,
    proteinGoalMet,
    caloriesGoalMet,
    waterGoalMet,
    perfectDayGoalMet,
    nutritionGoalMet
  ];
  const completedMissionsCount = activeMissions.filter(Boolean).length;
  const totalMissionsCount = activeMissions.length;
  const missionsProgressPercent = Math.round((completedMissionsCount / totalMissionsCount) * 100);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}, {userName} 👋</Text>
          <Text style={styles.date}>{getDate()}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/profile')}>
          <View style={styles.avatar}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.avatarText}>
                {userName.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView 
        ref={scrollRef}
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollContent}
        onScroll={(e) => {
          globalScrollY = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        onContentSizeChange={(w, h) => {
          if (!scrollRestored && globalScrollY > 0 && h > globalScrollY) {
            scrollRef.current?.scrollTo({ y: globalScrollY, animated: false });
            setScrollRestored(true);
          }
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        
        {/* 1. Health Score Card */}
        <View style={styles.healthScoreCard}>
          <Text style={styles.cardHeaderTitle}>HEALTH SCORE</Text>
          <View style={styles.scoreMainRow}>
            <Text style={styles.scoreBigValue}>{score}</Text>
            <Text style={styles.scoreMaxLabel}>/ 100</Text>
          </View>
          
          <View style={styles.scoreMetaRow}>
            <Text style={styles.scoreDeltaText}>
              {scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta} vs yesterday
              {score > 0 && dailyBracket < 100 ? `  •  Top ${dailyBracket}% today` : ''}
            </Text>
          </View>

          {(!healthKitConnected) && (
            <TouchableOpacity 
              style={styles.connectHealthBanner}
              onPress={() => router.push('/profile')}
              activeOpacity={0.7}
            >
              <Ionicons name="information-circle-outline" size={13} color="#A78BFA" style={{ marginRight: 4 }} />
              <Text style={styles.connectHealthBannerText}>Connect Apple Health to improve score accuracy</Text>
            </TouchableOpacity>
          )}

          {/* Contributors Breakdown Grid */}
          <View style={styles.contributorsGrid}>
            <View style={styles.contributorItem}>
              <Text style={styles.contributorName}>Nutrition</Text>
              <Text style={styles.contributorPoints}>{nutritionPoints}/35</Text>
              <Text style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.4)', marginTop: 2 }}>{calories}/{calorieGoal} kcal</Text>
            </View>
            <View style={styles.contributorItemRight}>
              <Text style={[styles.contributorName, styles.contributorTextRight]}>Movement</Text>
              <Text style={[styles.contributorPoints, styles.contributorTextRight]}>
                {scoreBreakdown && scoreBreakdown.breakdown.steps.max === 0 && scoreBreakdown.breakdown.workout.max === 0
                  ? '--'
                  : `${movementPoints}/${(scoreBreakdown ? (scoreBreakdown.breakdown.steps.max + scoreBreakdown.breakdown.workout.max) : 30)}`
                }
              </Text>
              <Text style={{ fontSize: 9, color: 'rgba(255, 255, 255, 0.4)', marginTop: 2, textAlign: 'right' }}>🔥 {activeCalories} kcal</Text>
            </View>
            <View style={styles.contributorItem}>
              <Text style={styles.contributorName}>Sleep</Text>
              <Text style={[styles.contributorPoints, scoreBreakdown && scoreBreakdown.breakdown.sleepDuration.max === 0 && { fontSize: 11 }]}>
                {scoreBreakdown && scoreBreakdown.breakdown.sleepDuration.max === 0
                  ? (!healthKitConnected ? 'Not Yet Tracked' : 'Data Unavailable')
                  : `${sleepPoints}/${(scoreBreakdown ? scoreBreakdown.breakdown.sleepDuration.max : 25)}`
                }
              </Text>
            </View>
            <View style={styles.contributorItemRight}>
              <Text style={[styles.contributorName, styles.contributorTextRight]}>Recovery</Text>
              <Text style={[styles.contributorPoints, styles.contributorTextRight]}>{recoveryPoints}/10</Text>
            </View>
          </View>

          <TouchableOpacity 
            style={styles.viewBreakdownRow}
            onPress={() => setScoreModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.viewBreakdownText}>View Details</Text>
            <Ionicons name="chevron-forward" size={12} color="#A78BFA" />
          </TouchableOpacity>
        </View>

        {/* 2. Evolution Promoted Card */}
        <Text style={styles.sectionTitle}>EVOLUTION</Text>
        <View style={styles.promotedLevelsCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {/* Left Side: Scanner Outline */}
            <View style={styles.scannerContainer}>
              {userGender === 'female' ? renderFemaleOutline() : renderMaleOutline()}
              <Animated.View style={[
                styles.scanLine,
                {
                  transform: [{ translateY: scanAnim }],
                  backgroundColor: level >= 50 ? '#F59E0B' : colors.accent,
                  shadowColor: level >= 50 ? '#F59E0B' : colors.accent,
                }
              ]} />
            </View>

            {/* Right Side: Level Info & Progression */}
            <View style={{ flex: 1, gap: 6 }}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.progressionLevelText}>Level {level}</Text>
                <TouchableOpacity onPress={showBioCharacterInfo} activeOpacity={0.7}>
                  <Ionicons name="help-circle-outline" size={16} color="rgba(255, 255, 255, 0.4)" />
                </TouchableOpacity>
              </View>
              <Text style={styles.progressionCharacterStage}>Stage: {evoDetails.stage}</Text>
              
              <View style={styles.miniProgressBarBgContainer}>
                <View style={[styles.miniProgressBarFillContainer, { width: `${progressPercent}%` }]} />
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <Text style={styles.avatarXpText}>{currentLevelXp} / {xpNeeded} XP</Text>
                <Text style={styles.xpMultiplierText}>Multiplier: {xpMultiplier}</Text>
              </View>

              {/* Next Evolution target text */}
              <Text style={styles.nextEvolutionText}>
                Next Evolution: {evoDetails.nextStage} at Level {evoDetails.nextLvl}
              </Text>
            </View>
          </View>
        </View>

        {/* 3. Today's Mission Centerpiece */}
        <View style={styles.missionsHeaderContainer}>
          <View style={styles.missionsHeaderTopRow}>
            <Text style={styles.missionsSectionTitle}>TODAY'S MISSIONS</Text>
            <View style={styles.missionsProgressTextContainer}>
              <Text style={styles.missionsProgressText}>
                {completedMissionsCount} / {totalMissionsCount} Completed
              </Text>
              <Text style={styles.missionsProgressPercent}>{missionsProgressPercent}%</Text>
            </View>
          </View>
          <View style={styles.missionsProgressBarBg}>
            <View style={[styles.missionsProgressBarFill, { width: `${missionsProgressPercent}%` }]} />
          </View>
        </View>
        
        <View style={styles.questsContainer}>
          
          {/* Steps Quest */}
          <View style={styles.questCard}>
            <View style={styles.questDetails}>
              <Text style={[styles.questName, stepsGoalMet && styles.questTextComplete]}>Walk {stepsGoal.toLocaleString()} Steps</Text>
              <Text style={styles.questProgress}>{steps.toLocaleString()} / {stepsGoal.toLocaleString()} steps</Text>
            </View>
            <Text style={styles.questRewardText}>+45 XP</Text>
            {renderQuestCircle(steps / stepsGoal, stepsGoalMet)}
          </View>

          {/* Protein Quest */}
          <View style={styles.questCard}>
            <View style={styles.questDetails}>
              <Text style={[styles.questName, proteinGoalMet && styles.questTextComplete]}>Hit Protein Target</Text>
              <Text style={styles.questProgress}>{protein}g / {proteinGoal}g protein</Text>
            </View>
            <Text style={styles.questRewardText}>+50 XP</Text>
            {renderQuestCircle(protein / proteinGoal, proteinGoalMet)}
          </View>

          {/* Calories Quest */}
          <View style={styles.questCard}>
            <View style={styles.questDetails}>
              <Text style={[styles.questName, caloriesGoalMet && styles.questTextComplete]}>Stay Within Calories</Text>
              <Text style={styles.questProgress}>{calories} / {calorieGoal} kcal</Text>
            </View>
            <Text style={styles.questRewardText}>+30 XP</Text>
            {renderQuestCircle(calories / calorieGoal, caloriesGoalMet)}
          </View>

          {/* Water Quest */}
          <View style={styles.questCard}>
            <View style={styles.questDetails}>
              <Text style={[styles.questName, waterGoalMet && styles.questTextComplete]}>Drink {(waterGoal/1000).toFixed(1)}L Water</Text>
              <Text style={styles.questProgress}>{waterMl} / {waterGoal} ml</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.questActionBtn} 
              onPress={handleAddWater}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={12} color="#000000" style={{ marginRight: 2 }} />
              <Text style={styles.questActionBtnText}>250ml</Text>
            </TouchableOpacity>

            <Text style={styles.questRewardText}>+40 XP</Text>
            {renderQuestCircle(waterMl / waterGoal, waterGoalMet)}
          </View>

          {/* Secondary Missions */}
          {missionsExpanded && (
            <>
              {/* Log Meals Quest */}
              <View style={styles.questCard}>
                <View style={styles.questDetails}>
                  <Text style={[styles.questName, nutritionGoalMet && styles.questTextComplete]}>Log 4 Meals</Text>
                  <Text style={styles.questProgress}>{mealsLogged} / 4 logged meals</Text>
                </View>
                <Text style={styles.questRewardText}>+30 XP</Text>
                {renderQuestCircle(mealsLogged / 4, nutritionGoalMet)}
              </View>

              {/* Perfect Day Quest */}
              <View style={styles.questCard}>
                <View style={styles.questDetails}>
                  <Text style={[styles.questName, perfectDayGoalMet && styles.questTextComplete]}>Perfect Day</Text>
                  <Text style={styles.questProgress}>
                    {((stepsGoalMet ? 1 : 0) + (proteinGoalMet ? 1 : 0) + (caloriesGoalMet ? 1 : 0) + (waterGoalMet ? 1 : 0) + (nutritionGoalMet ? 1 : 0))} / 5 daily goals met
                  </Text>
                </View>
                <Text style={styles.questRewardText}>+45 XP</Text>
                {renderQuestCircle(perfectDayProgress, perfectDayGoalMet)}
              </View>
            </>
          )}

          {/* Toggle Button */}
          <TouchableOpacity 
            style={styles.expandMissionsBtn} 
            onPress={() => setMissionsExpanded(!missionsExpanded)}
            activeOpacity={0.7}
          >
            <Text style={styles.expandMissionsBtnText}>
              {missionsExpanded ? 'Show Less' : 'View More Missions'}
            </Text>
            <Ionicons 
              name={missionsExpanded ? "chevron-up" : "chevron-down"} 
              size={14} 
              color={colors.accent} 
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>FUTURE YOU™</Text>
        {renderFutureYouCard()}

      </ScrollView>

      {/* Health Score Breakdown Modal Overlay */}
      <Modal
        visible={scoreModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setScoreModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackgroundDismiss} 
            activeOpacity={1} 
            onPress={() => setScoreModalVisible(false)}
          />
          <View style={[styles.shareCardContainer, { maxHeight: '80%', paddingHorizontal: 12 }]}>
            <View style={[styles.shareCard, { backgroundColor: '#0B0B0F', borderColor: '#A78BFA', borderWidth: 1.5, padding: 20, width: '100%' }]}>
              <Text style={{ textAlign: 'center', color: '#A78BFA', fontSize: 11, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 12 }}>HEALTH SCORE BREAKDOWN</Text>
              
              <View style={{ alignItems: 'center', marginVertical: 12 }}>
                <Text style={{ color: '#FFFFFF', fontSize: 54, fontWeight: 'bold' }}>{score}</Text>
                <Text style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 12 }}>Total Out of 100 Points</Text>
              </View>

              <ScrollView style={{ width: '100%', marginVertical: 8, maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                {scoreBreakdown && (
                  <View style={{ gap: 14 }}>
                    {/* Nutrition (35 pts) */}
                    <View style={styles.breakdownSec}>
                      <View style={styles.breakdownSecHeader}>
                        <Text style={styles.breakdownSecTitle}>NUTRITION</Text>
                        <Text style={styles.breakdownSecScore}>{scoreBreakdown.nutritionScore} / 35</Text>
                      </View>
                      <View style={styles.breakdownItemsList}>
                        <View style={styles.breakdownItemRow}>
                          <Text style={styles.breakdownItemLabel}>🥩 Protein</Text>
                          <Text style={styles.breakdownItemVal}>+{scoreBreakdown.breakdown.protein.score} / 20</Text>
                        </View>
                        <Text style={styles.breakdownItemSub}>{scoreBreakdown.breakdown.protein.reason}</Text>

                        <View style={styles.breakdownItemRow}>
                          <Text style={styles.breakdownItemLabel}>⚡ Calories</Text>
                          <Text style={styles.breakdownItemVal}>+{scoreBreakdown.breakdown.calories.score} / 10</Text>
                        </View>
                        <Text style={[styles.breakdownItemSub, { color: '#A78BFA', fontWeight: 'bold' }]}>
                          Consumed: {calories} kcal | Target: {calorieGoal} kcal | {calorieGoal - calories >= 0 ? `${calorieGoal - calories} kcal remaining` : `${Math.abs(calorieGoal - calories)} kcal over`}
                        </Text>
                        <Text style={styles.breakdownItemSub}>{scoreBreakdown.breakdown.calories.reason}</Text>

                        <View style={styles.breakdownItemRow}>
                          <Text style={styles.breakdownItemLabel}>Spacing Consistency</Text>
                          <Text style={styles.breakdownItemVal}>+{scoreBreakdown.breakdown.mealDistribution.score} / 5</Text>
                        </View>
                        <Text style={styles.breakdownItemSub}>{scoreBreakdown.breakdown.mealDistribution.reason}</Text>
                      </View>
                    </View>

                    {/* Movement (30 pts) */}
                    <View style={styles.breakdownSec}>
                      <View style={styles.breakdownSecHeader}>
                        <Text style={styles.breakdownSecTitle}>MOVEMENT</Text>
                        <Text style={styles.breakdownSecScore}>
                          {scoreBreakdown.breakdown.steps.max + scoreBreakdown.breakdown.workout.max === 0
                            ? 'Not Tracked'
                            : `${scoreBreakdown.activityScore} / ${scoreBreakdown.breakdown.steps.max + scoreBreakdown.breakdown.workout.max}`
                          }
                        </Text>
                      </View>
                      <View style={styles.breakdownItemsList}>
                        <View style={styles.breakdownItemRow}>
                          <Text style={styles.breakdownItemLabel}>👟 Steps</Text>
                          <Text style={styles.breakdownItemVal}>
                            {scoreBreakdown.breakdown.steps.max === 0 
                              ? 'Not Connected' 
                              : `+${scoreBreakdown.breakdown.steps.score} / ${scoreBreakdown.breakdown.steps.max}`
                            }
                          </Text>
                        </View>
                        <Text style={styles.breakdownItemSub}>{scoreBreakdown.breakdown.steps.reason}</Text>

                        <View style={styles.breakdownItemRow}>
                          <Text style={styles.breakdownItemLabel}>🏃‍♂️ Exercise / Workouts</Text>
                          <Text style={styles.breakdownItemVal}>
                            {scoreBreakdown.breakdown.workout.max === 0 
                              ? 'Not Connected' 
                              : `+${scoreBreakdown.breakdown.workout.score} / ${scoreBreakdown.breakdown.workout.max}`
                            }
                          </Text>
                        </View>
                        <Text style={styles.breakdownItemSub}>{scoreBreakdown.breakdown.workout.reason}</Text>
                      </View>
                    </View>

                    {/* Sleep (25 pts) */}
                    <View style={styles.breakdownSec}>
                      <View style={styles.breakdownSecHeader}>
                        <Text style={styles.breakdownSecTitle}>SLEEP</Text>
                        <Text style={styles.breakdownSecScore}>
                          {scoreBreakdown.breakdown.sleepDuration.max === 0
                            ? (!healthKitConnected ? 'Not Tracked' : 'Data Unavailable')
                            : `${scoreBreakdown.sleepScore} / ${scoreBreakdown.breakdown.sleepDuration.max}`
                          }
                        </Text>
                      </View>
                      <View style={styles.breakdownItemsList}>
                        <View style={styles.breakdownItemRow}>
                          <Text style={styles.breakdownItemLabel}>😴 Sleep Quality</Text>
                          <Text style={styles.breakdownItemVal}>
                            {scoreBreakdown.breakdown.sleepDuration.max === 0
                              ? (!healthKitConnected ? 'Not Connected' : 'Data Unavailable')
                              : `+${scoreBreakdown.breakdown.sleepDuration.score} / ${scoreBreakdown.breakdown.sleepDuration.max}`
                            }
                          </Text>
                        </View>
                        <Text style={styles.breakdownItemSub}>{scoreBreakdown.breakdown.sleepDuration.reason}</Text>
                      </View>
                    </View>

                    {/* Recovery (10 pts) */}
                    <View style={styles.breakdownSec}>
                      <View style={styles.breakdownSecHeader}>
                        <Text style={styles.breakdownSecTitle}>RECOVERY</Text>
                        <Text style={styles.breakdownSecScore}>{scoreBreakdown.recoveryScore} / 10</Text>
                      </View>
                      <View style={styles.breakdownItemsList}>
                        <View style={styles.breakdownItemRow}>
                          <Text style={styles.breakdownItemLabel}>💧 Hydration</Text>
                          <Text style={styles.breakdownItemVal}>+{scoreBreakdown.breakdown.water.score} / 10</Text>
                        </View>
                        <Text style={styles.breakdownItemSub}>{scoreBreakdown.breakdown.water.reason}</Text>
                      </View>
                    </View>
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity style={[styles.shareCloseBtn, { width: '100%', marginTop: 16 }]} onPress={() => setScoreModalVisible(false)}>
                <Text style={styles.shareCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  centered: { flex: 1, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, backgroundColor: '#000000' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  greeting: { color: colors.text, fontSize: 20, fontWeight: 'bold' },
  date: { color: colors.subtext, fontSize: 13, marginTop: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#111117', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 22, resizeMode: 'cover' },
  avatarText: { color: colors.text, fontWeight: 'bold' },
  
  // Health Score Card Styles
  healthScoreCard: { backgroundColor: '#111117', borderRadius: 24, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  cardHeaderTitle: { color: 'rgba(255, 255, 255, 0.45)', fontSize: 10, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 12 },
  scoreMainRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2, marginBottom: 4 },
  scoreBigValue: { color: '#FFF', fontSize: 44, fontWeight: 'bold' },
  scoreMaxLabel: { color: colors.subtext, fontSize: 18 },
  scoreMetaRow: { gap: 8, marginTop: 4, marginBottom: 16 },
  scoreDeltaText: { color: colors.subtext, fontSize: 13, fontWeight: '500' },

  // Contributors breakdown grid
  contributorsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 16, marginTop: 8 },
  contributorItem: { width: '48%', gap: 4, marginVertical: 4 },
  contributorItemRight: { width: '48%', gap: 4, marginVertical: 4, alignItems: 'flex-end' },
  contributorName: { color: colors.subtext, fontSize: 13 },
  contributorPoints: { color: '#FFF', fontSize: 15, fontWeight: 'bold', marginTop: 1 },
  contributorTextRight: { textAlign: 'right' },

  // Health Connect Banner
  connectHealthBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 12,
  },
  connectHealthBannerText: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },

  // View breakdown row
  viewBreakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 18,
    marginTop: 14,
  },
  viewBreakdownText: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: '600',
  },

  sectionTitle: { color: colors.subtext, fontSize: 11, letterSpacing: 1.5, marginBottom: 12, fontWeight: 'bold', marginTop: 28, textTransform: 'uppercase' },
  futureYouCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulsingGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  liveIndicatorText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10.5,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  forecastBadge: {
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },
  forecastBadgeText: {
    color: '#A78BFA',
    fontSize: 10,
    fontWeight: 'bold',
  },

  // Quests Board styling
  questsContainer: { gap: 12, marginBottom: 12 },
  questCard: { backgroundColor: '#111117', borderRadius: 24, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  questDetails: { flex: 1, gap: 2 },
  questName: { color: colors.text, fontSize: 14, fontWeight: 'bold' },
  questTextComplete: { color: colors.subtext, textDecorationLine: 'line-through' },
  questProgress: { color: colors.subtext, fontSize: 12 },
  questActionBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
  questActionBtnText: { color: '#000000', fontSize: 12, fontWeight: 'bold' },

  // Bio-Character Avatar & Health Age Styles
  sideBySideRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  halfCard: { flex: 1, backgroundColor: '#111117', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', position: 'relative' },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 6 },
  scannerContainer: { width: 70, height: 120, justifyContent: 'center', alignItems: 'center', position: 'relative', overflow: 'hidden', marginVertical: 4 },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 2, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 6, elevation: 4 },
  evolutionAvatar: { width: 70, height: 70, alignSelf: 'center', marginVertical: 4 },
  avatarLabelText: { color: colors.text, fontSize: 13, fontWeight: 'bold', marginTop: 4, textAlign: 'center' },
  avatarStageText: { color: colors.subtext, fontSize: 11, marginTop: 2, textAlign: 'center' },
  miniProgressBarBg: { height: 4, width: '80%', backgroundColor: '#0B0B0F', borderRadius: 2, overflow: 'hidden', marginTop: 6, alignSelf: 'center' },
  miniProgressBarFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },
  avatarXpText: { color: colors.subtext, fontSize: 10, marginTop: 4, fontWeight: '500' },
  ageLabel: { color: colors.subtext, fontSize: 9, fontWeight: 'bold', letterSpacing: 0.5, textTransform: 'uppercase' },
  ageValue: { color: '#FFFFFF', fontSize: 22, fontWeight: 'bold', marginTop: 2 },
  healthAgeValue: { color: colors.accent, fontSize: 22, fontWeight: 'bold', marginTop: 2 },
  ageUnit: { fontSize: 12, fontWeight: 'normal', color: colors.subtext },
  ageDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 4 },
  ageBadge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginTop: 4 },
  ageBadgeText: { fontSize: 11, fontWeight: 'bold' },

  // Today's Progress & Missions Merged Header Styles
  missionsHeaderContainer: { marginTop: 28, marginBottom: 16 },
  missionsHeaderTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  missionsSectionTitle: { color: colors.subtext, fontSize: 11, letterSpacing: 1.5, fontWeight: 'bold', textTransform: 'uppercase' },
  missionsProgressTextContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  missionsProgressText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600' },
  missionsProgressPercent: { color: colors.accent, fontSize: 11, fontWeight: 'bold' },
  missionsProgressBarBg: { height: 4, width: '100%', backgroundColor: '#111117', borderRadius: 2, overflow: 'hidden' },
  missionsProgressBarFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },

  // Reduced Visible Missions Styles
  expandMissionsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, marginTop: 0 },
  expandMissionsBtnText: { color: colors.accent, fontSize: 13, fontWeight: 'bold' },

  // Promoted LEVELS Card Styles
  promotedLevelsCard: { backgroundColor: '#111117', borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  miniProgressBarBgContainer: { height: 6, width: '100%', backgroundColor: '#0B0B0F', borderRadius: 3, overflow: 'hidden', marginTop: 6 },
  miniProgressBarFillContainer: { height: '100%', backgroundColor: colors.accent, borderRadius: 3 },
  xpMultiplierText: { color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 'bold' },
  nextEvolutionText: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, fontStyle: 'italic', marginTop: 4 },

  // Premium Future You Card Styles
  futureYouCard: {
    backgroundColor: '#111117',
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  futureYouHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  futureYouTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  futureYouDirection: {
    fontSize: 14,
  },
  futureYouMain: {
    marginVertical: 6,
    gap: 6,
  },
  futureYouDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  futureYouLabel: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    fontWeight: '500',
  },
  futureYouValue: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },

  futureYouCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  futureYouCardLeft: {
    justifyContent: 'center',
    flex: 1.1,
  },
  futureYouCardHeroVal: {
    fontSize: 44,
    fontWeight: 'bold',
    letterSpacing: -1,
    color: '#A78BFA',
  },
  futureYouCardHeroUnit: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
    marginLeft: 4,
  },
  futureYouCardSub: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  futureYouCardRight: {
    flex: 0.9,
    justifyContent: 'center',
    gap: 6,
    alignItems: 'flex-end',
  },
  rightInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 1,
  },
  rightInfoLabel: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    fontWeight: '600',
  },
  rightInfoValue: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  futureYouSaysContainer: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 10,
  },
  futureYouSaysLabel: {
    color: '#A78BFA',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  actionButtonContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  actionButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quoteBubble: {
    backgroundColor: 'rgba(167, 139, 250, 0.04)',
    borderColor: 'rgba(167, 139, 250, 0.12)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginTop: 16,
  },
  quoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  quoteAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quoteAuthor: {
    color: '#A78BFA',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  quoteText: {
    color: '#E9D5FF',
    fontSize: 12.5,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  futureYouCardDirection: {
    fontSize: 15,
    marginBottom: 2,
  },
  futureYouCardRightSub: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  futureYouCardContext: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 2,
  },
  futureYouCardScoreBreakdown: {
    marginTop: 8,
    gap: 1,
  },
  futureYouCardBreakdownText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 10.5,
    fontWeight: '600',
  },
  futureYouTapRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    paddingTop: 12,
    gap: 4,
  },
  leftScoreText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
  },
  lockedAiStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A78BFA',
  },
  lockedDayBadge: {
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
  },
  lockedDayBadgeText: {
    color: '#A78BFA',
    fontSize: 10.5,
    fontWeight: 'bold',
  },
  futureYouTapText: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: 'bold',
  },
  lockedTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  lockedSub: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 1,
  },
  futureYouProgressBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginVertical: 12,
  },
  futureYouProgressBarFill: {
    height: '100%',
    backgroundColor: '#A78BFA',
    borderRadius: 3,
  },
  lockedObservation: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },



  // New V1 Refinement Styles
  questRewardText: { color: colors.accent, fontSize: 12, fontWeight: 'bold' },
  
  // Progression Card
  progressionCard: {
    backgroundColor: '#111117',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 20,
  },
  progressionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressionLevelText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  progressionCharacterStage: {
    color: '#A78BFA',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  progressionXpText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressionPercentText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    marginTop: 2,
  },
  progressBarBg: {
    height: 8,
    width: '100%',
    backgroundColor: '#0B0B0F',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  xpHelpText: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 10,
    lineHeight: 14,
  },

  // Modal Overlays
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackgroundDismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  shareCardContainer: {
    width: '90%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareCard: {
    backgroundColor: '#111117',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  shareCloseBtn: {
    backgroundColor: '#222',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  shareCloseBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Breakdown Sections
  breakdownSec: {
    backgroundColor: '#161622',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    marginBottom: 10,
  },
  breakdownSecHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    paddingBottom: 6,
    marginBottom: 8,
  },
  breakdownSecTitle: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  breakdownSecScore: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  breakdownItemsList: {
    gap: 4,
  },
  breakdownItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownItemLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  breakdownItemVal: {
    color: '#00D4FF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  breakdownItemSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    marginBottom: 6,
  },
});
