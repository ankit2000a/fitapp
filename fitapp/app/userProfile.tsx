import { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Image, Modal, Share, TouchableWithoutFeedback } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { supabase } from '../lib/supabase';
import { colors } from '../constants/colors';
import { getUserBadges, Badge, getLocalDateString, getLocalDateStringFromUtc } from '../lib/userContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
interface BadgeTemplate {
  id: string;
  name: string;
  emoji: string;
  description: string;
  rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  category: 'challenge' | 'habit';
}

const ALL_BADGE_TEMPLATES: BadgeTemplate[] = [
  // Hardest Monthly Challenges
  {
    id: 'perfect_month_master',
    name: 'Perfect Month Master',
    emoji: '🏆',
    description: 'Achieve a perfect 25-day streak of daily scoring & logging goals',
    rarity: 'Legendary',
    category: 'challenge'
  },
  {
    id: 'century_club_crusher',
    name: '10K Endurance Titan',
    emoji: '🏃‍♂️',
    description: 'Complete 10k steps for 25 consecutive days',
    rarity: 'Legendary',
    category: 'challenge'
  },
  {
    id: 'protein_streak_25',
    name: 'Protein Master',
    emoji: '🛡️',
    description: 'Hit your daily protein target for 25 consecutive days',
    rarity: 'Epic',
    category: 'challenge'
  },
  // Hardest Weekly Challenge
  {
    id: 'savage_week_overlord',
    name: 'Savage Week Overlord',
    emoji: '⚡',
    description: 'Score a perfect 100 on your health score for 7 consecutive days',
    rarity: 'Legendary',
    category: 'challenge'
  }
];

export default function UserProfileScreen() {
  const router = useRouter();
  const { id: userId } = useLocalSearchParams<{ id: string }>();
  
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false);
  
  // Friendship state
  const [friendshipStatus, setFriendshipStatus] = useState<'none' | 'pending_out' | 'pending_in' | 'accepted'>('none');
  const [friendshipId, setFriendshipId] = useState<string>('');
  
  // Stats state
  const [badges, setBadges] = useState<Badge[]>([]);
  const [scores, setScores] = useState<any[]>([]); // last 7 days
  const [bestScore, setBestScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [comparison, setComparison] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [weeklyRecap, setWeeklyRecap] = useState<any>(null);
  const [streakModalVisible, setStreakModalVisible] = useState(false);
  const [loggedDates, setLoggedDates] = useState<Set<string>>(new Set());
  const [selectedDayScore, setSelectedDayScore] = useState<any>(null);
  const [breakdownModalVisible, setBreakdownModalVisible] = useState<boolean>(false);
  const [currentUsername, setCurrentUsername] = useState<string>('');

  // Sandbox state
  const [sandboxActive, setSandboxActive] = useState(false);
  const [sandboxExpanded, setSandboxExpanded] = useState(false);
  const [simulatedUnlocked, setSimulatedUnlocked] = useState<Record<string, boolean>>({
    perfect_month_master: false,
    century_club_crusher: false,
    protein_streak_25: false,
    savage_week_overlord: false
  });
  const [selectedBadge, setSelectedBadge] = useState<any>(null);
  const badgeShotRef = useRef<any>(null);
  const [isSharingBadge, setIsSharingBadge] = useState(false);
  const [sandboxProgressionDay, setSandboxProgressionDay] = useState<number>(7);

  const navigation = useNavigation();

  useEffect(() => {
    if (userId) {
      loadProfileData();
    }

    const unsubscribe = navigation.addListener('focus', () => {
      if (userId) {
        loadProfileData();
      }
    });

    return unsubscribe;
  }, [userId, navigation, sandboxActive, sandboxProgressionDay]);

  const loadProfileData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      // Fetch currently logged-in user's profile details to find username
      const { data: currentProfile } = await supabase
        .from('users')
        .select('username, is_admin')
        .eq('id', user.id)
        .single();
      if (currentProfile) {
        setCurrentUsername(currentProfile.username || '');
        setIsAdmin(currentProfile.is_admin || false);
      }

      // Fetch user profile
      const { data: userProfile, error: uErr } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (uErr || !userProfile) {
        Alert.alert('Error', 'User profile not found.');
        router.back();
        return;
      }
      setProfile(userProfile);

      // Load avatar with AsyncStorage cache fallback if it's the current user
      if (userId === user.id) {
        const localAvatar = await AsyncStorage.getItem(`@user_avatar_${user.id}`);
        setAvatarUri(userProfile.avatar_url || localAvatar);
      } else {
        setAvatarUri(userProfile.avatar_url);
      }

      // Fetch badges
      const userBadges = await getUserBadges(userId);
      setBadges(userBadges);

      // Check Friendship status
      let currentFriendshipStatus = 'none';
      if (user.id === userId) {
        setFriendshipStatus('accepted'); // own profile is treated as fully open
        currentFriendshipStatus = 'accepted';
      } else {
        const { data: fRecords } = await supabase
          .from('friendships')
          .select('*')
          .or(`and(user_id.eq.${user.id},friend_id.eq.${userId}),and(user_id.eq.${userId},friend_id.eq.${user.id})`);

        if (fRecords && fRecords.length > 0) {
          const rec = fRecords[0];
          setFriendshipId(rec.id);
          if (rec.status === 'accepted') {
            setFriendshipStatus('accepted');
            currentFriendshipStatus = 'accepted';
          } else if (rec.user_id === user.id) {
            setFriendshipStatus('pending_out');
            currentFriendshipStatus = 'pending_out';
          } else {
            setFriendshipStatus('pending_in');
            currentFriendshipStatus = 'pending_in';
          }
        } else {
          setFriendshipStatus('none');
          currentFriendshipStatus = 'none';
        }
      }

      // If we are friends, looking at our own profile, or the profile is public, fetch extended scores & stats
      const isPublic = userProfile?.privacy === 'public';
      const isAllowed = user.id === userId || currentFriendshipStatus === 'accepted' || isPublic;

      if (isAllowed) {
        // Fetch earliest score date to find sign-up/progression day count
        const { data: earliestRec } = await supabase
          .from('health_scores')
          .select('date')
          .eq('user_id', userId)
          .order('date', { ascending: true })
          .limit(1);

        let visibleDaysCount = 7; // Default/fallback to full 7 days
        if (sandboxActive) {
          visibleDaysCount = Math.min(7, sandboxProgressionDay);
        } else {
          const signupDateStr = userProfile?.created_at;
          if (signupDateStr) {
            const start = new Date(signupDateStr);
            const end = new Date();
            start.setHours(0,0,0,0);
            end.setHours(0,0,0,0);
            const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            visibleDaysCount = Math.min(7, Math.max(1, diffDays));
          } else if (earliestRec && earliestRec.length > 0) {
            const start = new Date(earliestRec[0].date);
            const end = new Date();
            start.setHours(0,0,0,0);
            end.setHours(0,0,0,0);
            const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            visibleDaysCount = Math.min(7, Math.max(1, diffDays));
          } else {
            visibleDaysCount = 1;
          }
        }

        // Fetch last 7 days scores with subscores and metrics
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        const dateStr = getLocalDateString(sevenDaysAgo);

        const { data: scoreRecords } = await supabase
          .from('health_scores')
          .select('score, date, sleep_score, activity_score, nutrition_score, steps, active_calories')
          .eq('user_id', userId)
          .gte('date', dateStr)
          .order('date', { ascending: true });

        // Build a perfect consecutive 7 day list
        const chartList = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = getLocalDateString(d);
          const label = d.toLocaleDateString('en-US', { weekday: 'narrow' });
          const match = scoreRecords?.find(r => r.date === dateStr);
          let scoreVal = match ? match.score || 0 : 0;
          chartList.push({
            date: dateStr,
            day: label,
            score: scoreVal,
            sleep_score: match ? match.sleep_score || 0 : 0,
            activity_score: match ? match.activity_score || 0 : 0,
            nutrition_score: match ? match.nutrition_score || 0 : 0,
            steps: match ? match.steps || 0 : 0,
            active_calories: match ? match.active_calories || 0 : 0,
          });
        }
        
        // Slice to progression days
        const slicedChartList = chartList.slice(7 - visibleDaysCount);
        setScores(slicedChartList);

        // Fetch best score of all time
        const { data: bestRec } = await supabase
          .from('health_scores')
          .select('score')
          .eq('user_id', userId)
          .order('score', { ascending: false })
          .limit(1);
        setBestScore(bestRec && bestRec.length > 0 ? bestRec[0].score || 0 : 0);

        // Calculate dynamic logging streak (last 30 days)
        const { data: lastLogs } = await supabase
          .from('food_logs')
          .select('logged_at, food_name')
          .eq('user_id', userId)
          .order('logged_at', { ascending: false });

        let currentStreak = 0;
        const filteredLastLogs = (lastLogs || []).filter(l => !l.food_name?.startsWith('__reward_lock:'));
        const loggedDatesSet = new Set(filteredLastLogs.map(l => l.logged_at ? getLocalDateStringFromUtc(l.logged_at) : '') || []);
        setLoggedDates(loggedDatesSet);
        if (filteredLastLogs.length > 0) {
          for (let i = 0; i < 30; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dStr = getLocalDateString(d);
            if (loggedDatesSet.has(dStr)) {
              currentStreak++;
            } else if (i > 0) {
              break;
            }
          }
        }
        setStreak(currentStreak);

        // Fetch rank comparison
        const { data: allUsers } = await supabase
          .from('users')
          .select('id, xp, level')
          .order('xp', { ascending: false });

        const myIndex = allUsers?.findIndex(u => u.id === user.id) ?? -1;
        const friendIndex = allUsers?.findIndex(u => u.id === userId) ?? -1;
        const myRank = myIndex !== -1 ? myIndex + 1 : null;
        const friendRank = friendIndex !== -1 ? friendIndex + 1 : null;

        // Fetch my logging streak
        const { data: myLastLogs } = await supabase
          .from('food_logs')
          .select('logged_at, food_name')
          .eq('user_id', user.id)
          .order('logged_at', { ascending: false });

        let myStreak = 0;
        const filteredMyLastLogs = (myLastLogs || []).filter(l => !l.food_name?.startsWith('__reward_lock:'));
        if (filteredMyLastLogs.length > 0) {
          const myLoggedDates = new Set(filteredMyLastLogs.map(l => l.logged_at ? getLocalDateStringFromUtc(l.logged_at) : ''));
          for (let i = 0; i < 30; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dStr = getLocalDateString(d);
            if (myLoggedDates.has(dStr)) {
              myStreak++;
            } else if (i > 0) {
              break;
            }
          }
        }

        // Fetch my today's score
        const todayStr = getLocalDateString(new Date());
        const { data: myTodayScoreRec } = await supabase
          .from('health_scores')
          .select('score')
          .eq('user_id', user.id)
          .eq('date', todayStr)
          .maybeSingle();
        const myTodayScore = myTodayScoreRec ? myTodayScoreRec.score || 0 : 0;

        // Friend's score today (from scoreRecords fetched above)
        const friendTodayScore = scoreRecords?.find(r => r.date === todayStr)?.score || 0;

        const streakDiff = currentStreak - myStreak;
        const scoreDiff = friendTodayScore - myTodayScore;

        setComparison({
          myRank,
          friendRank,
          streakDiff,
          scoreDiff,
          myStreak,
          friendStreak: currentStreak,
          myTodayScore,
          friendTodayScore
        });

        // Fetch weekly scores for recap card (preceding 7 days)
        const { data: friendWeeklyScores } = await supabase
          .from('health_scores')
          .select('score, date, sleep_score, activity_score, nutrition_score')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(7);

        const preceding7DaysScores = friendWeeklyScores || [];
        console.log('[DEBUG PROFILE SCORES] friendWeeklyScores:', JSON.stringify(friendWeeklyScores, null, 2));
        const highestHealthScore = preceding7DaysScores.length > 0 
          ? Math.max(...preceding7DaysScores.map(s => s.score || 0)) 
          : 0;

        // XP Earned: Show their actual profile XP
        const totalXpEarnedInWeek = userProfile?.xp || 0;

        // Leaderboard Peak Rank:
        const peakRank = friendRank || 1;

        // Streak: the logging streak
        const currentLoggingStreak = currentStreak || 0;

        // Today's score to show if it is Day 1
        const todayDateStr = getLocalDateString(new Date());
        const todayScoreVal = preceding7DaysScores.find(s => s.date === todayDateStr)?.score || 0;

        // Calculate dynamic Title
        const finalDaysCount = sandboxActive ? sandboxProgressionDay : visibleDaysCount;
        const recapTitle = finalDaysCount === 1
          ? `${userProfile?.name?.split(' ')[0] || 'User'}'s Today in Review`
          : finalDaysCount < 7
            ? `${userProfile?.name?.split(' ')[0] || 'User'}'s Last ${finalDaysCount} Days in Review`
            : `${userProfile?.name?.split(' ')[0] || 'User'}'s Week in Review`;

        // Check if they have not logged any health scores in the week
        if (highestHealthScore === 0) {
          setWeeklyRecap({
            name: userProfile?.name?.split(' ')[0] || 'User',
            title: recapTitle,
            highestScore: 0,
            xpEarned: 0,
            highestRank: '—',
            streak: 0,
            biggestWin: 'No Logs Recorded Yet'
          });
        } else {
          // Calculate Biggest Win dynamically
          let biggestWin = 'Started Logging Habits';
          if (highestHealthScore === 100) {
            biggestWin = 'Perfect Day Completed 🎯';
          } else if (highestHealthScore >= 90) {
            biggestWin = 'Elite Day Completed ⭐';
          } else if (highestHealthScore >= 85) {
            biggestWin = 'Top 10% Bracket 🏆';
          } else if (highestHealthScore >= 75) {
            biggestWin = 'Top 25% Bracket 🏆';
          } else {
            biggestWin = 'Active Streak Initiated 🔥';
          }

          setWeeklyRecap({
            name: userProfile?.name?.split(' ')[0] || 'User',
            title: recapTitle,
            highestScore: finalDaysCount === 1 ? todayScoreVal : highestHealthScore,
            xpEarned: totalXpEarnedInWeek,
            highestRank: peakRank,
            streak: currentLoggingStreak || 1,
            biggestWin
          });
        }
      }
    } catch (e) {
      console.log('Error loading user profile:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleResetAllData = async () => {
    Alert.alert(
      'Clear All data?',
      'This will permanently delete all health scores and food logs from the database for your user account to reset progression to Day 1.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Data',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                await supabase.from('food_logs').delete().eq('user_id', user.id);
                await supabase.from('health_scores').delete().eq('user_id', user.id);
                
                // Also reset created_at of user to today
                const { error: upErr } = await supabase.from('users').update({ created_at: new Date().toISOString() }).eq('id', user.id);
                if (upErr) {
                  console.log('Error updating created_at on reset:', upErr.message);
                }

                // Deactivate all local & global demo overrides + caches on reset
                setSandboxActive(false);
                setSandboxProgressionDay(7);
                await AsyncStorage.removeItem(`@future_you_demo_enabled_${user.id}`);
                await AsyncStorage.removeItem(`@future_you_demo_day_${user.id}`);
                await AsyncStorage.removeItem('@future_you_demo_enabled_global');
                await AsyncStorage.removeItem('@future_you_demo_day_global');
                await AsyncStorage.removeItem(`@future_projection_${user.id}`);
                
                // Reset local water logs and streak caches
                await AsyncStorage.removeItem(`@user_water_${user.id}`);
                await AsyncStorage.removeItem(`@streak_water_${user.id}`);
                await AsyncStorage.removeItem(`@user_water_reset_${user.id}`);

                Alert.alert('Success', 'All scores, logs, and sandbox simulations cleared! The app is reset to Day 1.');
                await loadProfileData();
              }
            } catch (err: any) {
              Alert.alert('Error', err.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleAddFriend = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.from('friendships').insert({
        user_id: currentUserId,
        friend_id: userId,
        status: 'pending'
      });
      if (error) throw error;
      Alert.alert('Friend request sent! 🎉');
      await loadProfileData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setLoading(false);
    }
  };

  const handleAcceptFriend = async () => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId);
      if (error) throw error;
      Alert.alert('Friend request accepted! 🤝');
      await loadProfileData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setLoading(false);
    }
  };

  const handleRemoveFriendOrCancelRequest = async (isCancel: boolean) => {
    try {
      Alert.alert(
        isCancel ? 'Cancel Request?' : 'Remove Friend?',
        isCancel 
          ? 'Are you sure you want to cancel your friend request?' 
          : 'Are you sure you want to remove this friend?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: isCancel ? 'Yes, Cancel' : 'Yes, Remove',
            style: 'destructive',
            onPress: async () => {
              setLoading(true);
              const { error } = await supabase
                .from('friendships')
                .delete()
                .eq('id', friendshipId);
              if (error) throw error;
              Alert.alert(isCancel ? 'Request cancelled' : 'Friend removed');
              await loadProfileData();
            }
          }
        ]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setLoading(false);
    }
  };

  const handleRejectFriendRequest = async () => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);
      if (error) throw error;
      Alert.alert('Friend request ignored');
      await loadProfileData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setLoading(false);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'Legendary': return '#F59E0B'; // Gold
      case 'Epic': return '#A78BFA'; // Purple
      case 'Rare': return '#3B82F6'; // Blue
      default: return 'rgba(255, 255, 255, 0.45)'; // Muted gray
    }
  };

  const getRarityBadgeStyle = (rarity: string) => {
    switch (rarity) {
      case 'Legendary': return { borderColor: 'rgba(245, 158, 11, 0.3)', backgroundColor: 'rgba(245, 158, 11, 0.05)' };
      case 'Epic': return { borderColor: 'rgba(167, 139, 250, 0.3)', backgroundColor: 'rgba(167, 139, 250, 0.05)' };
      case 'Rare': return { borderColor: 'rgba(59, 130, 246, 0.3)', backgroundColor: 'rgba(59, 130, 246, 0.05)' };
      default: return { borderColor: 'rgba(255, 255, 255, 0.08)', backgroundColor: '#111117' };
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return '#00D4FF';
    if (score >= 65) return '#00E676';
    if (score >= 40) return '#FF9800';
    return '#F44336';
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const isMe = currentUserId === userId;
  const isFriend = friendshipStatus === 'accepted';
  const isPublic = profile?.privacy === 'public';
  const showExtendedData = isMe || isFriend || isPublic;

  // Helper to generate calendar days for the current month
  const getCalendarDays = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexed

    // First day of current month
    const firstDay = new Date(year, month, 1);
    const startDayIndex = (firstDay.getDay() + 6) % 7;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const daysList = [];

    // 1. Previous month trailing days
    for (let i = startDayIndex - 1; i >= 0; i--) {
      daysList.push({
        dayNum: prevMonthDays - i,
        type: 'prev',
        dateStr: ''
      });
    }

    // 2. Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      daysList.push({
        dayNum: i,
        type: 'current',
        dateStr
      });
    }

    // 3. Next month leading days to complete weeks
    const totalSlots = daysList.length <= 35 ? 35 : 42;
    const trailingDaysCount = totalSlots - daysList.length;
    for (let i = 1; i <= trailingDaysCount; i++) {
      daysList.push({
        dayNum: i,
        type: 'next',
        dateStr: ''
      });
    }

    // Group into rows of 7 days
    const weeks = [];
    for (let i = 0; i < daysList.length; i += 7) {
      weeks.push(daysList.slice(i, i + 7));
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    return { weeks, monthName: monthNames[month], year };
  };

  const { weeks, monthName, year: calendarYear } = getCalendarDays();

  const currentMonthPrefix = (() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  })();

  const currentMonthActivities = Array.from(loggedDates).filter(d => d.startsWith(currentMonthPrefix)).length;

  const handleShareStreak = async () => {
    try {
      const message = `I'm on a ${streak}-day logging streak on FitApp! ⚡ Join me in building healthy habits!`;
      await Share.share({
        message,
      });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{isMe ? 'My Profile' : 'Profile'}</Text>
        <View style={{ width: 60 }} />
      </View>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>

      {profile && (
        <View style={styles.profileHeader}>
          {/* Avatar and Name */}
          <TouchableWithoutFeedback
            onLongPress={() => {
              if (avatarUri) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setImagePreviewVisible(true);
              }
            }}
            onPressOut={() => {
              setImagePreviewVisible(false);
            }}
          >
            <View style={[styles.avatarLarge, isFriend && { borderColor: '#00E676' }, isMe && { borderColor: colors.accent }]}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
              ) : (
                <Text style={styles.avatarText}>
                  {profile.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                </Text>
              )}
            </View>
          </TouchableWithoutFeedback>
          
          <View style={styles.nameRow}>
            <Text style={styles.nameText}>{profile.name}</Text>
          </View>
          <Text style={styles.usernameText}>@{profile.username}</Text>

          {/* Connection Actions for non-me */}
          {!isMe && (
            <View style={styles.actionSection}>
              {friendshipStatus === 'none' && (
                <TouchableOpacity style={styles.primaryBtn} onPress={handleAddFriend}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="person-add" size={16} color="#000" />
                    <Text style={styles.primaryBtnText}>Add Friend</Text>
                  </View>
                </TouchableOpacity>
              )}
              {friendshipStatus === 'pending_out' && (
                <TouchableOpacity style={styles.disabledBtn} onPress={() => handleRemoveFriendOrCancelRequest(true)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="time-outline" size={16} color={colors.subtext} />
                    <Text style={styles.disabledBtnText}>Requested (Cancel)</Text>
                  </View>
                </TouchableOpacity>
              )}
              {friendshipStatus === 'pending_in' && (
                <View style={{ flexDirection: 'row', gap: 10, width: '100%', paddingHorizontal: 20 }}>
                  <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={handleAcceptFriend}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#000" />
                      <Text style={styles.primaryBtnText}>Accept</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.disabledBtn, { flex: 1, borderColor: '#EF4444' }]} 
                    onPress={handleRejectFriendRequest}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="close-circle-outline" size={16} color="#EF4444" />
                      <Text style={[styles.disabledBtnText, { color: '#EF4444' }]}>Reject</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
              {friendshipStatus === 'accepted' && (
                <TouchableOpacity style={styles.friendBadge} onPress={() => handleRemoveFriendOrCancelRequest(false)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="checkmark" size={16} color="#00E676" />
                    <Text style={styles.friendBadgeText}>Friends (Tap to Unfriend)</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Privacy Notice for non-friends */}
          {!showExtendedData && (
            <View style={styles.privacyCard}>
              <Ionicons name="lock-closed-outline" size={36} color={colors.subtext} style={{ marginBottom: 4 }} />
              <Text style={styles.privacyTitle}>Profile Details Protected</Text>
              <Text style={styles.privacyDesc}>
                Add this user as a friend to see their goal, logging streak, and last 7 days score chart!
              </Text>
            </View>
          )}

          {/* Extended Stats Card for Friends / Self */}
          {showExtendedData && (
            <>
              {/* Streaks and High Scores Row */}
              <View style={styles.statsRow}>
                <TouchableOpacity style={styles.statCard} onPress={() => setStreakModalVisible(true)}>
                  <View style={[styles.statIconBg, { backgroundColor: 'rgba(0, 212, 255, 0.12)' }]}>
                    <Ionicons name="flash" size={18} color={colors.accent} />
                  </View>
                  <Text style={styles.statValue}>{streak} days</Text>
                  <Text style={styles.statLabel}>Current Streak</Text>
                </TouchableOpacity>
                <View style={styles.statCard}>
                  <View style={[styles.statIconBg, { backgroundColor: 'rgba(255, 152, 0, 0.12)' }]}>
                    <Ionicons name="trophy" size={18} color={colors.orange} />
                  </View>
                  <Text style={styles.statValue}>{bestScore} pts</Text>
                  <Text style={styles.statLabel}>Best Day Score</Text>
                </View>
              </View>

              {/* Mutual Comparison Row */}
              {!isMe && comparison && (
                <View style={styles.detailCard}>
                  <Text style={styles.cardHeader}>MUTUAL COMPARISON</Text>
                  <View style={styles.comparisonRow}>
                    <View style={styles.comparisonItem}>
                      <Ionicons name="ribbon-outline" size={18} color={colors.accent} />
                      <Text style={styles.comparisonValue}>
                        #{comparison.friendRank || '—'} vs #{comparison.myRank || '—'}
                      </Text>
                      <Text style={styles.comparisonLabel}>Rank (Them vs You)</Text>
                    </View>
                    
                    <View style={styles.comparisonItem}>
                      <Ionicons name="flame" size={18} color={colors.orange} />
                      <Text style={styles.comparisonValue}>
                        {comparison.streakDiff > 0 
                          ? `+${comparison.streakDiff} days` 
                          : comparison.streakDiff < 0 
                          ? `${comparison.streakDiff} days` 
                          : 'Tied'}
                      </Text>
                      <Text style={styles.comparisonLabel}>
                        {comparison.streakDiff > 0 
                          ? 'They lead' 
                          : comparison.streakDiff < 0 
                          ? 'You lead' 
                          : 'Same streak'}
                      </Text>
                    </View>

                    <View style={styles.comparisonItem}>
                      <Ionicons name="stats-chart" size={18} color="#00E676" />
                      <Text style={styles.comparisonValue}>
                        {comparison.scoreDiff > 0 
                          ? `+${comparison.scoreDiff} pts` 
                          : comparison.scoreDiff < 0 
                          ? `${comparison.scoreDiff} pts` 
                          : 'Tied'}
                      </Text>
                      <Text style={styles.comparisonLabel}>Today's Score Diff</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Custom SVG Score Chart (Capsules vertical bars) */}
              <View style={styles.detailCard}>
                <Text style={styles.cardHeader}>
                  {scores.length === 1 ? "TODAY'S SCORE CHART" : `LAST ${scores.length} DAYS SCORE CHART`}
                </Text>
                
                {scores.length === 0 ? (
                  <Text style={styles.emptyChartText}>No scores recorded this week yet.</Text>
                ) : (
                  <View style={styles.chartContainer}>
                    <View style={styles.barsContainer}>
                      {scores.map((s, i) => {
                        const barHeight = Math.max(10, (s.score / 100) * 140);
                        return (
                          <TouchableOpacity 
                            key={i} 
                            style={styles.barColumn}
                            onPress={() => {
                              setSelectedDayScore(s);
                              setBreakdownModalVisible(true);
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={styles.barTrack}>
                              <View style={[styles.barFill, {
                                height: barHeight,
                                backgroundColor: getScoreColor(s.score)
                              }]} />
                            </View>
                            <Text style={styles.barLabel}>{s.day}</Text>
                            <Text style={[styles.barScore, { color: getScoreColor(s.score) }]}>
                              {s.score > 0 ? s.score : '—'}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
              </View>

              {/* Badges & Trophies Showcase */}
              <View style={styles.detailCard}>
                <Text style={styles.cardHeader}>
                  {profile.name ? `${profile.name.split(' ')[0].toUpperCase()}'S BADGES & TROPHIES` : "USER'S BADGES & TROPHIES"}
                </Text>
                
                <View style={styles.badgeGrid}>
                  {ALL_BADGE_TEMPLATES.map((template) => {
                    const isUnlocked = sandboxActive 
                      ? simulatedUnlocked[template.id] 
                      : badges.some(b => b.id === template.id);
                    return (
                      <TouchableOpacity 
                        key={template.id} 
                        style={[
                          styles.badgeGridCard, 
                          isUnlocked ? getRarityBadgeStyle(template.rarity) : styles.lockedBadgeCard
                        ]}
                        onPress={() => {
                          if (isUnlocked) {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSelectedBadge(template);
                          } else {
                            Alert.alert("Locked", `Complete this challenge to unlock the "${template.name}" badge!`);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.badgeGridEmoji, !isUnlocked && { opacity: 0.5 }]}>
                          {template.emoji}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                            <Text style={[styles.badgeGridName, !isUnlocked && { color: 'rgba(255,255,255,0.4)' }]} numberOfLines={1}>
                              {template.name}
                            </Text>
                            {!isUnlocked && <Ionicons name="lock-closed" size={10} color="rgba(255,255,255,0.3)" />}
                          </View>
                          <Text style={styles.badgeGridDesc} numberOfLines={2}>
                            {template.description}
                          </Text>
                          <Text 
                            style={[
                              styles.badgeGridRarity, 
                              { color: isUnlocked ? getRarityColor(template.rarity) : 'rgba(255,255,255,0.3)' }
                            ]}
                          >
                            {isUnlocked ? template.rarity.toUpperCase() : 'LOCKED'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Goal & Gender Card */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 4 }}>
                <View style={[styles.detailCard, { flex: 1, marginBottom: 0, alignItems: 'center' }]}>
                  <Text style={styles.cardHeader}>CURRENT GOAL</Text>
                  <Text style={styles.goalText}>
                    {profile.goal ? profile.goal.replace('_', ' ').toUpperCase() : 'MAINTAIN'}
                  </Text>
                </View>
                <View style={[styles.detailCard, { flex: 1, marginBottom: 0, alignItems: 'center' }]}>
                  <Text style={styles.cardHeader}>GENDER</Text>
                  <Text style={styles.goalText}>
                    {profile.gender ? profile.gender.toUpperCase() : 'MALE'}
                  </Text>
                </View>
              </View>

              {/* Weekly Recap Card */}
              {/* Weekly Recap Card */}
              {weeklyRecap && (
                <View style={[styles.detailCard, { padding: 0, overflow: 'hidden' }]}>
                  <LinearGradient
                    colors={['#160e30', '#0a0618', '#030209']}
                    style={{ padding: 20, overflow: 'hidden', position: 'relative' }}
                  >
                    {/* Background spotlights */}
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

                    <View style={styles.recapBrandingRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Image 
                          source={require('../assets/images/logo-egg.png')} 
                          style={{ width: 14, height: 14, borderRadius: 3 }} 
                        />
                        <Text style={styles.recapBranding}>FITAPP PULSE</Text>
                      </View>
                      <Text style={styles.recapDate}>WEEKLY RECAP</Text>
                    </View>
                    
                    <Text style={styles.recapTitle}>{weeklyRecap.title}</Text>
                    
                    <View style={styles.recapGrid}>
                      <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItem}>
                        <View style={styles.cardIconHeader}>
                          <Text style={styles.recapLabel}>HEALTH SCORE</Text>
                          <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(16, 185, 129, 0.12)' }]}>
                            <Ionicons name="pulse" size={12} color="#10B981" />
                          </View>
                        </View>
                        <Text style={styles.recapVal}>{weeklyRecap.highestScore} pts</Text>
                        <Text style={styles.recapSubVal}>⚡ Highest score</Text>
                      </LinearGradient>
                      
                      <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItem}>
                        <View style={styles.cardIconHeader}>
                          <Text style={styles.recapLabel}>XP EARNED</Text>
                          <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(245, 158, 11, 0.12)' }]}>
                            <Ionicons name="flash" size={12} color="#F59E0B" />
                          </View>
                        </View>
                        <Text style={styles.recapVal}>{weeklyRecap.xpEarned > 0 ? `+${weeklyRecap.xpEarned}` : '0'} XP</Text>
                        <Text style={styles.recapSubVal}>⭐ Unlocked progress</Text>
                      </LinearGradient>
                      
                      <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItem}>
                        <View style={styles.cardIconHeader}>
                          <Text style={styles.recapLabel}>LEADERBOARD</Text>
                          <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(59, 130, 246, 0.12)' }]}>
                            <Ionicons name="podium" size={12} color="#3B82F6" />
                          </View>
                        </View>
                        <Text style={styles.recapVal}>{weeklyRecap.highestRank === '—' ? '—' : `#${weeklyRecap.highestRank}`}</Text>
                        <Text style={styles.recapSubVal}>↑ Peak standing</Text>
                      </LinearGradient>

                      <LinearGradient colors={['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.015)']} style={styles.recapGridItem}>
                        <View style={styles.cardIconHeader}>
                          <Text style={styles.recapLabel}>STREAK</Text>
                          <View style={[styles.miniIconGlow, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                            <Ionicons name="flame" size={12} color="#EF4444" />
                          </View>
                        </View>
                        <Text style={styles.recapVal}>{weeklyRecap.streak} Days</Text>
                        <Text style={styles.recapSubVal}>🔥 Logging streak</Text>
                      </LinearGradient>
                    </View>

                    <View style={{ width: '100%', alignItems: 'center', marginVertical: 12 }}>
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
                          🏆 BIGGEST WIN: {weeklyRecap.biggestWin.toUpperCase()}
                        </Text>
                      </LinearGradient>
                    </View>

                    <Text style={styles.recapFooter}>COMPETE WITH FRIENDS. SURPASS YOURSELF.</Text>
                  </LinearGradient>
                </View>
              )}
            </>
          )}

          {/* Developer Sandbox & Toggle Deck */}
          {isAdmin && (
            <View style={[styles.sandboxCard, { marginTop: 24, marginBottom: 16 }]}>
              <TouchableOpacity 
                style={styles.sandboxHeader}
                onPress={() => setSandboxExpanded(!sandboxExpanded)}
                activeOpacity={0.8}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="construct-outline" size={14} color="#A78BFA" />
                  <Text style={styles.sandboxTitle}>Dev Sandbox & Toggle Deck</Text>
                </View>
                <Ionicons name={sandboxExpanded ? "chevron-up" : "chevron-down"} size={16} color="#A78BFA" />
              </TouchableOpacity>
              
              {sandboxExpanded && (
                <View style={styles.sandboxContent}>
                  <View style={styles.sandboxRow}>
                    <Text style={styles.sandboxLabel}>Sandbox Mode (Override Badges)</Text>
                    <TouchableOpacity 
                      style={[styles.toggleBtn, sandboxActive ? styles.toggleBtnActive : {}]}
                      onPress={() => setSandboxActive(!sandboxActive)}
                    >
                      <Text style={styles.toggleBtnText}>{sandboxActive ? 'ON' : 'OFF'}</Text>
                    </TouchableOpacity>
                  </View>

                  {sandboxActive && (
                    <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingTop: 12, gap: 10 }}>
                      <Text style={styles.sandboxSubLabel}>Select Simulated Progression Day:</Text>
                      <View style={styles.demoButtonsGrid}>
                        {([1, 3, 8] as const).map((d) => (
                          <TouchableOpacity
                            key={d}
                            style={[styles.demoSelectBtn, sandboxProgressionDay === d ? styles.demoSelectBtnActive : {}]}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setSandboxProgressionDay(d);
                            }}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.demoSelectBtnText, sandboxProgressionDay === d ? { color: '#000000' } : {}]}>
                              {d === 1 ? 'DAY 1' : d === 3 ? 'DAY 3' : 'DAY 8+'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      <Text style={[styles.sandboxSubLabel, { marginTop: 8 }]}>Toggle Simulated Unlock States:</Text>
                      
                      {ALL_BADGE_TEMPLATES.map(b => (
                        <View key={b.id} style={styles.sandboxRow}>
                          <Text style={[styles.sandboxLabel, { fontSize: 11 }]}>{b.name}</Text>
                          <TouchableOpacity 
                            style={[styles.toggleBtn, simulatedUnlocked[b.id] ? styles.toggleBtnActive : {}]}
                            onPress={() => {
                              setSimulatedUnlocked(prev => ({
                                ...prev,
                                [b.id]: !prev[b.id]
                              }));
                            }}
                          >
                            <Text style={styles.toggleBtnText}>{simulatedUnlocked[b.id] ? 'UNLOCKED' : 'LOCKED'}</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={{ borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginTop: 12, paddingTop: 12 }}>
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: '#EF4444', width: '100%', paddingVertical: 10, alignItems: 'center', justifyContent: 'center' }]}
                      onPress={handleResetAllData}
                    >
                      <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 13 }}>🧹 Clear All Scores, Logs & Progress</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>
      )}
      </ScrollView>

      {/* Streak Calendar Modal */}
      <Modal
        visible={streakModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setStreakModalVisible(false)}
      >
        <SafeAreaProvider>
          <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setStreakModalVisible(false)} style={styles.modalCloseButton}>
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{monthName} {calendarYear}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalScrollContent}>
            {/* Metrics Row */}
            <View style={styles.modalMetricsRow}>
              <View style={styles.modalMetric}>
                <Text style={styles.modalMetricLabel}>Your Streak</Text>
                <Text style={styles.modalMetricValue}>{streak} Days</Text>
              </View>
              <View style={styles.modalMetric}>
                <Text style={styles.modalMetricLabel}>Streak Activities</Text>
                <Text style={styles.modalMetricValue}>{currentMonthActivities}</Text>
              </View>
            </View>

            {/* Calendar Grid Card */}
            <View style={styles.calendarCard}>
              {/* Day names header */}
              <View style={styles.calendarWeekdaysRow}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S', ''].map((day, idx) => (
                  <View key={idx} style={styles.weekdayCell}>
                    <Text style={styles.weekdayText}>{day}</Text>
                  </View>
                ))}
              </View>

              {/* Weeks grid */}
              {weeks.map((week, weekIdx) => {
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                
                const loggedCount = week.filter(d => d.dateStr && loggedDates.has(d.dateStr)).length;
                const todayTime = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
                const isFutureWeek = week.every(d => !d.dateStr || new Date(d.dateStr).getTime() > todayTime);

                return (
                  <View key={weekIdx} style={styles.calendarWeekRow}>
                    {/* 7 calendar days */}
                    {week.map((day, dayIdx) => {
                      const isToday = day.dateStr === todayStr;
                      const hasLog = day.dateStr ? loggedDates.has(day.dateStr) : false;
                      const isPast = day.dateStr ? new Date(day.dateStr) < new Date(today.getFullYear(), today.getMonth(), today.getDate()) : false;

                      return (
                        <View key={dayIdx} style={styles.dayCell}>
                          {day.type === 'current' ? (
                            hasLog ? (
                              <View style={styles.loggedCircle}>
                                <Ionicons name="restaurant" size={12} color="#A78BFA" />
                              </View>
                            ) : isToday ? (
                              <View style={styles.todayCircle}>
                                <Text style={styles.todayText}>{day.dayNum}</Text>
                              </View>
                            ) : isPast ? (
                              <View style={styles.pastCircle}>
                                <Text style={styles.pastText}>{day.dayNum}</Text>
                              </View>
                            ) : (
                              <View style={styles.futureCircle}>
                                <Text style={styles.futureText}>{day.dayNum}</Text>
                              </View>
                            )
                          ) : (
                            <Text style={styles.mutedDayText}>{day.dayNum}</Text>
                          )}
                        </View>
                      );
                    })}

                    {/* 8th column: Weekly Achievement Status */}
                    <View style={styles.streakCell}>
                      {isFutureWeek ? (
                        <View style={styles.streakPlaceholderCircle} />
                      ) : loggedCount === 7 ? (
                        <View style={styles.goldCrownCircle}>
                          <MaterialCommunityIcons name="crown" size={16} color="#F59E0B" />
                        </View>
                      ) : loggedCount > 0 ? (
                        <View style={styles.activeWeekCircle}>
                          <Text style={styles.activeWeekText}>{loggedCount}</Text>
                        </View>
                      ) : (
                        <View style={styles.streakPlaceholderCircle} />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      {/* Score Breakdown Modal */}
      <Modal
        visible={breakdownModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setBreakdownModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackgroundDismiss} 
            activeOpacity={1} 
            onPress={() => setBreakdownModalVisible(false)}
          />
          <View style={[styles.breakdownModalContent, { backgroundColor: '#0B0B0F', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, width: '100%', maxHeight: '75%', position: 'absolute', bottom: 0, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }]}>
            {selectedDayScore && (
              <View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold' }}>
                    {new Date(selectedDayScore.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </Text>
                  <TouchableOpacity onPress={() => setBreakdownModalVisible(false)} style={{ padding: 4 }}>
                    <Ionicons name="close" size={24} color="#FFF" />
                  </TouchableOpacity>
                </View>

                <View style={{ alignItems: 'center', marginBottom: 24 }}>
                  <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(167, 139, 250, 0.08)', borderWidth: 2, borderColor: getScoreColor(selectedDayScore.score), justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: '#FFF', fontSize: 24, fontWeight: 'bold' }}>{selectedDayScore.score}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>Score</Text>
                  </View>
                </View>

                <ScrollView style={{ gap: 16 }} showsVerticalScrollIndicator={false}>
                  {/* Category subscores */}
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>🥗 Nutrition</Text>
                      <Text style={{ color: '#A78BFA', fontWeight: 'bold' }}>{selectedDayScore.nutrition_score || 0} / 35</Text>
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Includes calorie and protein alignment with your goals.</Text>
                  </View>

                  <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>👟 Movement</Text>
                      <Text style={{ color: '#A78BFA', fontWeight: 'bold' }}>{selectedDayScore.activity_score || 0} / 30</Text>
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 8 }}>Based on steps and exercise tracked from Apple Health.</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Steps: {selectedDayScore.steps ? selectedDayScore.steps.toLocaleString() : '0'}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Active Calories: {selectedDayScore.active_calories || 0} kcal</Text>
                    </View>
                  </View>

                  {(() => {
                    const nutrition = selectedDayScore.nutrition_score || 0;
                    const activity = selectedDayScore.activity_score || 0;
                    const sleep = selectedDayScore.sleep_score || 0;
                    const hasSleepRecords = scores.some(s => (s.sleep_score || 0) > 0);
                    const isSleepUnavailable = (!hasSleepRecords && sleep === 0) || sleep < 0;

                    const isToday = selectedDayScore.date === getLocalDateString(new Date());
                    const isNormalized = isSleepUnavailable && !isToday;

                    const displayRecovery = isNormalized
                      ? Math.max(0, Math.min(10, Math.round(selectedDayScore.score * 0.75) - nutrition - activity))
                      : Math.max(0, Math.min(10, selectedDayScore.score - nutrition - activity - sleep));

                    return (
                      <>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>😴 Sleep</Text>
                            <Text style={{ color: '#A78BFA', fontWeight: 'bold' }}>
                              {isSleepUnavailable ? 'Unavailable' : `${sleep} / 25`}
                            </Text>
                          </View>
                          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
                            {isSleepUnavailable 
                              ? 'Sleep tracking is not set up on your device.' 
                              : 'Reflects sleep duration and consistency from Apple Health.'}
                          </Text>
                        </View>

                        <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', marginBottom: 20 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ color: '#FFF', fontWeight: 'bold', fontSize: 14 }}>💧 Recovery</Text>
                            <Text style={{ color: '#A78BFA', fontWeight: 'bold' }}>
                              {displayRecovery} / 10
                            </Text>
                          </View>
                          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>Based on hydration logging compliance.</Text>
                        </View>

                        {isNormalized && (
                          <View style={{ paddingHorizontal: 4, marginBottom: 20 }}>
                            <Text style={{ color: '#A78BFA', fontSize: 11, fontStyle: 'italic', textAlign: 'center' }}>
                              * Sleep data unavailable so showing normalized score
                            </Text>
                          </View>
                        )}
                      </>
                    );
                  })()}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Instagram-style Avatar Zoom Preview */}
      {imagePreviewVisible && (
        <TouchableWithoutFeedback onPressOut={() => setImagePreviewVisible(false)}>
          <View style={styles.previewOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.previewContainer}>
                {avatarUri && (
                  <Image 
                    source={{ uri: avatarUri }} 
                    style={styles.previewImage} 
                    resizeMode="cover" 
                  />
                )}
                <Text style={styles.previewName}>{profile?.name}</Text>
                <Text style={styles.previewUsername}>@{profile?.username}</Text>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      )}

      {/* Badge Details & Share Modal */}
      {selectedBadge && (() => {
        const firstName = profile?.name ? profile.name.split(' ')[0].toUpperCase() : 'USER';
        const badgeColors = (selectedBadge.rarity === 'Legendary' 
          ? ['#2E1B05', '#160E03', '#060401'] 
          : selectedBadge.rarity === 'Epic' 
            ? ['#210F3A', '#0D061A', '#04030A'] 
            : ['#1E2026', '#0E1013', '#060708']) as [string, string, ...string[]];
        const glowColor = selectedBadge.rarity === 'Legendary' 
          ? 'rgba(245, 158, 11, 0.08)' 
          : selectedBadge.rarity === 'Epic' 
            ? 'rgba(167, 139, 250, 0.08)' 
            : 'rgba(255, 255, 255, 0.04)';
        return (
          <TouchableWithoutFeedback onPress={() => setSelectedBadge(null)}>
            <View style={styles.previewOverlay}>
              <TouchableWithoutFeedback>
                <View style={{ width: 340, alignItems: 'center' }}>
                  <ViewShot ref={badgeShotRef} options={{ format: 'png', quality: 0.95 }} style={{ borderRadius: 28, overflow: 'hidden', width: 340, height: 605 }}>
                    <LinearGradient
                      colors={badgeColors}
                      style={[
                        styles.premiumShareCard, 
                        selectedBadge.rarity === 'Legendary' && styles.legendaryGoldBorder,
                        selectedBadge.rarity === 'Epic' && styles.epicPurpleBorder,
                        { borderWidth: 0, margin: 0 }
                      ]}
                    >
                      {/* Decorative glowing blob */}
                      <View style={[styles.premiumBadgeGlow, { backgroundColor: glowColor }]} />
                      
                      {/* Radiating Svg Lines */}
                      <View style={StyleSheet.absoluteFill}>
                        <Svg height="100%" width="100%">
                          <Path d="M0,605 C100,500 240,500 340,605" fill="none" stroke={selectedBadge.rarity === 'Legendary' ? 'rgba(245, 158, 11, 0.025)' : 'rgba(167, 139, 250, 0.025)'} strokeWidth={1.5} />
                          <Path d="M0,605 C100,470 240,470 340,605" fill="none" stroke={selectedBadge.rarity === 'Legendary' ? 'rgba(245, 158, 11, 0.015)' : 'rgba(167, 139, 250, 0.015)'} strokeWidth={1} />
                          <Path d="M0,605 C100,440 240,440 340,605" fill="none" stroke={selectedBadge.rarity === 'Legendary' ? 'rgba(245, 158, 11, 0.008)' : 'rgba(167, 139, 250, 0.008)'} strokeWidth={1} />
                        </Svg>
                      </View>

                      {/* Branding Header */}
                      <View style={{ alignItems: 'center', marginTop: 8 }}>
                        <Image 
                          source={require('../assets/images/logo-egg.png')} 
                          style={styles.shareCardLogo} 
                        />
                        <Text style={styles.shareCardBranding}>FITAPP</Text>
                      </View>
                      
                      {/* Achievement Details */}
                      <View style={styles.shareCardContent}>
                        <View style={[
                          styles.badgeEmojiFrame,
                          selectedBadge.rarity === 'Legendary' && styles.legendaryGlowFrame,
                          selectedBadge.rarity === 'Epic' && styles.epicGlowFrame
                        ]}>
                          <Text style={styles.badgeDetailEmoji}>{selectedBadge.emoji}</Text>
                        </View>
                        
                        <Text style={styles.badgeUserUnlock}>
                          {firstName}'S UNLOCK
                        </Text>
                        
                        <Text style={styles.badgeDetailName}>{selectedBadge.name}</Text>
                        
                        <Text style={[styles.badgeDetailRarity, { color: getRarityColor(selectedBadge.rarity) }]}>
                          {selectedBadge.rarity.toUpperCase()}
                        </Text>
                        
                        <Text style={styles.badgeDetailDesc}>{selectedBadge.description}</Text>
                      </View>
                      
                      <Text style={styles.shareCardFooter}>BUILD MOMENTUM. LIVE HEALTHIER.</Text>
                    </LinearGradient>
                  </ViewShot>
                  
                  {/* Actions (Outside ViewShot so they are not captured in the shared image) */}
                  <View style={{ width: '100%', alignItems: 'center', marginTop: 16 }}>
                    <TouchableOpacity 
                      style={styles.badgeShareBtn} 
                      onPress={async () => {
                        if (isSharingBadge) return;
                        setIsSharingBadge(true);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        try {
                          if (badgeShotRef.current) {
                            const uri = await captureRef(badgeShotRef, { format: 'png', quality: 0.95 });
                            await Sharing.shareAsync(uri, {
                              mimeType: 'image/png',
                              dialogTitle: `Share Badge`,
                            });
                          }
                        } catch (err) {
                          console.log('Error sharing badge card:', err);
                          Alert.alert('Sharing Failed', 'Could not generate the badge card image.');
                        } finally {
                          setIsSharingBadge(false);
                        }
                      }}
                    >
                      <Ionicons name="share-social-outline" size={16} color="#000" style={{ marginRight: 6 }} />
                      <Text style={styles.badgeShareBtnText}>
                        {isSharingBadge ? 'Generating...' : 'Share Badge'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity 
                      style={styles.badgeCloseBtn} 
                      onPress={() => setSelectedBadge(null)}
                    >
                      <Text style={styles.badgeCloseBtnText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        );
      })()}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, backgroundColor: colors.bg },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  backButton: { paddingVertical: 4 },
  backButtonText: { color: colors.accent, fontSize: 16 },
  title: { color: colors.text, fontSize: 18, fontWeight: 'bold' },
  profileHeader: { alignItems: 'center', gap: 16, marginTop: 12 },
  avatarLarge: { width: 88, height: 88, borderRadius: 44, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center', borderWidth: 2.5, borderColor: '#333', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 41.5, resizeMode: 'cover' },
  avatarText: { color: colors.text, fontSize: 28, fontWeight: 'bold' },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  nameText: { color: colors.text, fontSize: 24, fontWeight: 'bold' },
  fireEmoji: { fontSize: 24 },
  usernameText: { color: colors.subtext, fontSize: 15, marginTop: -8, marginBottom: 12 },
  
  actionSection: { width: '100%', alignItems: 'center', marginBottom: 8 },
  primaryBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, alignItems: 'center' },
  primaryBtnText: { color: '#000', fontSize: 15, fontWeight: 'bold' },
  disabledBtn: { backgroundColor: '#333', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 24, alignItems: 'center', borderWidth: 1, borderColor: '#444' },
  disabledBtnText: { color: colors.subtext, fontSize: 14 },
  friendBadge: { backgroundColor: '#1a2a1a', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 28, borderWidth: 1, borderColor: '#00E676' },
  friendBadgeText: { color: '#00E676', fontSize: 14, fontWeight: 'bold' },
  
  privacyCard: { backgroundColor: colors.card, borderRadius: 16, padding: 24, alignItems: 'center', width: '100%', gap: 10, marginTop: 12, borderWidth: 1, borderColor: '#222' },
  privacyTitle: { color: colors.text, fontSize: 16, fontWeight: 'bold' },
  privacyDesc: { color: colors.subtext, fontSize: 13, textAlign: 'center', lineHeight: 18 },
  
  statsRow: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 8 },
  statCard: { flex: 1, backgroundColor: colors.card, borderRadius: 16, padding: 16, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#222' },
  statIconBg: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: 'bold' },
  statLabel: { color: colors.subtext, fontSize: 12 },
  
  detailCard: { backgroundColor: colors.card, borderRadius: 16, padding: 18, width: '100%', gap: 10, borderWidth: 1, borderColor: '#222' },
  cardHeader: { color: colors.subtext, fontSize: 11, letterSpacing: 1.5, fontWeight: 'bold' },
  goalText: { color: colors.accent, fontSize: 18, fontWeight: 'bold' },
  
  // Custom HSL Chart styles
  chartContainer: { height: 200, justifyContent: 'flex-end', marginTop: 16 },
  barsContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 180 },
  barColumn: { alignItems: 'center', gap: 6, flex: 1 },
  barTrack: { height: 140, width: 14, backgroundColor: '#222', borderRadius: 7, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: 14, borderRadius: 7 },
  barLabel: { color: colors.subtext, fontSize: 11 },
  barScore: { fontSize: 10, fontWeight: 'bold' },
  emptyChartText: { color: colors.subtext, fontSize: 13, textAlign: 'center', marginVertical: 20 },
  
  // Comparison styles
  comparisonRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  comparisonItem: { flex: 1, alignItems: 'center', gap: 4 },
  comparisonValue: { color: colors.text, fontSize: 16, fontWeight: 'bold' },
  comparisonLabel: { color: colors.subtext, fontSize: 9, textAlign: 'center' },

  // Weekly recap styles
  recapBrandingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  recapBranding: { color: '#C084FC', fontSize: 10, fontWeight: 'bold', letterSpacing: 3 },
  recapDate: { color: 'rgba(255, 255, 255, 0.5)', fontSize: 10, fontWeight: 'bold', letterSpacing: 2 },
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
  recapGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  recapGridItem: {
    width: '47%',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.18)',
  },
  recapLabel: { color: 'rgba(255, 255, 255, 0.45)', fontSize: 8, fontWeight: 'bold', letterSpacing: 1 },
  recapVal: { color: '#FFFFFF', fontSize: 17, fontWeight: 'bold', marginTop: 2 },
  recapSubVal: { color: 'rgba(255, 255, 255, 0.35)', fontSize: 10, marginTop: 2 },
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
  recapFooter: { color: 'rgba(255, 255, 255, 0.25)', fontSize: 8, fontWeight: 'bold', letterSpacing: 1.5, textAlign: 'center', marginTop: 8 },
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
  badgeSubHeader: { color: '#A78BFA', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginTop: 8, marginBottom: 8 },
  badgeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%' },
  badgeGridCard: { width: '48.5%', flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 8, borderWidth: 1, marginBottom: 8 },
  lockedBadgeCard: { borderColor: 'rgba(255, 255, 255, 0.04)', backgroundColor: 'rgba(255, 255, 255, 0.01)', opacity: 0.45 },
  badgeGridEmoji: { fontSize: 22 },
  badgeGridName: { color: '#FFFFFF', fontSize: 11, fontWeight: 'bold', flex: 1 },
  badgeGridDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 9, marginTop: 1, lineHeight: 12 },
  badgeGridRarity: { fontSize: 8, fontWeight: 'bold', letterSpacing: 0.5, marginTop: 3 },
  // Modal styles
  modalContainer: { flex: 1, backgroundColor: '#000000' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  modalCloseButton: { padding: 4 },
  modalTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: 'bold' },
  modalShareButton: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  modalShareText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  modalContent: { flex: 1 },
  modalScrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  modalMetricsRow: { flexDirection: 'row', gap: 40, marginVertical: 24, paddingHorizontal: 4 },
  modalMetric: { gap: 4 },
  modalMetricLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
  modalMetricValue: { color: '#FFFFFF', fontSize: 28, fontWeight: 'bold' },
  calendarCard: { backgroundColor: '#111117', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#222' },
  calendarWeekdaysRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  weekdayCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  weekdayText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },
  calendarWeekRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 48, marginBottom: 8 },
  dayCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  streakCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loggedCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(167, 139, 250, 0.15)', borderWidth: 1.5, borderColor: '#A78BFA', justifyContent: 'center', alignItems: 'center' },
  todayCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1.5, borderColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  todayText: { color: '#FFFFFF', fontSize: 14, fontWeight: 'bold' },
  pastCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1c1c1e', justifyContent: 'center', alignItems: 'center' },
  pastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  futureCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#2c2c2e', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  futureText: { color: '#FFFFFF', fontSize: 14 },
  mutedDayText: { color: 'rgba(255,255,255,0.2)', fontSize: 14 },
  goldCrownCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1.5, borderColor: '#F59E0B', justifyContent: 'center', alignItems: 'center' },
  activeWeekCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(167, 139, 250, 0.1)', borderWidth: 1.5, borderColor: 'rgba(167, 139, 250, 0.4)', justifyContent: 'center', alignItems: 'center' },
  activeWeekText: { color: '#A78BFA', fontSize: 13, fontWeight: 'bold' },
  streakPlaceholderCircle: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#2c2c2e', backgroundColor: 'transparent' },
  // Instagram-style Avatar Zoom styles
  previewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewContainer: {
    width: 280,
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
  },
  previewImage: {
    width: 240,
    height: 240,
    borderRadius: 120,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  previewName: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  previewUsername: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    marginTop: 2,
  },
  // Sandbox styles
  sandboxCard: {
    backgroundColor: '#1E1E2A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  sandboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  sandboxTitle: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sandboxContent: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  sandboxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sandboxLabel: {
    color: '#FFFFFF',
    fontSize: 12,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  toggleBtnActive: {
    backgroundColor: '#A78BFA',
  },
  toggleBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  sandboxSubLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginBottom: 4,
  },
  // Badge details styles
  badgeDetailEmoji: {
    fontSize: 64,
    marginBottom: 0,
  },
  badgeDetailName: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  badgeDetailRarity: {
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  badgeDetailDesc: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  badgeShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    marginBottom: 12,
  },
  badgeShareBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: 'bold',
  },
  badgeCloseBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    width: '100%',
  },
  badgeCloseBtnText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
  // Premium Share Card styles
  premiumShareCard: {
    width: 340,
    height: 605,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 15,
    overflow: 'hidden',
  },
  premiumBadgeGlow: {
    position: 'absolute',
    top: '20%',
    width: 240,
    height: 240,
    borderRadius: 120,
    zIndex: 0,
  },
  badgeEmojiFrame: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  legendaryGlowFrame: {
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: 'rgba(245, 158, 11, 0.06)',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.4,
    shadowRadius: 18,
  },
  epicGlowFrame: {
    borderColor: 'rgba(167, 139, 250, 0.35)',
    backgroundColor: 'rgba(167, 139, 250, 0.06)',
    shadowColor: '#A78BFA',
    shadowOpacity: 0.4,
    shadowRadius: 18,
  },
  legendaryGoldBorder: {
    borderColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  epicPurpleBorder: {
    borderColor: '#A78BFA',
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
  },
  shareCardLogo: {
    width: 28,
    height: 28,
    alignSelf: 'center',
    marginBottom: 4,
  },
  shareCardBranding: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 4,
    textAlign: 'center',
  },
  shareCardContent: {
    alignItems: 'center',
    marginVertical: 14,
    width: '100%',
  },
  badgeUserUnlock: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginTop: 4,
    marginBottom: 6,
  },
  shareCardFooter: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 2.5,
    textAlign: 'center',
    marginBottom: 16,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalBackgroundDismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  breakdownModalContent: {},
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
});
