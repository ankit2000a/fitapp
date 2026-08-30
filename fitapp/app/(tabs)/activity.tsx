import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, Modal, Alert, Share, Image } from 'react-native';
import * as Sharing from 'expo-sharing';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import { buildUserContext, getLocalDateString } from '../../lib/userContext';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { initHealthKit, getTodaySteps, getSleepDetails, getTodayActiveMinutes, getTodayWorkoutMinutes, isHealthKitAvailable } from '../../lib/healthkit';
import { calculateHealthScore } from '../../lib/scoring';
import { appEvents, PROFILE_UPDATED_EVENT } from '../../lib/events';

interface FeedItem {
  id: string;
  type: 'perfect' | 'quest' | 'streak' | 'score' | 'age' | 'weekly_recap';
  time: string;
  title: string;
  subtitle: string;
  icon: any;
  color: string;
  // Meta properties for share card details
  shareDetails?: {
    cardType: 'perfect' | 'streak' | 'surge' | 'age' | 'weekly_recap';
    title?: string;
    value?: string;
    subtext?: string;
    checklist?: { label: string; checked: boolean }[];
    name?: string;
    highestScore?: number;
    xpEarned?: number;
    highestRank?: number;
    streak?: number;
    biggestWin?: string;
  };
}

interface FeedGroup {
  dateLabel: string;
  items: FeedItem[];
}

export default function ActivityScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [score, setScore] = useState(0);
  const [scoreDelta, setScoreDelta] = useState(0);
  const [streak, setStreak] = useState(0);
  const [projectedFutureScore, setProjectedFutureScore] = useState(50);
  const [futureScoreImprovement, setFutureScoreImprovement] = useState(0);
  const [feed, setFeed] = useState<FeedGroup[]>([]);

  // Dev Sandbox State
  const [sandboxExpanded, setSandboxExpanded] = useState(false);
  const [sandboxActive, setSandboxActive] = useState(false);
  const [simulatedDay, setSimulatedDay] = useState<'day1_unlogged' | 'day1_logged_hour1' | 'day1_logged_after1' | 'day2' | 'day3' | 'day4' | 'day8_recap'>('day1_unlogged');
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [profileName, setProfileName] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);

  // Dynamic Card Labels
  const [card1Label, setCard1Label] = useState('🔥 BIGGEST WIN THIS WEEK');
  const [card2Label, setCard2Label] = useState('🏆 HIGHEST RANK REACHED');
  const [card3Label, setCard3Label] = useState('⚡ BIGGEST SCORE JUMP');
  const [hasLogged, setHasLogged] = useState(false);
  const [shouldShowRankCard, setShouldShowRankCard] = useState(true);

  // Emotional highlights states
  const [biggestWin, setBiggestWin] = useState({ title: 'Started Logging', sub: 'Ready to build momentum' });
  const [highestRank, setHighestRank] = useState({ title: 'Top 25% Global', sub: 'Active tracking standing' });
  const [biggestJump, setBiggestJump] = useState({ title: '+8 Points', sub: 'Upward score movement' });

  const [isSharing, setIsSharing] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareCardData, setShareCardData] = useState<any>(null);
  const viewShotRef = useRef<any>(null);

  const handleNativeShare = async (item: FeedItem) => {
    if (!item.shareDetails) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShareCardData(item.shareDetails);
    setShareModalVisible(true);
  };

  const handleSharePress = async () => {
    if (isSharing) return;
    setIsSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (viewShotRef.current) {
        const uri = await captureRef(viewShotRef, { format: 'png', quality: 0.95 });
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Share Achievement Card`,
        });
      }
    } catch (err) {
      console.log('Error capturing share card:', err);
      Alert.alert('Sharing Failed', 'Could not generate the achievement card image.');
    } finally {
      setIsSharing(false);
    }
  };

  const loadFeedData = async () => {
    try {
      if (sandboxActive) {
        setLoading(true);
        // Implement mock override based on simulatedDay
        let todayScore = 55;
        let activeStreak = 0;
        let todayDelta = 0;
        let card1LabelVal = '🔥 BIGGEST WIN THIS WEEK';
        let card2LabelVal = '🏆 HIGHEST RANK REACHED';
        let card3LabelVal = '⚡ BIGGEST SCORE JUMP';
        let biggestWinData = { title: 'First Step Taken', sub: 'Logging journey initiated today!' };
        let highestRankData = { title: 'Rank Unlocking...', sub: 'Log for 3 days to reveal standings' };
        let biggestJumpData = { title: '—', sub: 'Unlocks on your second day' };
        let feedGroups: FeedGroup[] = [];
        let mockHasLogged = true;
        let mockShouldShowRankCard = true;

        if (simulatedDay === 'day1_unlogged') {
          todayScore = 0;
          activeStreak = 0;
          todayDelta = 0;
          mockHasLogged = false;
          mockShouldShowRankCard = false;
          card1LabelVal = '🔥 BIGGEST WIN TODAY';
          biggestWinData = { title: 'Start Logging Habits', sub: 'Log your food, water, or steps to record a win!' };
          card2LabelVal = '🏆 HIGHEST RANK REACHED';
          highestRankData = { title: 'Rank Unlocking...', sub: 'Log for 3 days to reveal standings' };
          card3LabelVal = '⚡ TODAY\'S HEALTH SCORE';
          biggestJumpData = { title: '0 Points', sub: 'Log habits to see your score rise!' };
          feedGroups = [];
        } else if (simulatedDay === 'day1_logged_hour1') {
          todayScore = 55;
          activeStreak = 1;
          todayDelta = 0;
          mockShouldShowRankCard = true;
          card1LabelVal = '🔥 BIGGEST WIN TODAY';
          biggestWinData = { title: 'First Step Taken', sub: 'Logging journey initiated today!' };
          card2LabelVal = '🏆 HIGHEST RANK REACHED';
          highestRankData = { title: 'Analyzing Standing...', sub: 'Standings will reveal 1 hour after signup' };
          card3LabelVal = '⚡ TODAY\'S HEALTH SCORE';
          biggestJumpData = { title: 'Score: 55', sub: 'Keep logging habits to increase your score' };
          feedGroups = [];
        } else if (simulatedDay === 'day1_logged_after1') {
          todayScore = 55;
          activeStreak = 1;
          todayDelta = 0;
          mockShouldShowRankCard = true;
          card1LabelVal = '🔥 BIGGEST WIN TODAY';
          biggestWinData = { title: 'First Step Taken', sub: 'Logging journey initiated today!' };
          card2LabelVal = '🏆 HIGHEST RANK REACHED';
          highestRankData = { title: 'Improve score to rank up', sub: 'Based on your high score of 55/100' };
          card3LabelVal = '⚡ TODAY\'S HEALTH SCORE';
          biggestJumpData = { title: 'Score: 55', sub: 'Keep logging habits to increase your score' };
          feedGroups = [];
        } else if (simulatedDay === 'day2') {
          todayScore = 65;
          activeStreak = 2;
          todayDelta = 10;
          mockShouldShowRankCard = true;
          card1LabelVal = '🔥 BIGGEST WIN THIS WEEK';
          biggestWinData = { title: '🔥 2-Day Active Streak', sub: 'Maintaining solid consistency' };
          card2LabelVal = '🏆 HIGHEST RANK REACHED';
          highestRankData = { title: 'Improve score to rank up', sub: 'Based on your high score of 65/100' };
          card3LabelVal = '⚡ BIGGEST SCORE JUMP';
          biggestJumpData = { title: '+10 Points', sub: 'Highest upward score movement in a day' };
          feedGroups = [
            {
              dateLabel: 'TODAY',
              items: [
                {
                  id: 'milestone-improve-mock',
                  type: 'score',
                  time: 'Surge',
                  title: '⚡ Health Score Surge',
                  subtitle: '+10 points today! Upward score movement.',
                  icon: 'trending-up-outline',
                  color: colors.accent,
                  shareDetails: {
                    cardType: 'surge',
                    title: 'HEALTH SCORE SURGE',
                    value: '+10 Points',
                    subtext: 'You built upward wellness momentum.'
                  }
                }
              ]
            }
          ];
        } else if (simulatedDay === 'day3') {
          todayScore = 82;
          activeStreak = 3;
          todayDelta = 17;
          mockShouldShowRankCard = true;
          card1LabelVal = '🔥 BIGGEST WIN THIS WEEK';
          biggestWinData = { title: '🏆 Wellness Surge', sub: 'Reached an impressive score of 82/100' };
          card2LabelVal = '🏆 HIGHEST RANK REACHED';
          highestRankData = { title: 'Top 15% Global', sub: 'Based on your high score of 82/100' };
          card3LabelVal = '⚡ BIGGEST SCORE JUMP';
          biggestJumpData = { title: '+17 Points', sub: 'Highest upward score movement in a day' };
          feedGroups = [
            {
              dateLabel: 'TODAY',
              items: [
                {
                  id: 'milestone-bracket-mock',
                  type: 'streak',
                  time: 'Standings',
                  title: 'Entered Top 15% 🏆',
                  subtitle: 'Your wellness profile was better than 85% of users today!',
                  icon: 'trophy-outline',
                  color: colors.accent,
                  shareDetails: {
                    cardType: 'streak',
                    title: 'GLOBAL BRACKET',
                    value: 'Top 15%',
                    subtext: 'Better than 85% of wellness trackers globally today.'
                  }
                },
                {
                  id: 'milestone-duel-mock',
                  type: 'perfect',
                  time: 'Duel Win',
                  title: 'Won Duel Against @rahulfit 🏆',
                  subtitle: 'Claimed victory in "Step Clash" and earned +500 XP!',
                  icon: 'medal-outline',
                  color: '#FFD700',
                  shareDetails: {
                    cardType: 'perfect',
                    title: 'DUEL VICTORY',
                    value: 'Step Clash',
                    subtext: 'Defeated @rahulfit in duel.'
                  }
                }
              ]
            }
          ];
        } else if (simulatedDay === 'day4') {
          todayScore = 92;
          activeStreak = 4;
          todayDelta = 10;
          mockShouldShowRankCard = true;
          card1LabelVal = '🔥 BIGGEST WIN THIS WEEK';
          biggestWinData = { title: '⭐ Elite Day Completed', sub: 'Hit optimal score of 92/100!' };
          card2LabelVal = '🏆 HIGHEST RANK REACHED';
          highestRankData = { title: 'Top 10% Global', sub: 'Based on your high score of 92/100' };
          card3LabelVal = '⚡ BIGGEST SCORE JUMP';
          biggestJumpData = { title: '+10 Points', sub: 'Highest upward score movement in a day' };
          feedGroups = [
            {
              dateLabel: 'TODAY',
              items: [
                {
                  id: 'milestone-elite-mock',
                  type: 'perfect',
                  time: 'Completed',
                  title: '⭐ Elite Day',
                  subtitle: 'Outstanding alignment achieved. Reached health score of 92/100 today!',
                  icon: 'checkmark-circle-outline',
                  color: colors.accent,
                  shareDetails: {
                    cardType: 'perfect',
                    title: 'ELITE DAY',
                    value: 'Score: 92',
                    subtext: 'Outstanding alignment achieved. Reached the elite 90+ club.'
                  }
                },
                {
                  id: 'milestone-challenge-mock',
                  type: 'streak',
                  time: 'Achievement',
                  title: 'Global Challenge Completed 🌐',
                  subtitle: 'Successfully finished "Hydration Wave" with the community!',
                  icon: 'globe-outline',
                  color: '#00D4FF',
                  shareDetails: {
                    cardType: 'streak',
                    title: 'CHALLENGE COMPLETED',
                    value: 'Hydration Wave',
                    subtext: 'Completed weekly global challenge.'
                  }
                }
              ]
            }
          ];
        } else if (simulatedDay === 'day8_recap') {
          todayScore = 85;
          activeStreak = 7;
          todayDelta = 5;
          mockShouldShowRankCard = true;
          card1LabelVal = '🔥 BIGGEST WIN THIS WEEK';
          biggestWinData = { title: '🏆 Elite Week Completed', sub: 'Weekly recap wrapped card ready!' };
          card2LabelVal = '🏆 HIGHEST RANK REACHED';
          highestRankData = { title: 'Top 10% Global', sub: 'Based on peak weekly score of 92/100' };
          card3LabelVal = '⚡ BIGGEST SCORE JUMP';
          biggestJumpData = { title: '+15 Points', sub: 'Highest upward score movement in a day' };
          feedGroups = [
            {
              dateLabel: 'TODAY',
              items: [
                {
                  id: 'weekly-recap-mock',
                  type: 'weekly_recap',
                  time: 'Weekly Wrapped',
                  title: '📅 Weekly Recap Completed',
                  subtitle: `Your Week in Review is ready! Tap to view your high-fidelity wrapped card.`,
                  icon: 'calendar-outline',
                  color: '#A78BFA',
                  shareDetails: {
                    cardType: 'weekly_recap',
                    name: 'Akshay',
                    highestScore: 92,
                    xpEarned: 380,
                    highestRank: 3,
                    streak: 6,
                    biggestWin: 'Elite Day Completed'
                  }
                }
              ]
            }
          ];
        }

        setScore(todayScore);
        setStreak(activeStreak);
        setScoreDelta(todayDelta);
        
        // Projected age stats
        const computedFutureScore = Math.min(100, Math.round(todayScore * 1.08 + 2));
        const baselineFutureScore = Math.min(100, Math.round(20 * 1.08 + 2));
        setProjectedFutureScore(computedFutureScore);
        setFutureScoreImprovement(computedFutureScore - baselineFutureScore);

        setBiggestWin(biggestWinData);
        setHighestRank(highestRankData);
        setBiggestJump(biggestJumpData);
        setCard1Label(card1LabelVal);
        setCard2Label(card2LabelVal);
        setCard3Label(card3LabelVal);
        setHasLogged(mockHasLogged);
        setShouldShowRankCard(mockShouldShowRankCard);
        setFeed(feedGroups);
        setLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const userId = session.user.id;

      // Fetch currently logged-in user's profile details to find username and name
      const { data: currentProfile } = await supabase
        .from('users')
        .select('username, name, created_at, is_admin, xp')
        .eq('id', userId)
        .single();
      if (currentProfile) {
        setCurrentUsername(currentProfile.username || '');
        setProfileName(currentProfile.name || '');
        setIsAdmin(currentProfile.is_admin || false);
      }

      // 1. Fetch HealthKit and user context
      let todaySteps = 0;
      let lastSleep = 0;
      let activeMins = 0;
      let workoutMins = 0;
      let sleepStartLastNight: Date | null = null;
      let sleepStartNightBefore: Date | null = null;
      let hasHKPermission = false;

      if (isHealthKitAvailable) {
        try {
          const hkSuccess = await initHealthKit();
          if (hkSuccess) {
            hasHKPermission = true;
            const [fetchedSteps, sleepDetails, fetchedActiveMins, todayWorkoutMinutes] = await Promise.all([
              getTodaySteps(),
              getSleepDetails(),
              getTodayActiveMinutes(),
              getTodayWorkoutMinutes()
            ]);
            todaySteps = fetchedSteps;
            lastSleep = sleepDetails.lastNightHours;
            sleepStartLastNight = sleepDetails.lastNightStart;
            sleepStartNightBefore = sleepDetails.nightBeforeStart;
            activeMins = fetchedActiveMins;
            workoutMins = todayWorkoutMinutes;
          }
        } catch (e) {
          console.log('HealthKit error in activity:', e);
        }
      }

      const ctx = await buildUserContext({
        steps: todaySteps,
        sleep: lastSleep,
        activeMinutes: activeMins,
        workouts: workoutMins
      });

      if (!ctx) {
        setLoading(false);
        return;
      }

      // Calculate score today
      const today = getLocalDateString(new Date());
      const cachedWater = await AsyncStorage.getItem(`@user_water_${userId}`);
      const waterMl = cachedWater ? parseInt(cachedWater) : 0;
      const scoreResultObj = calculateHealthScore({
        caloriesToday: ctx.caloriesToday,
        calorieGoal: ctx.calorieGoal,
        proteinToday: ctx.proteinToday,
        proteinGoal: ctx.proteinGoal,
        mealsToday: ctx.mealsToday,
        currentHour: ctx.currentHour,
        stepsToday: ctx.stepsToday,
        stepsTracked: hasHKPermission,
        workoutMinutesToday: ctx.workoutsToday,
        activeMinutesToday: ctx.activeMinutesToday,
        activeMinutesTracked: hasHKPermission,
        sleepHoursLastNight: ctx.sleepLastNight,
        sleepTracked: hasHKPermission,
        sleepStartLastNight,
        sleepStartNightBefore,
        waterToday: waterMl,
        waterGoal: ctx.waterGoal,
        stepsGoal: ctx.stepsGoal || 8000
      });

      const todayScore = scoreResultObj.totalScore;
      setScore(todayScore);
      setStreak(ctx.loggingStreak || 0);

      let baseAge = ctx.age || 20;
      if (ctx.birthday) {
        const birth = new Date(ctx.birthday);
        const now = new Date();
        baseAge = now.getFullYear() - birth.getFullYear();
        const m = now.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) baseAge--;
      }

      const computedFutureScore = Math.min(100, Math.round(todayScore * 1.08 + 2));
      const baselineFutureScore = Math.min(100, Math.round(baseAge * 1.08 + 2));
      setProjectedFutureScore(computedFutureScore);
      setFutureScoreImprovement(computedFutureScore - baselineFutureScore);

      // Fetch yesterday's score for comparisons
      let yesterdayScore = 0;
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = getLocalDateString(yesterday);
        const { data: yScoreObj } = await supabase
          .from('health_scores')
          .select('score')
          .eq('user_id', userId)
          .eq('date', yesterdayStr)
          .single();
        if (yScoreObj) yesterdayScore = yScoreObj.score;
      } catch (err) {
        yesterdayScore = 55; // generic baseline
      }
      const scoreDiff = todayScore - yesterdayScore;
      setScoreDelta(scoreDiff > 0 ? scoreDiff : todayScore);

      // Fetch past 14 days of health scores
      const { data: pastScores } = await supabase
        .from('health_scores')
        .select('*')
        .eq('user_id', userId)
        .neq('date', today)
        .order('date', { ascending: false })
        .limit(14);

      // Fetch all health scores for recap computation
      const { data: allUserScores } = await supabase
        .from('health_scores')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      const earliestLogDate = allUserScores && allUserScores.length > 0 ? allUserScores[0].date : null;

      // Fetch user's global rank
      const { data: allUsersSorted } = await supabase
        .from('users')
        .select('id')
        .order('xp', { ascending: false });
      const myRankIndex = allUsersSorted?.findIndex(u => u.id === userId) ?? -1;
      const myRank = myRankIndex !== -1 ? myRankIndex + 1 : 1;

      // Calculate Highlight Stats
      let highestScore = todayScore;
      let biggestJumpVal = scoreDiff > 0 ? scoreDiff : 0;
      
      if (pastScores && pastScores.length > 0) {
        pastScores.forEach((scoreObj, index) => {
          if (scoreObj.score > highestScore) {
            highestScore = scoreObj.score;
          }
          const nextPastScore = pastScores[index + 1];
          if (nextPastScore) {
            const jump = scoreObj.score - nextPastScore.score;
            if (jump > biggestJumpVal) {
              biggestJumpVal = jump;
            }
          }
        });
      }
      
      const totalTrackedDays = (pastScores?.length || 0) + 1;

      // 1. Check if user has logged anything at all
      const hasLoggedVal = 
        todayScore > 0 || 
        waterMl > 0 || 
        ctx.caloriesToday > 0 || 
        ctx.proteinToday > 0 || 
        (ctx.mealsToday || 0) > 0 || 
        ctx.stepsToday > 0 || 
        ctx.workoutsToday > 0 || 
        ctx.activeMinutesToday > 0 || 
        ctx.loggingStreak > 0 || 
        (pastScores ? pastScores.length > 0 : false);

      setHasLogged(hasLoggedVal);

      // 1.5. Calculate dynamic global standing percentiles
      let highestScorePercentile = 100;
      let todayPercentile = 100;
      let scoresByDate: Record<string, { userId: string, score: number }[]> = {};

      try {
        // Fetch total unique users in the app
        const { count: totalUsers } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true });
        
        // Fetch unique users with score strictly greater than current user's highestScore
        const { data: higherScores } = await supabase
          .from('health_scores')
          .select('user_id')
          .gt('score', highestScore);
        const uniqueUsersWithHigherScore = new Set(higherScores?.map(s => s.user_id) || []).size;
        highestScorePercentile = ((uniqueUsersWithHigherScore + 1) / (totalUsers || 1)) * 100;

        // Fetch unique users with score strictly greater than todayScore today
        const { data: higherScoresToday } = await supabase
          .from('health_scores')
          .select('user_id')
          .eq('date', today)
          .gt('score', todayScore);
        const uniqueUsersWithHigherScoreToday = new Set(higherScoresToday?.map(s => s.user_id) || []).size;

        const { data: loggedUsersToday } = await supabase
          .from('health_scores')
          .select('user_id')
          .eq('date', today);
        const totalLoggedUsersToday = new Set(loggedUsersToday?.map(s => s.user_id) || []).size;
        todayPercentile = ((uniqueUsersWithHigherScoreToday + 1) / (totalLoggedUsersToday || 1)) * 100;

        // Batch fetch other user scores for historic dates to compute past percentiles in memory
        const pastDates = pastScores?.map(s => s.date) || [];
        if (pastDates.length > 0) {
          const { data: allPastScores } = await supabase
            .from('health_scores')
            .select('user_id, date, score')
            .in('date', pastDates);
          if (allPastScores) {
            allPastScores.forEach(row => {
              if (!scoresByDate[row.date]) {
                scoresByDate[row.date] = [];
              }
              scoresByDate[row.date].push({ userId: row.user_id, score: row.score });
            });
          }
        }
      } catch (err) {
        console.log('Error calculating dynamic percentiles:', err);
        // Fallback to static score-based estimates
        highestScorePercentile = highestScore >= 90 ? 10 : (highestScore >= 82 ? 15 : (highestScore >= 75 ? 25 : 100));
        todayPercentile = todayScore >= 90 ? 10 : (todayScore >= 82 ? 15 : (todayScore >= 75 ? 25 : 100));
      }

      // 2. Check if user signed up within the last hour
      const signupTime = session.user.created_at ? new Date(session.user.created_at).getTime() : Date.now();
      const isFirstHour = Date.now() - signupTime < 60 * 60 * 1000;

      let card1LabelVal = '🔥 BIGGEST WIN THIS WEEK';
      let card2LabelVal = '🏆 HIGHEST RANK REACHED';
      let card3LabelVal = '⚡ BIGGEST SCORE JUMP';
      let shouldShowRankCardVal = true;

      // Compute Biggest Win text
      let biggestWinText = '';
      let biggestWinSub = '';

      // Compute Highest Rank text (Only Top 10% / Top 25% and after Day 3)
      let highestRankText = '';
      let highestRankSub = '';

      // Compute Biggest Score Jump text
      let biggestJumpText = '';
      let biggestJumpSub = '';

      if (totalTrackedDays === 1) {
        // Condition Day 1 (Logged)
        card1LabelVal = '🔥 BIGGEST WIN TODAY';
        biggestWinText = 'First Step Taken';
        biggestWinSub = 'Logging journey initiated today!';

        card2LabelVal = '🏆 HIGHEST RANK REACHED';
        if (isFirstHour) {
          highestRankText = 'Analyzing Standing...';
          highestRankSub = 'Standings will reveal 1 hour after signup';
          shouldShowRankCardVal = true;
        } else {
          if (highestScorePercentile <= 10) {
            highestRankText = 'Top 10% Global';
            highestRankSub = `Based on your high score of ${highestScore}/100`;
            shouldShowRankCardVal = true;
          } else if (highestScorePercentile <= 15) {
            highestRankText = 'Top 15% Global';
            highestRankSub = `Based on your high score of ${highestScore}/100`;
            shouldShowRankCardVal = true;
          } else if (highestScorePercentile <= 25) {
            highestRankText = 'Top 25% Global';
            highestRankSub = `Based on your high score of ${highestScore}/100`;
            shouldShowRankCardVal = true;
          } else {
            highestRankText = 'Improve score to rank up';
            highestRankSub = `Based on your high score of ${highestScore}/100`;
            shouldShowRankCardVal = true;
          }
        }

        card3LabelVal = '⚡ TODAY\'S HEALTH SCORE';
        biggestJumpText = `Score: ${todayScore}`;
        biggestJumpSub = 'Keep logging habits to increase your score';
      } else {
        // Condition Day 2+ (Logged)
        card1LabelVal = '🔥 BIGGEST WIN THIS WEEK';
        if (highestScore === 100) {
          biggestWinText = '🎯 Perfect Day Completed';
          biggestWinSub = `Reached the perfect 100/100 score!`;
        } else if (highestScore >= 90) {
          biggestWinText = '⭐ Elite Day Completed';
          biggestWinSub = `Hit an elite score of ${highestScore}/100!`;
        } else if (ctx.loggingStreak >= 2) {
          biggestWinText = `🔥 ${ctx.loggingStreak}-Day Active Streak`;
          biggestWinSub = 'Maintaining solid consistency';
        } else if (highestScore >= 75) {
          biggestWinText = '🏆 Wellness Surge';
          biggestWinSub = `Reached an impressive score of ${highestScore}/100`;
        } else {
          biggestWinText = 'Started Logging Habits';
          biggestWinSub = 'Ready to build major momentum';
        }

        card2LabelVal = '🏆 HIGHEST RANK REACHED';
        if (highestScorePercentile <= 10) {
          highestRankText = 'Top 10% Global';
          highestRankSub = `Based on your high score of ${highestScore}/100`;
          shouldShowRankCardVal = true;
        } else if (highestScorePercentile <= 15) {
          highestRankText = 'Top 15% Global';
          highestRankSub = `Based on your high score of ${highestScore}/100`;
          shouldShowRankCardVal = true;
        } else if (highestScorePercentile <= 25) {
          highestRankText = 'Top 25% Global';
          highestRankSub = `Based on your high score of ${highestScore}/100`;
          shouldShowRankCardVal = true;
        } else {
          highestRankText = 'Improve score to rank up';
          highestRankSub = `Based on your high score of ${highestScore}/100`;
          shouldShowRankCardVal = true;
        }

        card3LabelVal = '⚡ BIGGEST SCORE JUMP';
        biggestJumpText = '—';
        biggestJumpSub = 'Unlocks on your second day';

        const finalJump = biggestJumpVal > 0 ? biggestJumpVal : (scoreDiff > 0 ? scoreDiff : 0);
        if (finalJump > 0) {
          biggestJumpText = `+${finalJump} Points`;
          biggestJumpSub = 'Highest upward score movement in a day';
        } else {
          biggestJumpText = '0 Points';
          biggestJumpSub = 'Keep improving daily to see gains';
        }
      }

      setBiggestWin({ title: biggestWinText, sub: biggestWinSub });
      setHighestRank({ title: highestRankText, sub: highestRankSub });
      setBiggestJump({ title: biggestJumpText, sub: biggestJumpSub });
      setCard1Label(card1LabelVal);
      setCard2Label(card2LabelVal);
      setCard3Label(card3LabelVal);
      setShouldShowRankCard(shouldShowRankCardVal);

      // 1. Fetch user's own completed challenges from the database
      let completedChallengesList: any[] = [];
      try {
        const { data: dbCompleted } = await supabase
          .from('challenge_participations_v2')
          .select('challenge_id, challenge:challenges_v2(id, title, type, xp_reward), completed_at')
          .eq('user_id', userId)
          .eq('status', 'COMPLETED');
        
        if (dbCompleted) {
          completedChallengesList = dbCompleted.map(p => ({
            id: (p.challenge as any)?.id,
            title: (p.challenge as any)?.title || 'Challenge',
            type: (p.challenge as any)?.type || 'weekly',
            xpReward: (p.challenge as any)?.xp_reward || 100,
            completedAt: p.completed_at || new Date().toISOString()
          }));
        }
      } catch (err) {
        console.log('Error reading completed challenges from DB in loadFeedData:', err);
      }

      // Group completed challenges by date string (YYYY-MM-DD)
      const challengeFeedItemsByDate: Record<string, FeedItem[]> = {};
      const getChallengeDateString = (c: any): string => {
        if (c.completedAt) {
          return getLocalDateString(new Date(c.completedAt));
        }
        // Fallback for mock/older history challenges to yesterday's date
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return getLocalDateString(yesterday);
      };

      completedChallengesList.forEach(challenge => {
        const dateStr = getChallengeDateString(challenge);
        if (!challengeFeedItemsByDate[dateStr]) {
          challengeFeedItemsByDate[dateStr] = [];
        }

        let iconName: any = 'trophy-outline';
        let colorTheme = colors.accent;
        let titleText = '';
        let subtitleText = '';
        let cardTypeVal: 'perfect' | 'streak' | 'surge' | 'age' = 'perfect';

        if (challenge.type === 'friend') {
          iconName = 'medal-outline';
          colorTheme = '#FFD700'; // Gold theme for victory
          cardTypeVal = 'perfect';
          
          const opponentMatch = challenge.title.match(/\(vs\s+(@\w+)\)/);
          const opponentName = opponentMatch ? opponentMatch[1] : 'friend';
          titleText = `Won Duel Against ${opponentName} 🏆`;
          subtitleText = `Claimed victory in "${challenge.title.split(' (vs')[0]}" and earned +${challenge.xpReward} XP!`;
        } else if (challenge.type === 'global') {
          iconName = 'globe-outline';
          colorTheme = '#00D4FF'; // Cyan
          cardTypeVal = 'streak';
          titleText = `Global Challenge Completed 🌐`;
          subtitleText = `Successfully finished "${challenge.title}" with the community!`;
        } else { // monthly / seasonal
          iconName = 'ribbon-outline';
          colorTheme = '#F87171'; // Coral/Red
          cardTypeVal = 'age';
          titleText = `Seasonal Event Completed 🎖️`;
          subtitleText = `Finished the "${challenge.title}" monthly event!`;
        }

        challengeFeedItemsByDate[dateStr].push({
          id: `challenge-${challenge.id}`,
          type: challenge.type === 'friend' ? 'perfect' : 'streak',
          time: 'Achievement',
          title: titleText,
          subtitle: subtitleText,
          icon: iconName,
          color: colorTheme,
          shareDetails: {
            cardType: cardTypeVal,
            title: challenge.type === 'friend' ? 'DUEL VICTORY' : 'CHALLENGE COMPLETED',
            value: challenge.title,
            subtext: `You completed this achievement on ${dateStr}.`
          }
        });
      });

      let feedGroups: FeedGroup[] = [];

      // 2. Loop through the user's past scores to generate timeline milestones
      if (pastScores && pastScores.length > 0) {
        pastScores.forEach((scoreObj, index) => {
          const dateStr = scoreObj.date; // YYYY-MM-DD
          const dateObj = new Date(dateStr);
          let dateLabel = '';
          if (dateStr === today) {
            dateLabel = 'TODAY';
          } else {
            dateLabel = dateObj.toLocaleDateString('en-US', {
              weekday: 'long', month: 'short', day: 'numeric'
            }).toUpperCase();
          }

          const dayItems: FeedItem[] = [];

          // Perfect / Elite Day Milestone
          if (scoreObj.score === 100) {
            dayItems.push({
              id: `perfect-${scoreObj.id}`,
              type: 'perfect',
              time: 'Completed',
              title: '🎯 Perfect Day',
              subtitle: `Maximum alignment achieved. Reached a perfect health score of 100/100 today!`,
              icon: 'checkmark-circle-outline',
              color: colors.accent,
              shareDetails: {
                cardType: 'perfect',
                title: 'PERFECT DAY',
                value: `Score: 100`,
                subtext: 'Maximum alignment achieved. A perfect 100 score.'
              }
            });
          } else if (scoreObj.score >= 90) {
            dayItems.push({
              id: `elite-${scoreObj.id}`,
              type: 'perfect',
              time: 'Completed',
              title: '⭐ Elite Day',
              subtitle: `Outstanding alignment achieved. Reached an elite health score of ${scoreObj.score}/100 today!`,
              icon: 'checkmark-circle-outline',
              color: colors.accent,
              shareDetails: {
                cardType: 'perfect',
                title: 'ELITE DAY',
                value: `Score: ${scoreObj.score}`,
                subtext: 'Outstanding alignment achieved. Reached the elite 90+ club.'
              }
            });
          }

          // Global Standing bracket Milestone (Top 10%, 15%, 25%)
          const standingPct = scoreObj.score >= 90 ? 10 : (scoreObj.score >= 82 ? 15 : (scoreObj.score >= 75 ? 25 : 100));
          if (standingPct <= 25) {
            let standingVal = `Top ${standingPct}%`;
            let betterThanPct = `${100 - standingPct}%`;
            dayItems.push({
              id: `milestone-bracket-${scoreObj.id}`,
              type: 'streak',
              time: 'Standings',
              title: `Entered Top ${standingPct}% 🏆`,
              subtitle: `Your wellness profile was better than ${betterThanPct} of users today!`,
              icon: 'trophy-outline',
              color: colors.accent,
              shareDetails: {
                cardType: 'streak',
                title: 'GLOBAL BRACKET',
                value: standingVal,
                subtext: `Better than ${betterThanPct} of wellness trackers globally today.`
              }
            });
          }

          // Health Score Surge Milestone (relative to previous day's score)
          const nextPastScore = pastScores[index + 1];
          if (nextPastScore) {
            const jump = scoreObj.score - nextPastScore.score;
            if (jump >= 10) {
              dayItems.push({
                id: `improve-${scoreObj.id}`,
                type: 'score',
                time: 'Surge',
                title: '⚡ Health Score Surge',
                subtitle: `+${jump} points today! Upward score movement.`,
                icon: 'trending-up-outline',
                color: colors.accent,
                shareDetails: {
                  cardType: 'surge',
                  title: 'HEALTH SCORE SURGE',
                  value: `+${jump} Points`,
                  subtext: 'You built upward wellness momentum.'
                }
              });
            }
          }

          const dateChallenges = challengeFeedItemsByDate[dateStr] || [];
          const finalDayItems = [...dayItems, ...dateChallenges];

          if (finalDayItems.length > 0) {
            feedGroups.push({
              dateLabel,
              items: finalDayItems
            });
          }
        });
      }

      // Add any challenges that didn't align with a health score log day
      Object.entries(challengeFeedItemsByDate).forEach(([dateStr, challenges]) => {
        if (dateStr === today) return; // Already handled
        
        const dateObj = new Date(dateStr);
        const dateLabel = dateObj.toLocaleDateString('en-US', {
          weekday: 'long', month: 'short', day: 'numeric'
        }).toUpperCase();

        const exists = feedGroups.some(g => g.dateLabel === dateLabel);
        if (!exists && challenges.length > 0) {
          // Insert in reverse chronological order
          const insertIndex = feedGroups.findIndex(g => {
            if (g.dateLabel === 'TODAY') return false;
            const groupDate = new Date(g.dateLabel);
            return dateObj > groupDate;
          });

          const newGroup = {
            dateLabel,
            items: challenges
          };

          if (insertIndex === -1) {
            feedGroups.push(newGroup);
          } else {
            feedGroups.splice(insertIndex, 0, newGroup);
          }
        }
      });

      // chronological weekly recap compilation
      const userSignupDate = currentProfile?.created_at ? new Date(currentProfile.created_at) : (earliestLogDate ? new Date(earliestLogDate) : null);
      if (userSignupDate) {
        const startDay = new Date(userSignupDate);
        startDay.setHours(0,0,0,0);
        
        const todayVal = new Date();
        todayVal.setHours(0,0,0,0);
        const totalElapsedDays = Math.round((todayVal.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24));
        
        // Calculate completed weeks
        const completedWeeksCount = Math.floor(totalElapsedDays / 7);
        
        for (let w = 1; w <= completedWeeksCount; w++) {
          const recapDayIndex = w * 7;
          const recapDate = new Date(startDay);
          recapDate.setDate(recapDate.getDate() + recapDayIndex);
          const recapDateStr = getLocalDateString(recapDate);
          
          let dateLabel = '';
          if (recapDateStr === today) {
            dateLabel = 'TODAY';
          } else {
            dateLabel = recapDate.toLocaleDateString('en-US', {
              weekday: 'long', month: 'short', day: 'numeric'
            }).toUpperCase();
          }
          
          // Calculate week bounds
          const weekStart = new Date(startDay);
          weekStart.setDate(weekStart.getDate() + recapDayIndex - 7);
          const weekEnd = new Date(startDay);
          weekEnd.setDate(weekEnd.getDate() + recapDayIndex - 1);
          
          const weekStartStr = getLocalDateString(weekStart);
          const weekEndStr = getLocalDateString(weekEnd);
          
          const weekScores = (allUserScores || []).filter(s => s.date >= weekStartStr && s.date <= weekEndStr);
          
          const highestScoreVal = weekScores.length > 0 ? Math.max(...weekScores.map(s => s.score || 0)) : 0;
          const streakVal = weekScores.filter(s => s.score > 0).length;
          // XP Earned: Show their actual profile XP
          const totalXpEarnedInWeek = currentProfile?.xp || 0;
          
          // Peak rank
          const peakRank = myRank !== -1 ? Math.max(1, myRank - Math.round(Math.random() * 2)) : 1;
          
          const recapItem: FeedItem = {
            id: `weekly-recap-week-${w}`,
            type: 'weekly_recap',
            time: 'Weekly Wrapped',
            title: '📅 Weekly Recap Completed',
            subtitle: `Your Week in Review is ready! Tap to view your high-fidelity wrapped card.`,
            icon: 'calendar-outline',
            color: '#A78BFA',
            shareDetails: {
              cardType: 'weekly_recap',
              name: profileName || 'Athlete',
              highestScore: highestScoreVal,
              xpEarned: totalXpEarnedInWeek,
              highestRank: peakRank,
              streak: streakVal || 1,
              biggestWin: highestScoreVal >= 100 ? 'Perfect Day Completed' :
                          highestScoreVal >= 90 ? 'Elite Day Completed' :
                          highestScoreVal >= 85 ? 'Top 10% Bracket' :
                          highestScoreVal >= 75 ? 'Top 25% Bracket' : 'Active Week Completed'
            }
          };
          
          const existingGroup = feedGroups.find(g => g.dateLabel === dateLabel);
          if (existingGroup) {
            existingGroup.items.unshift(recapItem);
          } else {
            const newGroup = {
              dateLabel,
              items: [recapItem]
            };
            
            const insertIndex = feedGroups.findIndex(g => {
              if (g.dateLabel === 'TODAY') return false;
              const groupDate = new Date(g.dateLabel);
              return recapDate > groupDate;
            });
            
            if (insertIndex === -1) {
              feedGroups.push(newGroup);
            } else {
              feedGroups.splice(insertIndex, 0, newGroup);
            }
          }
        }
      }

      // 3. For TODAY, make sure we show today's standing/perfect day if it's there
      const todayGroupIdx = feedGroups.findIndex(g => g.dateLabel === 'TODAY');
      const todayItems: FeedItem[] = [];

      if (todayScore === 100) {
        todayItems.push({
          id: 'milestone-perfect',
          type: 'perfect',
          time: 'Completed',
          title: '🎯 Perfect Day',
          subtitle: `Maximum alignment achieved. Reached a perfect health score of 100/100 today!`,
          icon: 'checkmark-circle-outline',
          color: colors.accent,
          shareDetails: {
            cardType: 'perfect',
            title: 'PERFECT DAY',
            value: `Score: 100`,
            subtext: 'Maximum alignment achieved. A perfect 100 score.'
          }
        });
      } else if (todayScore >= 90) {
        todayItems.push({
          id: 'milestone-elite',
          type: 'perfect',
          time: 'Completed',
          title: '⭐ Elite Day',
          subtitle: `Outstanding alignment achieved. Reached an elite health score of ${todayScore}/100 today!`,
          icon: 'checkmark-circle-outline',
          color: colors.accent,
          shareDetails: {
            cardType: 'perfect',
            title: 'ELITE DAY',
            value: `Score: ${todayScore}`,
            subtext: 'Outstanding alignment achieved. Reached the elite 90+ club.'
          }
        });
      }

      if (totalTrackedDays >= 3) {
        let standingTitle = '';
        let standingSub = '';
        let standingVal = '';
        let betterThanPct = '';
        
        if (todayPercentile <= 10) {
          standingTitle = 'Entered Top 10% 🏆';
          standingSub = 'Your wellness profile is better than 90% of users today!';
          standingVal = 'Top 10%';
          betterThanPct = '90%';
        } else if (todayPercentile <= 15) {
          standingTitle = 'Entered Top 15% 🏆';
          standingSub = 'Your wellness profile is better than 85% of users today!';
          standingVal = 'Top 15%';
          betterThanPct = '85%';
        } else if (todayPercentile <= 25) {
          standingTitle = 'Entered Top 25% 🏆';
          standingSub = 'Your wellness profile is better than 75% of users today!';
          standingVal = 'Top 25%';
          betterThanPct = '75%';
        }

        if (standingTitle) {
          todayItems.push({
            id: 'milestone-bracket',
            type: 'streak',
            time: 'Standings',
            title: standingTitle,
            subtitle: standingSub,
            icon: 'trophy-outline',
            color: colors.accent,
            shareDetails: {
              cardType: 'streak',
              title: 'GLOBAL BRACKET',
              value: standingVal,
              subtext: `Better than ${betterThanPct} of wellness trackers globally today.`
            }
          });
        }
      }

      if (todayItems.length > 0) {
        if (todayGroupIdx > -1) {
          feedGroups[todayGroupIdx].items = [...todayItems, ...feedGroups[todayGroupIdx].items];
        } else {
          feedGroups.unshift({
            dateLabel: 'TODAY',
            items: todayItems
          });
        }
      }

      setFeed(feedGroups);
    } catch (e) {
      console.log('Error compiling feed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedData();
  }, [sandboxActive, simulatedDay]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadFeedData();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const handleProfileUpdated = () => {
      loadFeedData();
    };

    appEvents.on(PROFILE_UPDATED_EVENT, handleProfileUpdated);

    return () => {
      appEvents.off(PROFILE_UPDATED_EVENT, handleProfileUpdated);
    };
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadFeedData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Your Story</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Beautiful Stacked Header Cards */}
        {hasLogged && (
          <View style={styles.headerStatsStack}>
            <View style={styles.headerStatCard}>
              <View style={styles.statHeader}>
                <Text style={styles.statLabel}>{card1Label}</Text>
                <Ionicons name="flame-outline" size={15} color={colors.accent} />
              </View>
              <Text style={styles.statValue}>{biggestWin.title}</Text>
              <Text style={styles.statSubtext}>{biggestWin.sub}</Text>
            </View>

            {shouldShowRankCard && (
              <View style={styles.headerStatCard}>
                <View style={styles.statHeader}>
                  <Text style={styles.statLabel}>{card2Label}</Text>
                  <Ionicons name="trophy-outline" size={15} color={colors.accent} />
                </View>
                <Text style={styles.statValue}>{highestRank.title}</Text>
                <Text style={styles.statSubtext}>{highestRank.sub}</Text>
              </View>
            )}

            <View style={styles.headerStatCard}>
              <View style={styles.statHeader}>
                <Text style={styles.statLabel}>{card3Label}</Text>
                <Ionicons name="trending-up-outline" size={15} color={colors.accent} />
              </View>
              <Text style={styles.statValue}>{biggestJump.title}</Text>
              <Text style={styles.statSubtext}>{biggestJump.sub}</Text>
            </View>
          </View>
        )}

        {/* Dev Sandbox & Toggle Deck */}
        {isAdmin && (
        <View style={[styles.sandboxCard, { marginHorizontal: 20, marginBottom: 16 }]}>
          <TouchableOpacity
            style={styles.sandboxHeader}
            onPress={() => setSandboxExpanded(!sandboxExpanded)}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="build" size={16} color="#A78BFA" style={{ marginRight: 6 }} />
              <Text style={styles.sandboxTitle}>Dev Sandbox & Toggle Deck</Text>
            </View>
            <Ionicons name={sandboxExpanded ? "chevron-up" : "chevron-down"} size={16} color="#A78BFA" />
          </TouchableOpacity>

          {sandboxExpanded && (
            <View style={styles.sandboxContent}>
              <View style={styles.sandboxRow}>
                <Text style={styles.sandboxLabel}>Your Story Demo Mode</Text>
                <TouchableOpacity
                  style={[styles.toggleBtn, sandboxActive ? styles.toggleBtnActive : {}]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSandboxActive(!sandboxActive);
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.toggleBtnText}>{sandboxActive ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>

              {sandboxActive && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.sandboxSubLabel}>Select Simulated Timeline Stage:</Text>
                  <View style={styles.demoButtonsGrid}>
                    {(['day1_unlogged', 'day1_logged_hour1', 'day1_logged_after1', 'day2', 'day3', 'day4', 'day8_recap'] as const).map((d) => (
                      <TouchableOpacity
                        key={d}
                        style={[styles.demoSelectBtn, simulatedDay === d ? styles.demoSelectBtnActive : {}]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSimulatedDay(d);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.demoSelectBtnText, simulatedDay === d ? { color: '#000000' } : {}]}>
                          {d === 'day1_unlogged' ? 'DAY 1 (UNLOGGED)' : 
                           d === 'day1_logged_hour1' ? 'DAY 1 (HOUR 1)' : 
                           d === 'day1_logged_after1' ? 'DAY 1 (AFTER 1H)' : 
                           d === 'day2' ? 'DAY 2' : 
                           d === 'day3' ? 'DAY 3' : 
                           d === 'day4' ? 'DAY 4' : 'DAY 8 RECAP'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
        )}

        <Text style={styles.sectionTitle}>Timeline Highlights</Text>

        {feed.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="journal-outline" size={48} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyText}>No highlights logged yet.</Text>
            <Text style={styles.emptySubtext}>Perform actions on the Home tab to unlock milestones in your story.</Text>
          </View>
        ) : (
          feed.map((group) => (
            <View key={group.dateLabel} style={styles.feedGroup}>
              <Text style={styles.groupDateLabel}>{group.dateLabel}</Text>
              <View style={styles.groupItemsContainer}>
                {group.items.map((item, itemIdx) => {
                  const isLast = itemIdx === group.items.length - 1;
                  return (
                    <View 
                      key={item.id} 
                      style={styles.timelineItemRow} 
                    >
                      <View style={styles.timelineLeftCol}>
                        <View style={[
                          styles.timelineLine,
                          itemIdx === 0 && { top: '50%' },
                          isLast && { bottom: '50%' }
                        ]} />
                        <View style={[styles.iconCircle, { borderColor: item.color }]}>
                          <Ionicons name={item.icon} size={15} color={item.color} />
                        </View>
                      </View>
                      <View style={styles.timelineRightCol}>
                        {item.type === 'weekly_recap' && item.shareDetails ? (
                          <LinearGradient
                            colors={['#160e30', '#0a0618', '#030209']}
                            style={styles.recapFeedCard}
                          >
                            {/* Decorative glowing blobs */}
                            <View style={[styles.spotlightBlob, { top: -40, left: -45, backgroundColor: 'rgba(167, 139, 250, 0.16)', width: 220, height: 220, borderRadius: 110 }]} />
                            <View style={[styles.spotlightBlob, { bottom: -30, right: -30, backgroundColor: 'rgba(236, 72, 153, 0.1)', width: 200, height: 200, borderRadius: 100 }]} />
                            
                            <View style={StyleSheet.absoluteFill}>
                              <Svg height="100%" width="100%">
                                <Path d="M-20,60 C50,20 150,120 360,40" fill="none" stroke="rgba(167, 139, 250, 0.08)" strokeWidth={1.5} />
                                <Path d="M-20,140 C70,100 180,210 360,120" fill="none" stroke="rgba(244, 114, 182, 0.05)" strokeWidth={1.2} />
                                <Path d="M-20,220 C60,180 150,290 360,200" fill="none" stroke="rgba(167, 139, 250, 0.04)" strokeWidth={1} />
                                <Path d="M-20,300 C80,250 190,360 360,270" fill="none" stroke="rgba(255, 255, 255, 0.02)" strokeWidth={1} />
                              </Svg>
                            </View>

                            <View style={styles.recapBrandingRowInline}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                <Image 
                                  source={require('../../assets/images/logo-egg.png')} 
                                  style={{ width: 12, height: 12, borderRadius: 3 }} 
                                />
                                <Text style={styles.recapBrandingInline}>FITAPP PULSE</Text>
                              </View>
                              <Text style={styles.recapDateInline}>WEEKLY RECAP</Text>
                            </View>
                            
                            <Text style={styles.recapTitleInline}>{item.shareDetails.name}'s Week in Review</Text>
                            
                            <View style={styles.recapGridInline}>
                              <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItemInline}>
                                <View style={styles.cardIconHeader}>
                                  <Text style={styles.recapLabelInline}>HEALTH SCORE</Text>
                                  <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                                    <Ionicons name="pulse" size={12} color="#10B981" />
                                  </View>
                                </View>
                                <Text style={styles.recapValInline}>{item.shareDetails.highestScore} pts</Text>
                                <Text style={styles.recapSubValInline}>⚡ Peak score</Text>
                              </LinearGradient>
                              
                              <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItemInline}>
                                <View style={styles.cardIconHeader}>
                                  <Text style={styles.recapLabelInline}>XP EARNED</Text>
                                  <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                                    <Ionicons name="flash" size={12} color="#F59E0B" />
                                  </View>
                                </View>
                                <Text style={styles.recapValInline}>+{item.shareDetails.xpEarned} XP</Text>
                                <Text style={styles.recapSubValInline}>⭐ Week total</Text>
                              </LinearGradient>
                              
                              <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItemInline}>
                                <View style={styles.cardIconHeader}>
                                  <Text style={styles.recapLabelInline}>LEADERBOARD</Text>
                                  <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                                    <Ionicons name="podium" size={12} color="#3B82F6" />
                                  </View>
                                </View>
                                <Text style={styles.recapValInline}>{!item.shareDetails.highestRank ? '—' : `#${item.shareDetails.highestRank}`}</Text>
                                <Text style={styles.recapSubValInline}>↑ Peak standing</Text>
                              </LinearGradient>

                              <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItemInline}>
                                <View style={styles.cardIconHeader}>
                                  <Text style={styles.recapLabelInline}>STREAK</Text>
                                  <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                                    <Ionicons name="flame" size={12} color="#EF4444" />
                                  </View>
                                </View>
                                <Text style={styles.recapValInline}>{item.shareDetails.streak} Days</Text>
                                <Text style={styles.recapSubValInline}>🔥 Active streak</Text>
                              </LinearGradient>
                            </View>

                            <View style={{ width: '100%', alignItems: 'center', marginVertical: 12 }}>
                              <LinearGradient
                                colors={['rgba(212, 175, 55, 0.16)', 'rgba(120, 90, 0, 0.03)']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={styles.achievementBadgeInline}
                              >
                                <Text 
                                  style={styles.achievementBadgeTextInline}
                                  numberOfLines={1}
                                  adjustsFontSizeToFit
                                >
                                  🏆 BIGGEST WIN: {item.shareDetails.biggestWin?.toUpperCase()}
                                </Text>
                              </LinearGradient>
                            </View>

                            <TouchableOpacity 
                              style={styles.recapShareBtnInline}
                              onPress={() => handleNativeShare(item)}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="logo-instagram" size={14} color="#000000" style={{ marginRight: 6 }} />
                              <Text style={styles.recapShareBtnTextInline}>Share to Instagram Story</Text>
                            </TouchableOpacity>
                          </LinearGradient>
                        ) : (
                          <View style={styles.feedCard}>
                            <View style={styles.cardHeaderRow}>
                              <Text style={styles.cardTitle}>{item.title}</Text>
                              <Text style={styles.cardTime}>{item.time}</Text>
                            </View>
                            <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                            
                            {item.shareDetails && (
                              <TouchableOpacity 
                                style={styles.tapToShareContainer}
                                onPress={() => handleNativeShare(item)}
                                activeOpacity={0.7}
                              >
                                <Ionicons name="share-social-outline" size={12} color={colors.accent} />
                                <Text style={styles.tapToShareText}>Tap to share achievement card</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Modal overlay removed. Native share sheet is opened directly. */}

      {/* Share Card Preview Modal Overlay */}
      <Modal
        visible={shareModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackgroundDismiss} 
            activeOpacity={1} 
            onPress={() => setShareModalVisible(false)}
          />
          
          <View style={styles.shareCardContainer}>
            {shareCardData && (
              <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 0.95 }} style={{ width: 340, height: 605 }}>
                <LinearGradient
                  colors={shareCardData.cardType === 'weekly_recap' ? ['#160e30', '#0a0618', '#030209'] : ['#161326', '#09080E']}
                  style={[styles.shareCard, { width: 340, height: 605, borderWidth: 0, margin: 0 }]}
                >
                  {/* Decorative glowing blobs */}
                  {shareCardData.cardType === 'weekly_recap' ? (
                    <>
                      <View style={[styles.spotlightBlob, { top: -60, left: -60, backgroundColor: 'rgba(167, 139, 250, 0.18)', width: 280, height: 280, borderRadius: 140 }]} />
                      <View style={[styles.spotlightBlob, { bottom: -60, right: -60, backgroundColor: 'rgba(236, 72, 153, 0.12)', width: 260, height: 260, borderRadius: 130 }]} />
                    </>
                  ) : (
                    <View style={styles.shareCardGlowBlob} />
                  )}
                  
                  {/* Technical/Topographic Lines Svg */}
                  <View style={StyleSheet.absoluteFill}>
                    {shareCardData.cardType === 'weekly_recap' ? (
                      <Svg height="100%" width="100%">
                        <Path d="M-50,80 C50,30 150,170 390,50" fill="none" stroke="rgba(167, 139, 250, 0.08)" strokeWidth={1.5} />
                        <Path d="M-50,200 C70,150 180,310 390,170" fill="none" stroke="rgba(244, 114, 182, 0.05)" strokeWidth={1.2} />
                        <Path d="M-50,320 C60,260 150,430 390,300" fill="none" stroke="rgba(167, 139, 250, 0.04)" strokeWidth={1} />
                        <Path d="M-50,440 C80,370 190,550 390,420" fill="none" stroke="rgba(255, 255, 255, 0.02)" strokeWidth={1} />
                      </Svg>
                    ) : (
                      <Svg height="100%" width="100%">
                        <Path d="M-50,220 C80,160 180,290 390,210" fill="none" stroke="rgba(167, 139, 250, 0.03)" strokeWidth={2} />
                        <Path d="M-50,250 C80,190 180,320 390,240" fill="none" stroke="rgba(167, 139, 250, 0.015)" strokeWidth={1.5} />
                        <Path d="M-50,280 C80,220 180,350 390,270" fill="none" stroke="rgba(255, 255, 255, 0.01)" strokeWidth={1} />
                        <Path d="M-50,310 C80,250 180,380 390,300" fill="none" stroke="rgba(255, 255, 255, 0.008)" strokeWidth={1} />
                        <Path d="M-50,340 C80,280 180,410 390,330" fill="none" stroke="rgba(167, 139, 250, 0.02)" strokeWidth={1.5} />
                      </Svg>
                    )}
                  </View>

                  <View style={{ alignItems: 'center', marginTop: 8 }}>
                    <Image 
                      source={require('../../assets/images/logo-egg.png')} 
                      style={styles.shareCardLogo} 
                    />
                    <Text style={styles.shareCardBranding}>FITAPP</Text>
                  </View>
                  
                  <View style={styles.shareCardContent}>
                    {shareCardData.cardType === 'weekly_recap' && (
                      <View style={styles.recapShareContent}>
                        <View style={styles.recapBrandingRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Image 
                              source={require('../../assets/images/logo-egg.png')} 
                              style={{ width: 14, height: 14, borderRadius: 3 }} 
                            />
                            <Text style={styles.recapBranding}>FITAPP PULSE</Text>
                          </View>
                          <Text style={styles.recapDate}>WEEKLY RECAP</Text>
                        </View>
                        
                        <Text style={styles.recapTitle}>{shareCardData.name}'s Week in Review</Text>
                        
                        <View style={styles.recapGrid}>
                          <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItem}>
                            <View style={styles.cardIconHeader}>
                              <Text style={styles.recapLabel}>HEALTH SCORE</Text>
                              <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                                <Ionicons name="pulse" size={12} color="#10B981" />
                              </View>
                            </View>
                            <Text style={styles.recapVal}>{shareCardData.highestScore} pts</Text>
                            <Text style={styles.recapSubVal}>⚡ Peak score</Text>
                          </LinearGradient>
                          
                          <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItem}>
                            <View style={styles.cardIconHeader}>
                              <Text style={styles.recapLabel}>XP EARNED</Text>
                              <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                                <Ionicons name="flash" size={12} color="#F59E0B" />
                              </View>
                            </View>
                            <Text style={styles.recapVal}>+{shareCardData.xpEarned} XP</Text>
                            <Text style={styles.recapSubVal}>⭐ Week total</Text>
                          </LinearGradient>
                          
                          <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItem}>
                            <View style={styles.cardIconHeader}>
                              <Text style={styles.recapLabel}>LEADERBOARD</Text>
                              <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                                <Ionicons name="podium" size={12} color="#3B82F6" />
                              </View>
                            </View>
                            <Text style={styles.recapVal}>{shareCardData.highestRank === '—' || !shareCardData.highestRank ? '—' : `#${shareCardData.highestRank}`}</Text>
                            <Text style={styles.recapSubVal}>↑ Peak standing</Text>
                          </LinearGradient>

                          <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItem}>
                            <View style={styles.cardIconHeader}>
                              <Text style={styles.recapLabel}>STREAK</Text>
                              <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                                <Ionicons name="flame" size={12} color="#EF4444" />
                              </View>
                            </View>
                            <Text style={styles.recapVal}>{shareCardData.streak} Days</Text>
                            <Text style={styles.recapSubVal}>🔥 Active streak</Text>
                          </LinearGradient>
                        </View>

                        <View style={{ width: '100%', alignItems: 'center', marginVertical: 16 }}>
                          <LinearGradient
                            colors={['rgba(212, 175, 55, 0.16)', 'rgba(120, 90, 0, 0.03)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.achievementBadge}
                          >
                            <Text 
                              style={styles.achievementBadgeText}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                            >
                              🏆 BIGGEST WIN: {shareCardData.biggestWin?.toUpperCase()}
                            </Text>
                          </LinearGradient>
                        </View>
                      </View>
                    )}

                    {shareCardData.cardType === 'perfect' && (
                      <View style={styles.centerAlign}>
                        <View style={styles.iconGlowFrame}>
                          <Ionicons name="checkmark-circle" size={56} color={colors.accent} />
                        </View>
                        <Text style={styles.shareCardTitle}>{shareCardData.title}</Text>
                        <Text style={styles.shareCardValue}>{shareCardData.value}</Text>
                        <Text style={styles.shareCardSubtext}>{shareCardData.subtext.replace(/\s(\S+)$/, '\u00A0$1')}</Text>
                      </View>
                    )}

                    {shareCardData.cardType === 'streak' && (
                      <View style={styles.centerAlign}>
                        <View style={styles.iconGlowFrame}>
                          <Ionicons name="flame" size={56} color={colors.accent} />
                        </View>
                        <Text style={styles.shareCardTitle}>{shareCardData.title}</Text>
                        <Text style={styles.shareCardValue}>{shareCardData.value}</Text>
                        <Text style={styles.shareCardSubtext}>{shareCardData.subtext.replace(/\s(\S+)$/, '\u00A0$1')}</Text>
                      </View>
                    )}

                    {shareCardData.cardType === 'surge' && (
                      <View style={styles.centerAlign}>
                        <View style={styles.iconGlowFrame}>
                          <Ionicons name="trending-up" size={56} color={colors.accent} />
                        </View>
                        <Text style={styles.shareCardTitle}>{shareCardData.title}</Text>
                        <Text style={styles.shareCardValue}>{shareCardData.value}</Text>
                        <Text style={styles.shareCardSubtext}>{shareCardData.subtext.replace(/\s(\S+)$/, '\u00A0$1')}</Text>
                      </View>
                    )}

                    {shareCardData.cardType === 'age' && (
                      <View style={styles.centerAlign}>
                        <View style={styles.iconGlowFrame}>
                          <Ionicons name="pulse" size={56} color={colors.accent} />
                        </View>
                        <Text style={styles.shareCardTitle}>{shareCardData.title}</Text>
                        <Text style={styles.shareCardValue}>{shareCardData.value}</Text>
                        <Text style={styles.shareCardSubtext}>{shareCardData.subtext.replace(/\s(\S+)$/, '\u00A0$1')}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.shareCardFooter}>
                    {shareCardData.cardType === 'weekly_recap' ? 'COMPETE WITH FRIENDS. SURPASS YOURSELF.' : 'BUILD MOMENTUM. LIVE HEALTHIER.'}
                  </Text>
                </LinearGradient>
              </ViewShot>
            )}

            <View style={styles.shareActionsRow}>
              <TouchableOpacity 
                style={styles.shareConfirmBtn} 
                onPress={handleSharePress}
              >
                <Ionicons name="sparkles" size={16} color="#000000" style={{ marginRight: 6 }} />
                <Text style={styles.shareConfirmBtnText}>Create Share Card</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareCloseBtn} onPress={() => setShareModalVisible(false)}>
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
  safeArea: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#000000',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'System',
  },
  headerStatsStack: {
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  headerStatCard: {
    backgroundColor: '#111117',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statSubtext: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontSize: 13,
  },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 16,
    marginTop: 16,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  feedGroup: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  groupDateLabel: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  groupItemsContainer: {
    paddingLeft: 4,
  },
  timelineItemRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  timelineLeftCol: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    marginRight: 16,
    alignSelf: 'stretch',
    paddingBottom: 16,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#111117',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  timelineLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    zIndex: 1,
  },
  timelineRightCol: {
    flex: 1,
    paddingBottom: 16,
  },
  feedCard: {
    backgroundColor: '#111117',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
    marginRight: 8,
  },
  cardTime: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
    fontWeight: '500',
  },
  cardSubtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    lineHeight: 18,
  },
  tapToShareContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.04)',
    paddingTop: 8,
  },
  tapToShareText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 32,
  },

  // Modal Share System
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
    width: 340,
    alignItems: 'center',
    zIndex: 10,
  },
  shareCard: {
    width: '100%',
    height: 605,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    padding: 30,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10,
    overflow: 'hidden',
  },
  shareCardLogo: {
    width: 32,
    height: 32,
    alignSelf: 'center',
    marginBottom: 8,
  },
  shareCardBranding: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 4,
    textAlign: 'center',
  },
  shareCardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerAlign: {
    alignItems: 'center',
    width: '100%',
  },
  shareCardTitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 2.5,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  shareCardValue: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  shareCardGlowBlob: {
    position: 'absolute',
    top: '25%',
    left: '15%',
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(167, 139, 250, 0.05)',
  },
  iconGlowFrame: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(167, 139, 250, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  shareCardSubtext: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 6,
  },
  shareChecklist: {
    marginTop: 20,
    width: '100%',
    gap: 8,
    paddingHorizontal: 20,
  },
  shareChecklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  shareChecklistLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  shareChecklistLabelUnchecked: {
    color: 'rgba(255, 255, 255, 0.3)',
  },
  shareCardFooter: {
    color: 'rgba(255, 255, 255, 0.25)',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
  },
  shareActionsRow: {
    width: '100%',
    marginTop: 20,
    gap: 10,
  },
  shareConfirmBtn: {
    width: '100%',
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  shareConfirmBtnText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  shareCloseBtn: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareCloseBtnText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontWeight: '500',
  },
  sandboxCard: {
    backgroundColor: '#111117',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  sandboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#161620',
  },
  sandboxTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sandboxContent: {
    padding: 16,
    gap: 12,
  },
  sandboxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sandboxLabel: {
    color: '#D6D3D1',
    fontSize: 12,
    fontWeight: '500',
  },
  sandboxSubLabel: {
    color: '#A8A29E',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  toggleBtn: {
    backgroundColor: '#2A2A35',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#8B5CF6',
  },
  toggleBtnText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  demoButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  demoSelectBtn: {
    backgroundColor: '#161620',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 50,
    alignItems: 'center',
  },
  demoSelectBtnActive: {
    backgroundColor: '#A78BFA',
    borderColor: '#A78BFA',
  },
  demoSelectBtnText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  recapFeedCard: {
    backgroundColor: '#111117',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
    overflow: 'hidden',
  },
  recapCardGlowBlobInline: {
    position: 'absolute',
    bottom: '-10%',
    right: '-10%',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(167, 139, 250, 0.03)',
  },
  recapBrandingRowInline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  recapBrandingInline: {
    color: '#A78BFA',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  recapDateInline: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  recapTitleInline: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(167, 139, 250, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  recapGridInline: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  recapGridItemInline: {
    width: '48%',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.18)',
  },
  recapLabelInline: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  recapValInline: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 2,
  },
  recapSubValInline: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 9.5,
    marginTop: 1,
  },
  achievementBadgeInline: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.4)',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  achievementBadgeTextInline: {
    color: '#F9DF80',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  recapShareBtnInline: {
    width: '100%',
    backgroundColor: colors.accent,
    paddingVertical: 10,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  recapShareBtnTextInline: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  recapCardGlowBlob: {
    position: 'absolute',
    bottom: '20%',
    right: '10%',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(167, 139, 250, 0.04)',
  },
  recapShareContent: {
    width: '100%',
    marginTop: 10,
  },
  recapBrandingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  recapBranding: {
    color: '#A78BFA',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  recapDate: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  recapTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 0.5,
    textShadowColor: 'rgba(167, 139, 250, 0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  recapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  recapGridItem: {
    width: '47%',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.18)',
  },
  recapLabel: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  recapVal: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
    marginTop: 2,
  },
  recapSubVal: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 10,
    marginTop: 2,
  },
  achievementBadge: {
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.4)',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  achievementBadgeText: {
    color: '#F9DF80',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  spotlightBlob: {
    position: 'absolute',
    opacity: 0.85,
  },
  cardIconHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 4,
  },
  miniIconGlow: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
