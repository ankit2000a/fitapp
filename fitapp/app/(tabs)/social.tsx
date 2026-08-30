import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity, TextInput, Alert, Image, Modal } from 'react-native';
import * as Sharing from 'expo-sharing';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import { getOriginalMacros, getLocalDateString, getLocalDateStringFromUtc } from '../../lib/userContext';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle } from 'react-native-svg';

interface FriendProfile {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  level: number;
  xp: number;
}

interface FeedItem {
  id: string;
  userName: string;
  avatarUrl: string | null;
  type: string;
  title: string;
  subtitle: string;
  time: string;
  icon: any;
  color: string;
  userId?: string;
  date?: string;
  shareDetails?: {
    cardType: 'perfect' | 'streak' | 'surge' | 'age';
    title: string;
    value: string;
    subtext: string;
    checklist?: { label: string; checked: boolean }[];
  };
}

interface Reaction {
  id: string;
  user_id: string;
  feed_item_id: string;
  emoji: string;
  user?: {
    username: string;
    name: string;
  };
}

const day1MockFeed: FeedItem[] = [
  {
    id: 'user-challenge-mock-1',
    userName: 'You',
    avatarUrl: null,
    type: 'streak',
    time: 'Achievement',
    title: 'You completed a challenge! 🌐',
    subtitle: 'Successfully finished the "Hydration Wave" weekly challenge!',
    icon: 'globe-outline',
    color: '#00D4FF',
    userId: 'logged-in-user',
    date: 'TODAY',
    shareDetails: {
      cardType: 'streak',
      title: 'CHALLENGE COMPLETED',
      value: 'Hydration Wave',
      subtext: 'You finished the challenge.'
    }
  },
  {
    id: 'friend-challenge-rahul-mock-1',
    userName: 'Rahul',
    avatarUrl: null,
    type: 'streak',
    time: 'Achievement',
    title: '@rahulfit completed a challenge! 🌐',
    subtitle: 'Successfully finished the "Cardio Challenge" weekly challenge!',
    icon: 'globe-outline',
    color: '#00D4FF',
    userId: 'mock-rahul',
    date: 'TODAY',
    shareDetails: {
      cardType: 'streak',
      title: 'CHALLENGE COMPLETED',
      value: 'Cardio Challenge',
      subtext: '@rahulfit finished the challenge.'
    }
  },
  {
    id: 'friend-duel-sara-mock-1',
    userName: 'Sara',
    avatarUrl: null,
    type: 'perfect',
    time: 'Duel Win',
    title: '@sara_fit won a duel! 🏆',
    subtitle: '@sara_fit claimed victory in the "Sleep Clash" duel against @john_doe!',
    icon: 'medal-outline',
    color: '#FFD700',
    userId: 'mock-sara',
    date: 'TODAY',
    shareDetails: {
      cardType: 'perfect',
      title: 'DUEL VICTORY',
      value: 'Sleep Clash',
      subtext: '@sara_fit defeated @john_doe in duel.'
    }
  }
];

const day2MockFeed: FeedItem[] = [
  {
    id: 'user-rank-change-mock-2',
    userName: 'You',
    avatarUrl: null,
    type: 'score',
    time: 'Rank Shift',
    title: 'Your rank went up by 10 spots! 📈',
    subtitle: 'You changed your global standing from position 15 to 5 today.',
    icon: 'trending-up-outline',
    color: colors.accent,
    userId: 'logged-in-user',
    date: 'TODAY',
    shareDetails: {
      cardType: 'surge',
      title: 'GLOBAL STANDINGS SHIFT',
      value: '+10 spots',
      subtext: 'Your rank went from 15 to 5.'
    }
  },
  {
    id: 'friend-rank-change-rahul-mock-2',
    userName: 'Rahul',
    avatarUrl: null,
    type: 'score',
    time: 'Rank Shift',
    title: "@rahulfit's rank went up by 9 spots! 📈",
    subtitle: 'Rahul changed their global standing from position 23 to 14 today.',
    icon: 'trending-up-outline',
    color: colors.accent,
    userId: 'mock-rahul',
    date: 'TODAY',
    shareDetails: {
      cardType: 'surge',
      title: 'GLOBAL STANDINGS SHIFT',
      value: '+9 spots',
      subtext: '@rahulfit rank went from 23 to 14.'
    }
  },
  {
    id: 'friend-challenge-sara-mock-2',
    userName: 'Sara',
    avatarUrl: null,
    type: 'age',
    time: 'Achievement',
    title: '@sara_fit completed a challenge! 🌐',
    subtitle: 'Successfully finished the "Hydration Week" monthly challenge!',
    icon: 'ribbon-outline',
    color: '#F87171',
    userId: 'mock-sara',
    date: 'TODAY',
    shareDetails: {
      cardType: 'age',
      title: 'CHALLENGE COMPLETED',
      value: 'Hydration Week',
      subtext: '@sara_fit finished the challenge.'
    }
  }
];

const day3MockFeed: FeedItem[] = [
  {
    id: 'user-duel-mock-3',
    userName: 'You',
    avatarUrl: null,
    type: 'perfect',
    time: 'Duel Win',
    title: 'You won a duel! 🏆',
    subtitle: 'You claimed victory in the "Step Clash" duel against @rahulfit!',
    icon: 'medal-outline',
    color: '#FFD700',
    userId: 'logged-in-user',
    date: 'TODAY',
    shareDetails: {
      cardType: 'perfect',
      title: 'DUEL VICTORY',
      value: 'Step Clash',
      subtext: 'You defeated @rahulfit in duel.'
    }
  },
  {
    id: 'friend-duel-sara-mock-3',
    userName: 'Sara',
    avatarUrl: null,
    type: 'perfect',
    time: 'Duel Win',
    title: '@sara_fit won a duel! 🏆',
    subtitle: '@sara_fit claimed victory in the "Step Clash" duel against @john_doe!',
    icon: 'medal-outline',
    color: '#FFD700',
    userId: 'mock-sara',
    date: 'TODAY',
    shareDetails: {
      cardType: 'perfect',
      title: 'DUEL VICTORY',
      value: 'Step Clash',
      subtext: '@sara_fit defeated @john_doe in duel.'
    }
  },
  {
    id: 'friend-rank-change-rahul-mock-3',
    userName: 'Rahul',
    avatarUrl: null,
    type: 'score',
    time: 'Rank Shift',
    title: "@rahulfit's rank went down by 8 spots! 📉",
    subtitle: 'Rahul changed their global standing from position 14 to 22 today.',
    icon: 'trending-down-outline',
    color: '#F87171',
    userId: 'mock-rahul',
    date: 'TODAY',
    shareDetails: {
      cardType: 'surge',
      title: 'GLOBAL STANDINGS SHIFT',
      value: '-8 spots',
      subtext: '@rahulfit rank went from 14 to 22.'
    }
  }
];

const stripEmojis = (str: string): string => {
  if (!str) return '';
  return str.replace(/[\u2600-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDFFF]/g, '').trim();
};


export default function SocialScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const mainScrollViewRef = useRef<ScrollView>(null);
  const [userRowY, setUserRowY] = useState<number | null>(null);
  const lastScrolledRef = useRef<string>('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [mockReactions, setMockReactions] = useState<Reaction[]>([
    // Reactions to User's own mock accomplishments
    {
      id: 'mock-r-u1',
      user_id: 'mock-sara',
      feed_item_id: 'user-challenge-mock-1',
      emoji: '🔥',
      user: { username: 'sara_fit', name: 'Sara' }
    },
    {
      id: 'mock-r-u2',
      user_id: 'mock-john',
      feed_item_id: 'user-challenge-mock-1',
      emoji: '👏',
      user: { username: 'john_doe', name: 'John Doe' }
    },
    {
      id: 'mock-r-u3',
      user_id: 'mock-rahul',
      feed_item_id: 'user-rank-change-mock-2',
      emoji: '❤️',
      user: { username: 'rahulfit', name: 'Rahul' }
    },
    {
      id: 'mock-r-u4',
      user_id: 'mock-sara',
      feed_item_id: 'user-rank-change-mock-2',
      emoji: '🔥',
      user: { username: 'sara_fit', name: 'Sara' }
    },
    {
      id: 'mock-r-u5',
      user_id: 'mock-sara',
      feed_item_id: 'user-duel-mock-3',
      emoji: '👏',
      user: { username: 'sara_fit', name: 'Sara' }
    },
    // Reactions to Friend mock accomplishments
    {
      id: 'mock-r-f1',
      user_id: 'mock-sara',
      feed_item_id: 'friend-challenge-rahul-mock-1',
      emoji: '🙌',
      user: { username: 'sara_fit', name: 'Sara' }
    },
    {
      id: 'mock-r-f2',
      user_id: 'mock-rahul',
      feed_item_id: 'friend-duel-sara-mock-1',
      emoji: '👏',
      user: { username: 'rahulfit', name: 'Rahul' }
    },
    {
      id: 'mock-r-f3',
      user_id: 'mock-sara',
      feed_item_id: 'friend-rank-change-rahul-mock-2',
      emoji: '🔥',
      user: { username: 'sara_fit', name: 'Sara' }
    },
    {
      id: 'mock-r-f4',
      user_id: 'mock-rahul',
      feed_item_id: 'friend-challenge-sara-mock-2',
      emoji: '🙌',
      user: { username: 'rahulfit', name: 'Rahul' }
    },
    {
      id: 'mock-r-f5',
      user_id: 'mock-rahul',
      feed_item_id: 'friend-duel-sara-mock-3',
      emoji: '👏',
      user: { username: 'rahulfit', name: 'Rahul' }
    },
    {
      id: 'mock-r-f6',
      user_id: 'mock-sara',
      feed_item_id: 'friend-rank-change-rahul-mock-3',
      emoji: '😢',
      user: { username: 'sara_fit', name: 'Sara' }
    }
  ]);

  const [sandboxExpanded, setSandboxExpanded] = useState(false);
  const [sandboxActive, setSandboxActive] = useState(false);
  const [simulateOutOfBounds, setSimulateOutOfBounds] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [userLevel, setUserLevel] = useState<number>(1);
  const [userXp, setUserXp] = useState<number>(0);
  const [simulatedDay, setSimulatedDay] = useState<'day1' | 'day2' | 'day3'>('day1');
  const [isAdmin, setIsAdmin] = useState(false);

  // Reaction UI states
  const [activeEmojiPickerItemId, setActiveEmojiPickerItemId] = useState<string | null>(null);
  const [whoReactedModalVisible, setWhoReactedModalVisible] = useState(false);
  const [whoReactedList, setWhoReactedList] = useState<{ username: string; name: string }[]>([]);
  const [whoReactedEmoji, setWhoReactedEmoji] = useState<string>('');

  const handleToggleReaction = async (itemId: string, emoji: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    if (sandboxActive) {
      // Find if we already reacted
      const existingIdx = mockReactions.findIndex(r => r.feed_item_id === itemId && r.emoji === emoji && r.user_id === 'logged-in-user');
      if (existingIdx > -1) {
        // Remove reaction
        setMockReactions(prev => prev.filter((_, idx) => idx !== existingIdx));
      } else {
        // Add reaction
        const newReaction: Reaction = {
          id: `mock-user-r-${Date.now()}`,
          user_id: 'logged-in-user',
          feed_item_id: itemId,
          emoji: emoji,
          user: { username: 'you', name: 'You' }
        };
        setMockReactions(prev => [...prev, newReaction]);
      }
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const currentUserIdVal = session.user.id;

    // Fetch user profile username/name for local optimistic updates
    const { data: userProfile } = await supabase
      .from('users')
      .select('username, name')
      .eq('id', currentUserIdVal)
      .single();

    // Check if user has already reacted with this emoji to this item
    const existing = reactions.find(r => r.feed_item_id === itemId && r.emoji === emoji && r.user_id === currentUserIdVal);

    if (existing) {
      // Delete reaction
      const { error } = await supabase
        .from('feed_reactions')
        .delete()
        .eq('user_id', currentUserIdVal)
        .eq('feed_item_id', itemId)
        .eq('emoji', emoji);
      if (!error) {
        setReactions(prev => prev.filter(r => r.id !== existing.id));
      } else {
        console.log('Error deleting reaction:', error.message);
        Alert.alert('Database Migration Required', 'Reactions table not found. Please run the SQL migration script in your Supabase SQL Editor.');
      }
    } else {
      // Insert reaction
      const { data: newReaction, error } = await supabase
        .from('feed_reactions')
        .insert({
          user_id: currentUserIdVal,
          feed_item_id: itemId,
          emoji: emoji
        })
        .select('*')
        .single();
      if (error) {
        console.log('Error inserting reaction:', error.message);
        Alert.alert('Database Migration Required', 'Reactions table not found. Please run the SQL migration script in your Supabase SQL Editor.');
        return;
      }
      if (newReaction) {
        const fullReaction: Reaction = {
          ...newReaction,
          user: {
            username: userProfile?.username || 'Athlete',
            name: userProfile?.name || 'Athlete'
          }
        };
        setReactions(prev => [...prev, fullReaction]);
      }
    }
  };

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Tabs state
  const [activeSubTab, setActiveSubTab] = useState<'feed' | 'leaderboard' | 'friends'>('feed');
  const [leaderboardScope, setLeaderboardScope] = useState<'global' | 'friends'>('global');

  // Friendship states
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<any[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<any[]>([]);
  const [suggestedAthletes, setSuggestedAthletes] = useState<any[]>([]);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Lists
  const [leaderboardData, setLeaderboardData] = useState<any[]>([]);
  const [feedData, setFeedData] = useState<FeedItem[]>([]);

  // Weekly Recap states
  const [weeklyRecapData, setWeeklyRecapData] = useState<any>(null);
  const [recapModalVisible, setRecapModalVisible] = useState(false);

  // Challenges state
  const [hydrationProgress, setHydrationProgress] = useState(0);
  const [proteinProgress, setProteinProgress] = useState(0);
  const [sleepProgress, setSleepProgress] = useState(0);
  const [stepsProgress, setStepsProgress] = useState(0);
  
  const [hydrationGoal, setHydrationGoal] = useState(2500);
  const [proteinGoal, setProteinGoal] = useState(140);
  const [sleepGoal, setSleepGoal] = useState(7.5);
  const [stepsGoal, setStepsGoal] = useState(10000);

  const [isSharing, setIsSharing] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [shareCardData, setShareCardData] = useState<any>(null);
  const viewShotRef = useRef<any>(null);

  const openShareCard = async (item: FeedItem) => {
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

  const [isSharingRecap, setIsSharingRecap] = useState(false);
  const weeklyRecapRef = useRef<any>(null);

  const handleShareWeeklyRecap = async () => {
    if (isSharingRecap) return;
    setIsSharingRecap(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      if (weeklyRecapRef.current) {
        const uri = await captureRef(weeklyRecapRef, { format: 'png', quality: 0.95 });
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: `Share Weekly Recap`,
        });
      }
    } catch (err) {
      console.log('Error sharing weekly recap:', err);
      Alert.alert('Sharing Failed', 'Could not generate the weekly recap card image.');
    } finally {
      setIsSharingRecap(false);
    }
  };

  const openWeeklyRecap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRecapModalVisible(true);
  };

  const handleMockShare = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "Instagram Story ✨",
      "This user's high-fidelity achievement card has been formatted and copied! Share their momentum with your community.",
      [{ text: "Awesome!" }]
    );
  };

  const loadSocialData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setLoading(false);
        return;
      }
      const currentUserId = session.user.id;
      setUserId(currentUserId);

      // 1. Fetch friendships
      const { data: friendships } = await supabase
        .from('friendships')
        .select('*')
        .or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);

      const friendIds: string[] = [];
      const pendingInc: string[] = [];
      const pendingOut: string[] = [];

      if (friendships) {
        friendships.forEach(f => {
          if (f.status === 'accepted') {
            const fId = f.user_id === currentUserId ? f.friend_id : f.user_id;
            friendIds.push(fId);
          } else {
            if (f.friend_id === currentUserId) {
              pendingInc.push(f.user_id);
            } else {
              pendingOut.push(f.friend_id);
            }
          }
        });
      }

      // Fetch friend profiles
      let friendProfiles: FriendProfile[] = [];
      if (friendIds.length > 0) {
        const { data: pData } = await supabase
          .from('users')
          .select('id, name, username, avatar_url, level, xp')
          .in('id', friendIds);
        friendProfiles = pData || [];
      }
      setFriends(friendProfiles);

      // Fetch pending incoming profiles
      if (pendingInc.length > 0) {
        const { data: incData } = await supabase
          .from('users')
          .select('id, name, avatar_url, level, xp')
          .in('id', pendingInc);
        setPendingIncoming(incData || []);
      } else {
        setPendingIncoming([]);
      }

      // Fetch pending outgoing profiles
      if (pendingOut.length > 0) {
        const { data: outData } = await supabase
          .from('users')
          .select('id, name, avatar_url, level, xp')
          .in('id', pendingOut);
        setPendingOutgoing(outData || []);
      } else {
        setPendingOutgoing([]);
      }

      // 1.5 Fetch Weekly Recap Data dynamically
      const { data: userScores } = await supabase
        .from('health_scores')
        .select('score, date, sleep_score, activity_score, nutrition_score')
        .eq('user_id', currentUserId)
        .order('date', { ascending: false })
        .limit(7);
      
      const { data: profile } = await supabase
        .from('users')
        .select('id, name, username, avatar_url, level, xp, age, is_admin')
        .eq('id', currentUserId)
        .single();

      if (profile) {
        setAvatarUri(profile.avatar_url || null);
        setProfileName(profile.name || '');
        setCurrentUsername(profile.username || '');
        setUserLevel(profile.level || 1);
        setUserXp(profile.xp || 0);
        setIsAdmin(profile.is_admin || false);
      }

      const baseAge = profile?.age || 25;

      const getFutureScoreFromScore = (scoreVal: number) => {
        return Math.min(100, Math.round(scoreVal * 1.08 + 2));
      };

      // Get user's streak
      const { data: lastLogs } = await supabase
        .from('food_logs')
        .select('logged_at, food_name')
        .eq('user_id', currentUserId)
        .order('logged_at', { ascending: false });

      let currentStreak = 0;
      const filteredLastLogs = (lastLogs || []).filter(l => !l.food_name?.startsWith('__reward_lock:'));
      if (filteredLastLogs.length > 0) {
        const loggedDates = new Set(filteredLastLogs.map(l => l.logged_at ? getLocalDateStringFromUtc(l.logged_at) : ''));
        for (let i = 0; i < 30; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dStr = getLocalDateString(d);
          if (loggedDates.has(dStr)) {
            currentStreak++;
          } else if (i > 0) {
            break;
          }
        }
      }

      // Query global users to get rank
      const { data: allUsersSorted } = await supabase
        .from('users')
        .select('id')
        .order('xp', { ascending: false });
      const myRankIndex = allUsersSorted?.findIndex(u => u.id === currentUserId) ?? -1;
      const myRank = myRankIndex !== -1 ? myRankIndex + 1 : 1;

      if (userScores && userScores.length > 0) {
        const latestScore = userScores[0].score || 0;
        const oldestScore = userScores[userScores.length - 1].score || 0;
        
        let sleepAvg = 0, activityAvg = 0, nutritionAvg = 0;
        let habitCount = 0;
        userScores.forEach(r => {
          if (r.sleep_score || r.activity_score || r.nutrition_score) {
            sleepAvg += Math.max(0, r.sleep_score || 0);
            activityAvg += r.activity_score || 0;
            nutritionAvg += r.nutrition_score || 0;
            habitCount++;
          }
        });
        
        if (habitCount > 0) {
          sleepAvg /= habitCount;
          activityAvg /= habitCount;
          nutritionAvg /= habitCount;
        }

        let bestHabit = 'Hydration';
        if (sleepAvg > activityAvg && sleepAvg > nutritionAvg) {
          bestHabit = 'Sleep';
        } else if (activityAvg > sleepAvg && activityAvg > nutritionAvg) {
          bestHabit = 'Steps';
        } else if (nutritionAvg > sleepAvg && nutritionAvg > activityAvg) {
          bestHabit = 'Nutrition';
        }
        
        const xpEarned = profile ? Math.max(80, (profile.xp || 0) % 500) : 320;

        setWeeklyRecapData({
          name: profile?.name?.split(' ')[0] || 'User',
          oldScore: oldestScore || 39,
          newScore: latestScore || 55,
          bestHabit,
          oldFutureScore: getFutureScoreFromScore(oldestScore || 39),
          newFutureScore: getFutureScoreFromScore(latestScore || 55),
          xpEarned: `+${xpEarned}`,
          oldRank: myRank + 2,
          newRank: myRank,
          streak: Math.max(1, currentStreak),
          biggestWin: latestScore >= 85 ? 'Top 10% Bracket' : 'Top 25% Bracket'
        });
      } else {
        setWeeklyRecapData({
          name: profile?.name?.split(' ')[0] || 'User',
          oldScore: 39,
          newScore: 55,
          bestHabit: 'Hydration',
          oldFutureScore: getFutureScoreFromScore(39),
          newFutureScore: getFutureScoreFromScore(55),
          xpEarned: '+320',
          oldRank: myRank + 2,
          newRank: myRank,
          streak: Math.max(1, currentStreak || 7),
          biggestWin: 'Top 25% Bracket'
        });
      }

      // 2. Fetch Leaderboard Data
      let currentLeaderboard: any[] = [];
      if (leaderboardScope === 'global') {
        const { data: globalUsers } = await supabase
          .from('users')
          .select('id, name, username, avatar_url, level, xp')
          .order('xp', { ascending: false })
          .limit(50);
        
        const top50 = globalUsers || [];
        
        // Calculate display ranks for the top 50
        let currentRank = 1;
        const rankedUsers: any[] = top50.map((u, idx, arr) => {
          if (idx > 0 && (u.xp || 0) !== (arr[idx - 1].xp || 0)) {
            currentRank = idx + 1;
          }
          return { ...u, rank: currentRank };
        });

        // Check if the current user is in the top 50
        const isUserInTop50 = simulateOutOfBounds ? false : rankedUsers.some(u => u.id === currentUserId);
        
        if (!isUserInTop50 && profile) {
          // Fetch rank of the current user
          let myRank = 80;
          if (!simulateOutOfBounds) {
            const { count } = await supabase
              .from('users')
              .select('*', { count: 'exact', head: true })
              .gt('xp', profile.xp || 0);
            
            myRank = (count || 0) + 1;
          }
          
          rankedUsers.push({ id: 'leaderboard-separator-item', isSeparator: true });
          rankedUsers.push({
            id: profile.id,
            name: profile.name,
            username: profile.username,
            avatar_url: profile.avatar_url,
            level: profile.level,
            xp: profile.xp,
            rank: myRank,
            isBottomCard: true
          });
        }
        
        currentLeaderboard = rankedUsers;
      } else {
        // Friends scope:
        const selfProfile = profile ? {
          id: profile.id,
          name: profile.name,
          username: profile.username,
          avatar_url: profile.avatar_url,
          level: profile.level,
          xp: profile.xp
        } : null;

        const localList = selfProfile ? [selfProfile, ...friendProfiles] : friendProfiles;
        const sortedList = [...localList].sort((a, b) => (b.xp || 0) - (a.xp || 0));
        
        // Calculate ranks for friends list
        let currentRank = 1;
        currentLeaderboard = sortedList.map((u, idx, arr) => {
          if (idx > 0 && (u.xp || 0) !== (arr[idx - 1].xp || 0)) {
            currentRank = idx + 1;
          }
          return { ...u, rank: currentRank };
        });
      }
      setLeaderboardData(currentLeaderboard);
      console.log('DEBUG LEADERBOARD DATA:', currentLeaderboard.map(u => ({ id: u?.id, name: u?.name, username: u?.username, xp: u?.xp })));

      // 3. Fetch Friend accomplishments feed (only friend updates, rank shifts, completions, duels)
      if (sandboxActive) {
        let mockFeed: FeedItem[] = [];
        if (simulatedDay === 'day1') {
          mockFeed = day1MockFeed;
        } else if (simulatedDay === 'day2') {
          mockFeed = day2MockFeed;
        } else if (simulatedDay === 'day3') {
          mockFeed = day3MockFeed;
        }
        setFeedData(mockFeed);
      } else {
        const friendConnectionDates = new Map<string, string>();
        if (friendships) {
          friendships.forEach(f => {
            const fId = f.user_id === currentUserId ? f.friend_id : f.user_id;
            const dateVal = f.updated_at || f.created_at || new Date().toISOString();
            const connDateStr = getLocalDateString(new Date(dateVal));
            friendConnectionDates.set(fId, connDateStr);
          });
        }

        const userSignupDateStr = getLocalDateString(
          session.user.created_at ? new Date(session.user.created_at) : new Date()
        );
        const today = getLocalDateString(new Date());

        const shouldShowFeedItem = (userId: string, itemDateStr: string) => {
          if (userId === currentUserId) {
            return itemDateStr >= userSignupDateStr;
          }
          const connDate = friendConnectionDates.get(userId) || today;
          const minDate = connDate > userSignupDateStr ? connDate : userSignupDateStr;
          return itemDateStr >= minDate;
        };

        let items: FeedItem[] = [];

        const feedUserIds = [...friendIds, currentUserId];

        if (feedUserIds.length > 0) {
          // Fetch profiles of feed users
          const { data: feedProfiles } = await supabase
            .from('users')
            .select('id, username, name, avatar_url')
            .in('id', feedUserIds);
          const feedProfileMap = new Map(feedProfiles?.map(p => [p.id, p]) || []);

          const sixteenDaysAgo = new Date();
          sixteenDaysAgo.setDate(sixteenDaysAgo.getDate() - 16);
          const sixteenDaysAgoStr = getLocalDateString(sixteenDaysAgo);

          // A. Rank Shift highlights logic:
          // Fetch health scores for all users to compute rankings on the fly
          const { data: allScores } = await supabase
            .from('health_scores')
            .select('user_id, date, score')
            .gte('date', sixteenDaysAgoStr);

          const scoresByDate: Record<string, { user_id: string; score: number }[]> = {};
          if (allScores) {
            allScores.forEach(row => {
              if (!scoresByDate[row.date]) {
                scoresByDate[row.date] = [];
              }
              scoresByDate[row.date].push(row);
            });
          }

          const ranksByDateAndUser: Record<string, Record<string, number>> = {};
          Object.keys(scoresByDate).forEach(dateStr => {
            const dayScores = scoresByDate[dateStr];
            // Sort descending by score. In case of ties, consistent ordering by user_id
            dayScores.sort((a, b) => b.score !== a.score ? b.score - a.score : a.user_id.localeCompare(b.user_id));
            ranksByDateAndUser[dateStr] = {};
            dayScores.forEach((row, idx) => {
              ranksByDateAndUser[dateStr][row.user_id] = idx + 1; // 1-based rank
            });
          });

          // Compute rank shifts for each user in feedUserIds
          const friendRankShiftFeedItemsByDate: Record<string, FeedItem[]> = {};
          
          // Loop over dates in the last 15 days
          for (let i = 0; i < 15; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = getLocalDateString(d);
            
            const yesterday = new Date(d);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = getLocalDateString(yesterday);

            feedUserIds.forEach(feedUserId => {
              if (!shouldShowFeedItem(feedUserId, dateStr)) return;

              const rankToday = ranksByDateAndUser[dateStr]?.[feedUserId];
              const rankYesterday = ranksByDateAndUser[yesterdayStr]?.[feedUserId];

              if (rankToday !== undefined && rankYesterday !== undefined) {
                const diff = rankYesterday - rankToday; // positive: went up; negative: fell/went down
                if (Math.abs(diff) >= 7) {
                  if (!friendRankShiftFeedItemsByDate[dateStr]) {
                    friendRankShiftFeedItemsByDate[dateStr] = [];
                  }
                  const feedUserProfile = feedProfileMap.get(feedUserId);
                  const isOwnItem = feedUserId === currentUserId;
                  const wentUp = diff > 0;
                  const titleText = isOwnItem 
                    ? `Your rank went ${wentUp ? 'up' : 'down'} by ${Math.abs(diff)} spots! ${wentUp ? '📈' : '📉'}`
                    : `@${feedUserProfile?.username || 'Athlete'}'s rank went ${wentUp ? 'up' : 'down'} by ${Math.abs(diff)} spots! ${wentUp ? '📈' : '📉'}`;
                  
                  const subtitleText = isOwnItem
                    ? `You changed your global standing from position ${rankYesterday} to ${rankToday} today.`
                    : `${feedUserProfile?.name || 'Athlete'} changed their global standing from position ${rankYesterday} to ${rankToday} today.`;

                  friendRankShiftFeedItemsByDate[dateStr].push({
                    id: `rank-shift-${feedUserId}-${dateStr}`,
                    userName: isOwnItem ? 'You' : (feedUserProfile?.name || 'Athlete'),
                    avatarUrl: feedUserProfile?.avatar_url || null,
                    type: 'score',
                    time: 'Rank Shift',
                    title: titleText,
                    subtitle: subtitleText,
                    icon: wentUp ? 'trending-up-outline' : 'trending-down-outline',
                    color: wentUp ? colors.accent : '#F87171',
                    userId: feedUserId,
                    date: dateStr,
                    shareDetails: {
                      cardType: 'surge',
                      title: 'GLOBAL STANDINGS SHIFT',
                      value: `${wentUp ? '+' : '-'}${Math.abs(diff)} spots`,
                      subtext: isOwnItem
                        ? `Your rank went from ${rankYesterday} to ${rankToday}.`
                        : `@${feedUserProfile?.username || 'Athlete'} rank went from ${rankYesterday} to ${rankToday}.`
                    }
                  });
                }
              }
            });
          }

          // B. Completed Competitions logic:
          const { data: friendParticipations } = await supabase
            .from('challenge_participations_v2')
            .select('*, challenge:challenges_v2(*)')
            .in('user_id', feedUserIds)
            .eq('status', 'COMPLETED')
            .gte('completed_at', sixteenDaysAgoStr);

          const challengeFeedItemsByDate: Record<string, FeedItem[]> = {};
          if (friendParticipations) {
            friendParticipations.forEach(p => {
              if (!p.completed_at || !p.challenge) return;
              const completedDateStr = getLocalDateString(new Date(p.completed_at));
              if (!shouldShowFeedItem(p.user_id, completedDateStr)) return;

              if (!challengeFeedItemsByDate[completedDateStr]) {
                challengeFeedItemsByDate[completedDateStr] = [];
              }

              const feedUserProfile = feedProfileMap.get(p.user_id);
              const isOwnItem = p.user_id === currentUserId;
              const userHandle = isOwnItem ? 'You' : `@${feedUserProfile?.username || 'Athlete'}`;
              const isWeekly = p.challenge.type === 'weekly';
              const iconName = isWeekly ? 'globe-outline' : 'ribbon-outline';
              const colorTheme = isWeekly ? '#00D4FF' : '#F87171';
              const cardTypeVal = isWeekly ? 'streak' : 'age';
              const titleText = isOwnItem
                ? `You completed a challenge! 🌐`
                : `${userHandle} completed a challenge! 🌐`;
              const subtitleText = `Successfully finished the "${p.challenge.title}" ${p.challenge.type || 'global'} challenge!`;

              challengeFeedItemsByDate[completedDateStr].push({
                id: `challenge-${p.id}`,
                userName: isOwnItem ? 'You' : (feedUserProfile?.name || 'Athlete'),
                avatarUrl: feedUserProfile?.avatar_url || null,
                type: isWeekly ? 'streak' : 'age',
                time: 'Achievement',
                title: titleText,
                subtitle: subtitleText,
                icon: iconName,
                color: colorTheme,
                userId: p.user_id,
                date: completedDateStr,
                shareDetails: {
                  cardType: cardTypeVal,
                  title: 'CHALLENGE COMPLETED',
                  value: p.challenge.title,
                  subtext: isOwnItem
                    ? `You finished the challenge.`
                    : `${userHandle} finished the challenge.`
                }
              });
            });
          }

          // C. Won Duels logic:
          const { data: friendDuels } = await supabase
            .from('duels')
            .select('*, challenger:users!challenger_id(username, name), opponent:users!opponent_id(username, name)')
            .in('status', ['COMPLETED', 'FORFEITED'])
            .in('winner_id', feedUserIds)
            .gte('end_date', sixteenDaysAgoStr);

          const duelFeedItemsByDate: Record<string, FeedItem[]> = {};
          if (friendDuels) {
            friendDuels.forEach(d => {
              if (!d.end_date) return;
              const completedDateStr = getLocalDateString(new Date(d.end_date));
              if (!shouldShowFeedItem(d.winner_id, completedDateStr)) return;

              if (!duelFeedItemsByDate[completedDateStr]) {
                duelFeedItemsByDate[completedDateStr] = [];
              }

              const isOwnItem = d.winner_id === currentUserId;
              const isChallengerWinner = d.winner_id === d.challenger_id;
              const winnerUsername = isChallengerWinner ? d.challenger?.username : d.opponent?.username;
              const opponentUsername = isChallengerWinner ? d.opponent?.username : d.challenger?.username;
              const winnerHandle = isOwnItem ? 'You' : `@${winnerUsername || 'Athlete'}`;
              const opponentHandle = `@${opponentUsername || 'Opponent'}`;
              const feedUserProfile = feedProfileMap.get(d.winner_id);

              duelFeedItemsByDate[completedDateStr].push({
                id: `duel-${d.id}`,
                userName: isOwnItem ? 'You' : (feedUserProfile?.name || 'Athlete'),
                avatarUrl: feedUserProfile?.avatar_url || null,
                type: 'perfect',
                time: 'Duel Win',
                title: isOwnItem ? `You won a duel! 🏆` : `${winnerHandle} won a duel! 🏆`,
                subtitle: isOwnItem
                  ? `You claimed victory in the "${d.type}" duel against ${opponentHandle}!`
                  : `${winnerHandle} claimed victory in the "${d.type}" duel against ${opponentHandle}!`,
                icon: 'medal-outline',
                color: '#FFD700',
                userId: d.winner_id,
                date: completedDateStr,
                shareDetails: {
                  cardType: 'perfect',
                  title: 'DUEL VICTORY',
                  value: d.type,
                  subtext: isOwnItem
                    ? `You defeated ${opponentHandle} in duel.`
                    : `${winnerHandle} defeated ${opponentHandle} in duel.`
                }
              });
            });
          }

          // Combine all items into a single list
          const allItems: FeedItem[] = [];
          Object.values(friendRankShiftFeedItemsByDate).forEach(list => allItems.push(...list));
          Object.values(challengeFeedItemsByDate).forEach(list => allItems.push(...list));
          Object.values(duelFeedItemsByDate).forEach(list => allItems.push(...list));

          // Sort items by date descending
          allItems.sort((a, b) => {
            if (!a.date || !b.date) return 0;
            return b.date.localeCompare(a.date);
          });

          items = allItems;
        }

        // Filter items to show at most 2 major activities per day per user
        const userDayCounts: Record<string, number> = {};
        const filteredItems = items.filter(item => {
          if (!item.userId || !item.date) return true;
          const key = `${item.userId}_${item.date}`;
          const count = userDayCounts[key] || 0;
          if (count < 2) {
            userDayCounts[key] = count + 1;
            return true;
          }
          return false;
        });

        // Set feed data
        setFeedData(filteredItems);

        // Fetch reactions for the visible feed items
        const allItemIds = filteredItems.map(item => item.id);
        if (allItemIds.length > 0) {
          try {
            const { data: dbReactions } = await supabase
              .from('feed_reactions')
              .select('*, user:users(username, name)')
              .in('feed_item_id', allItemIds);
            if (dbReactions) {
              setReactions(dbReactions);
            }
          } catch (reactErr) {
            console.log('Error fetching database reactions:', reactErr);
          }
        }
      }

      // 1. Fetch friendships of our friends to compute mutual friends
      const candidateMutuals: { [candidateId: string]: string[] } = {};
      if (friendIds.length > 0) {
        try {
          const [fship1, fship2] = await Promise.all([
            supabase.from('friendships').select('user_id, friend_id').eq('status', 'accepted').in('user_id', friendIds),
            supabase.from('friendships').select('user_id, friend_id').eq('status', 'accepted').in('friend_id', friendIds)
          ]);
          const mutualsData = [...(fship1.data || []), ...(fship2.data || [])];
          
          mutualsData.forEach(f => {
            const isUserFriend = friendIds.includes(f.user_id);
            const friendId = isUserFriend ? f.user_id : f.friend_id;
            const candidateId = isUserFriend ? f.friend_id : f.user_id;
            
            if (candidateId !== currentUserId && !friendIds.includes(candidateId)) {
              const friendProfile = friendProfiles.find(p => p.id === friendId);
              if (friendProfile && friendProfile.username) {
                if (!candidateMutuals[candidateId]) {
                  candidateMutuals[candidateId] = [];
                }
                if (!candidateMutuals[candidateId].includes(friendProfile.username)) {
                  candidateMutuals[candidateId].push(friendProfile.username);
                }
              }
            }
          });
        } catch (err) {
          console.log('Error fetching mutual friendships:', err);
        }
      }

      // Fetch suggested athletes (mutual connections only)
      const candidateIds = Object.keys(candidateMutuals);
      let sortedSuggestions: any[] = [];
      
      if (candidateIds.length > 0) {
        let suggestionsQuery = supabase
          .from('users')
          .select('id, name, username, avatar_url, level, xp, goal')
          .in('id', candidateIds);
          
        const excludeIds = [...friendIds, ...pendingInc, ...pendingOut];
        if (excludeIds.length > 0) {
          suggestionsQuery = suggestionsQuery.not('id', 'in', `(${excludeIds.map(id => `"${id}"`).join(',')})`);
        }
        
        const { data: suggestions } = await suggestionsQuery.limit(20);
        
        const { data: currentUserProfile } = await supabase
          .from('users')
          .select('goal')
          .eq('id', currentUserId)
          .single();
        const myGoal = currentUserProfile?.goal || 'maintain';

        if (suggestions && suggestions.length > 0) {
          sortedSuggestions = suggestions.map(athlete => {
            const mutualUsernames = candidateMutuals[athlete.id] || [];
            let mutualText = '';
            const mutualCount = mutualUsernames.length;
            
            if (mutualCount === 1) {
              mutualText = `Followed by @${mutualUsernames[0]}`;
            } else if (mutualCount > 1) {
              mutualText = `Followed by @${mutualUsernames[0]} + ${mutualCount - 1} others`;
            }
            
            return {
              ...athlete,
              mutualText,
              mutualCount
            };
          });

          // Sort: Mutual count first, then matching goal, then XP
          sortedSuggestions.sort((a, b) => {
            if (a.mutualCount !== b.mutualCount) {
              return b.mutualCount - a.mutualCount;
            }
            if (a.goal === myGoal && b.goal !== myGoal) return -1;
            if (a.goal !== myGoal && b.goal === myGoal) return 1;
            return (b.xp || 0) - (a.xp || 0);
          });
        }
      }
      setSuggestedAthletes(sortedSuggestions);

      // Fetch stats for active challenges
      const todayDateStr = getLocalDateString(new Date());
      const localTodayStart = new Date();
      localTodayStart.setHours(0,0,0,0);
      const localTodayEnd = new Date();
      localTodayEnd.setHours(23,59,59,999);
      
      const { data: userProf } = await supabase
        .from('users')
        .select('weight_kg, goal, water_ml, protein_goal_g')
        .eq('id', currentUserId)
        .maybeSingle();

      const weight = userProf?.weight_kg || 70;
      let proteinGoalVal = userProf?.protein_goal_g;
      if (!proteinGoalVal) {
        let proteinMultiplier = 1.6;
        if (userProf?.goal === 'build_muscle') {
          proteinMultiplier = 1.8;
        } else if (userProf?.goal === 'lose_fat') {
          proteinMultiplier = 2.0;
        }
        proteinGoalVal = Math.round(weight * proteinMultiplier);
      }
      const computedProteinGoal = proteinGoalVal;
      const computedWaterGoal = Math.round(weight * 35);
      
      setHydrationGoal(computedWaterGoal);
      setProteinGoal(computedProteinGoal);
      setHydrationProgress(userProf?.water_ml || 0);

      const { data: todayFoods } = await supabase
        .from('food_logs')
        .select('protein_g, roast_text, food_name')
        .eq('user_id', currentUserId)
        .gte('logged_at', localTodayStart.toISOString())
        .lte('logged_at', localTodayEnd.toISOString());
        
      const filteredTodayFoods = (todayFoods || []).filter(f => !f.food_name?.startsWith('__reward_lock:'));
      const totalProtein = filteredTodayFoods.reduce((sum, f) => {
        const orig = getOriginalMacros(f);
        return sum + (orig.protein_g || 0);
      }, 0) || 0;
      setProteinProgress(totalProtein);

      const { data: latestScore } = await supabase
        .from('health_scores')
        .select('activity_score, sleep_score')
        .eq('user_id', currentUserId)
        .eq('date', todayDateStr)
        .maybeSingle();

      const estimatedSteps = latestScore?.activity_score ? Math.round((latestScore.activity_score / 15) * 10000) : 6200;
      const estimatedSleep = latestScore?.sleep_score && latestScore.sleep_score > 0 ? Math.round((latestScore.sleep_score / 25) * 8 * 10) / 10 : 6.5;
      
      setStepsProgress(estimatedSteps);
      setSleepProgress(estimatedSleep);

    } catch (e) {
      console.log('Error loading social data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSocialData();
  }, [leaderboardScope, sandboxActive, simulatedDay, simulateOutOfBounds]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      console.log('Social tab focused, auto-refreshing...');
      loadSocialData();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (activeSubTab === 'leaderboard' && userRowY !== null) {
      const scrollKey = `${activeSubTab}_${leaderboardScope}_${userRowY}`;
      if (lastScrolledRef.current !== scrollKey) {
        lastScrolledRef.current = scrollKey;
        const timer = setTimeout(() => {
          mainScrollViewRef.current?.scrollTo({ y: Math.max(0, userRowY - 120), animated: true });
        }, 200);
        return () => clearTimeout(timer);
      }
    }
  }, [activeSubTab, leaderboardScope, userRowY]);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadSocialData();
    setRefreshing(false);
  };

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (text.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      // Strip leading @ if present
      const cleanText = text.trim().replace(/^@/, '');
      const { data } = await supabase
        .from('users')
        .select('id, name, username, avatar_url, level, xp')
        .ilike('username', `%${cleanText}%`)
        .neq('id', userId)
        .limit(10);
      setSearchResults(data || []);
    } catch (e) {
      console.log('Search error:', e);
    } finally {
      setSearchLoading(false);
    }
  };

  const sendRequest = async (targetId: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { error } = await supabase
        .from('friendships')
        .insert({
          user_id: userId,
          friend_id: targetId,
          status: 'pending'
        });
      if (error) throw error;
      Alert.alert('Sent', 'Friend request sent!');
      loadSocialData();
      setSearchQuery('');
      setSearchResults([]);
    } catch (e: any) {
      Alert.alert('Request Failed', e.message);
    }
  };

  const acceptRequest = async (senderId: string) => {
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('user_id', senderId)
        .eq('friend_id', userId);
      if (error) throw error;
      loadSocialData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const declineRequest = async (senderId: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('user_id', senderId)
        .eq('friend_id', userId);
      if (error) throw error;
      loadSocialData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const cancelRequest = async (targetId: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('user_id', userId)
        .eq('friend_id', targetId);
      if (error) throw error;
      loadSocialData();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const unfriendUser = async (targetId: string) => {
    try {
      Alert.alert(
        'Remove Friend?',
        'Are you sure you want to remove this friend?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes, Remove',
            style: 'destructive',
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const { error } = await supabase
                .from('friendships')
                .delete()
                .or(`and(user_id.eq.${userId},friend_id.eq.${targetId}),and(user_id.eq.${targetId},friend_id.eq.${userId})`);
              if (error) throw error;
              loadSocialData();
            }
          }
        ]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const getRelationshipButton = (targetUser: any) => {
    const isAccepted = friends.some(f => f.id === targetUser.id);
    if (isAccepted) {
      return (
        <TouchableOpacity style={styles.friendStatusBadge} onPress={() => unfriendUser(targetUser.id)}>
          <Text style={styles.friendStatusText}>Friends ✕</Text>
        </TouchableOpacity>
      );
    }

    const isPendingIn = pendingIncoming.some(p => p.id === targetUser.id);
    if (isPendingIn) {
      return (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={styles.acceptBtnMini} onPress={() => acceptRequest(targetUser.id)}>
            <Text style={styles.acceptBtnMiniText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.acceptBtnMini, { backgroundColor: '#333' }]} onPress={() => declineRequest(targetUser.id)}>
            <Text style={[styles.acceptBtnMiniText, { color: '#EF4444' }]}>Reject</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const isPendingOut = pendingOutgoing.some(p => p.id === targetUser.id);
    if (isPendingOut) {
      return (
        <TouchableOpacity style={styles.pendingStatusBadge} onPress={() => cancelRequest(targetUser.id)}>
          <Text style={styles.pendingStatusText}>Requested ✕</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity style={styles.addBtnMini} onPress={() => sendRequest(targetUser.id)}>
        <Ionicons name="person-add-outline" size={14} color="#000000" />
        <Text style={styles.addBtnMiniText}>Add</Text>
      </TouchableOpacity>
    );
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
        <Text style={styles.headerTitle}>Pulse</Text>
      </View>

      {/* Sub Tabs Selection */}
      <View style={styles.subTabContainer}>
        <TouchableOpacity 
          style={[styles.subTabButton, activeSubTab === 'feed' && styles.subTabActiveButton]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveSubTab('feed');
          }}
        >
          <Text style={[styles.subTabText, activeSubTab === 'feed' && styles.subTabActiveText]}>Activity Feed</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.subTabButton, activeSubTab === 'leaderboard' && styles.subTabActiveButton]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveSubTab('leaderboard');
          }}
        >
          <Text style={[styles.subTabText, activeSubTab === 'leaderboard' && styles.subTabActiveText]}>Leaderboard</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.subTabButton, activeSubTab === 'friends' && styles.subTabActiveButton]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveSubTab('friends');
          }}
        >
          <Text style={[styles.subTabText, activeSubTab === 'friends' && styles.subTabActiveText]}>Friends</Text>
        </TouchableOpacity>

      </View>

      <ScrollView
        ref={mainScrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* TAB 1: ACTIVITY FEED */}
        {activeSubTab === 'feed' && (
          <View>
            {/* User's Public Profile Shortcut Card */}
            <TouchableOpacity 
              onPress={() => router.push(`/userProfile?id=${userId}`)}
              activeOpacity={0.85}
              style={{ marginBottom: 16 }}
            >
              <LinearGradient
                colors={['rgba(28, 22, 49, 0.85)', 'rgba(11, 11, 15, 0.95)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.profileShortcutCard}
              >
                <View style={styles.profileShortcutRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, flex: 1 }}>
                    <View style={styles.profileShortcutAvatarContainer}>
                      {avatarUri ? (
                        <Image source={{ uri: avatarUri }} style={styles.profileShortcutAvatar} />
                      ) : (
                        <View style={styles.profileShortcutAvatarPlaceholder}>
                          <Ionicons name="person" size={24} color="#FFF" />
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Text style={styles.profileShortcutTitle}>{profileName || 'Your Profile'}</Text>
                        <View style={styles.levelBadge}>
                          <Text style={styles.levelBadgeText}>Lv. {userLevel}</Text>
                        </View>
                      </View>
                      <Text style={styles.profileShortcutSub} numberOfLines={1}>
                        @{currentUsername || 'athlete'} • {userXp} XP
                      </Text>
                      <Text style={styles.profileShortcutActionText}>
                        View Public Profile & Stats ↗
                      </Text>
                    </View>
                  </View>
                  <View style={styles.profileChevronGlow}>
                    <Ionicons name="chevron-forward" size={18} color="#A78BFA" />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            {/* Dev Sandbox & Toggle Deck */}
            {isAdmin && (
              <View style={[styles.sandboxCard, { marginBottom: 16 }]}>
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
                      <Text style={styles.sandboxLabel}>Sandbox Mode</Text>
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

                    <View style={[styles.sandboxRow, { marginTop: 10 }]}>
                      <Text style={styles.sandboxLabel}>Simulate Out-of-Bounds Rank (#80)</Text>
                      <TouchableOpacity
                        style={[styles.toggleBtn, simulateOutOfBounds ? styles.toggleBtnActive : {}]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSimulateOutOfBounds(!simulateOutOfBounds);
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.toggleBtnText}>{simulateOutOfBounds ? 'ON' : 'OFF'}</Text>
                      </TouchableOpacity>
                    </View>

                    {sandboxActive && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={styles.sandboxSubLabel}>Select Simulated Timeline Stage:</Text>
                        <View style={styles.demoButtonsGrid}>
                          {(['day1', 'day2', 'day3'] as const).map((d) => (
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
                                {d === 'day1' ? 'DAY 1' : 
                                 d === 'day2' ? 'DAY 2' : 'DAY 3'}
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

            {feedData.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.15)" />
                <Text style={styles.emptyText}>Feed is quiet.</Text>
                <Text style={styles.emptySubtext}>When you or your friends hit perfect days, surges, or streaks, they will appear here.</Text>
              </View>
            ) : (
              feedData.map(item => {
                const isOwnCard = item.userId === userId || item.userId === 'logged-in-user';
                return (
                  <View 
                    key={item.id} 
                    style={styles.feedCard}
                  >
                    <View style={styles.feedCardHeader}>
                      <TouchableOpacity 
                        style={styles.feedUserRow}
                        onPress={() => {
                          const feedUserId = item.userId === 'logged-in-user' ? currentUserId : item.userId;
                          if (feedUserId) {
                            router.push(`/userProfile?id=${feedUserId}`);
                          }
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={styles.avatarMini}>
                          {item.avatarUrl ? (
                            <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                          ) : (
                            <Text style={styles.avatarLetter}>{item.userName.charAt(0).toUpperCase()}</Text>
                          )}
                        </View>
                        <View>
                          <Text style={styles.feedUserName}>{item.userName}</Text>
                          <Text style={styles.feedTimeLabel}>{item.time}</Text>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.badgeIconBg}>
                        <Ionicons name={item.icon} size={18} color={item.color} />
                      </View>
                    </View>
                    <Text style={styles.feedTitle}>{item.title}</Text>
                    <Text style={styles.feedSubtitle}>{item.subtitle}</Text>
                    {item.shareDetails && isOwnCard && (
                      <TouchableOpacity 
                        style={styles.tapToShareContainer}
                        onPress={() => openShareCard(item)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="share-social-outline" size={12} color={colors.accent} />
                        <Text style={styles.tapToShareText}>Tap to share achievement card</Text>
                      </TouchableOpacity>
                    )}

                    {/* LinkedIn style reactions row */}
                    {(() => {
                      const itemReactions = (sandboxActive ? mockReactions : reactions).filter(r => r.feed_item_id === item.id);
                      
                      // Group by emoji
                      const grouped: { [emoji: string]: { count: number; active: boolean } } = {};
                      itemReactions.forEach(r => {
                        const emoji = r.emoji;
                        const isSelf = r.user_id === (sandboxActive ? 'logged-in-user' : userId);
                        if (!grouped[emoji]) {
                          grouped[emoji] = { count: 0, active: false };
                        }
                        grouped[emoji].count++;
                        if (isSelf) {
                          grouped[emoji].active = true;
                        }
                      });

                      return (
                        <View style={styles.reactionsRow}>
                          {Object.entries(grouped).map(([emoji, data]) => (
                            <TouchableOpacity
                              key={emoji}
                              style={[
                                styles.reactionPill,
                                data.active && styles.reactionPillActive
                              ]}
                              onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                // Open "Who Reacted" modal
                                const list = itemReactions
                                  .filter(r => r.emoji === emoji)
                                  .map(r => ({
                                    name: r.user?.name || 'Athlete',
                                    username: r.user?.username || 'athlete'
                                  }));
                                setWhoReactedList(list);
                                setWhoReactedEmoji(emoji);
                                setWhoReactedModalVisible(true);
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.reactionEmojiText}>{emoji}</Text>
                              <Text style={[
                                styles.reactionCountText,
                                data.active && styles.reactionCountTextActive
                              ]}>
                                {data.count}
                              </Text>
                            </TouchableOpacity>
                          ))}

                          <TouchableOpacity
                            style={styles.addReactionBtn}
                            onPress={() => {
                              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              setActiveEmojiPickerItemId(activeEmojiPickerItemId === item.id ? null : item.id);
                            }}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="happy-outline" size={16} color="rgba(255,255,255,0.4)" />
                          </TouchableOpacity>

                          {activeEmojiPickerItemId === item.id && (
                            <View style={styles.inlineEmojiPicker}>
                              {['🔥', '👏', '🏆', '❤️', '🙌'].map(emoji => (
                                <TouchableOpacity
                                  key={emoji}
                                  style={styles.emojiPickerOption}
                                  onPress={() => {
                                    handleToggleReaction(item.id, emoji);
                                    setActiveEmojiPickerItemId(null);
                                  }}
                                  activeOpacity={0.7}
                                >
                                  <Text style={styles.emojiPickerText}>{emoji}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* TAB 2: LEADERBOARD */}
        {activeSubTab === 'leaderboard' && (
          <View>
            {/* Scope selectors */}
            <View style={styles.scopeContainer}>
              <TouchableOpacity
                style={[styles.scopeBtn, leaderboardScope === 'global' && styles.scopeActiveBtn]}
                onPress={() => setLeaderboardScope('global')}
              >
                <Text style={[styles.scopeText, leaderboardScope === 'global' && styles.scopeActiveText]}>GLOBAL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.scopeBtn, leaderboardScope === 'friends' && styles.scopeActiveBtn]}
                onPress={() => setLeaderboardScope('friends')}
              >
                <Text style={[styles.scopeText, leaderboardScope === 'friends' && styles.scopeActiveText]}>FRIENDS</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.leaderboardList}>
              {leaderboardData.map((item, index) => {
                if (item.isSeparator) {
                  return (
                    <View key="leaderboard-separator" style={styles.leaderboardSeparator}>
                      <View style={styles.separatorLine} />
                      <Text style={styles.separatorText}>•••</Text>
                      <View style={styles.separatorLine} />
                    </View>
                  );
                }
                const rawName = (item.name && item.name.trim()) ? item.name : (item.username || 'Anonymous');
                const cleanedName = stripEmojis(rawName) || 'Anonymous';
                const isSelf = item.id === userId;
                const displayRank = item.rank || 1;

                return (
                  <TouchableOpacity 
                    key={item.isBottomCard ? `${item.id}-bottom` : item.id} 
                    onLayout={(event) => {
                      if (isSelf) {
                        setUserRowY(event.nativeEvent.layout.y);
                      }
                    }}
                    style={[styles.leaderboardRow, isSelf && styles.leaderboardSelfRow]}
                    onPress={() => router.push(`/userProfile?id=${item.id}`)}
                  >
                    <View style={styles.rankContainer}>
                      <Text style={[styles.rankText, displayRank === 1 && styles.rankGold, displayRank === 2 && styles.rankSilver, displayRank === 3 && styles.rankBronze]}>
                        #{displayRank}
                      </Text>
                    </View>
                    <View style={styles.avatarMini}>
                      {item.avatar_url ? (
                        <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
                      ) : (
                        <Text style={styles.avatarLetter}>{cleanedName.charAt(0).toUpperCase()}</Text>
                      )}
                    </View>
                    <Text style={[styles.leaderboardName, isSelf && styles.leaderboardSelfName]} numberOfLines={1}>
                      {cleanedName}
                    </Text>
                    <View style={styles.leaderboardRightStats}>
                      <Text style={styles.leaderboardLevel}>Lv.{item.level || 1}</Text>
                      <Text style={styles.leaderboardXp}>{item.xp || 0} XP</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* TAB 3: FRIENDS MANAGEMENT */}
        {activeSubTab === 'friends' && (
          <View>
            {/* Friend Search Bar */}
            <Text style={styles.sectionTitle}>FIND FRIENDS</Text>
            <View style={styles.searchContainer}>
              <Ionicons name="search-outline" size={18} color="rgba(255,255,255,0.4)" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by @username..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={searchQuery}
                onChangeText={handleSearch}
                autoCapitalize="none"
              />
            </View>
            <Text style={styles.searchHelperText}>Usernames are unique and easier to find.</Text>

            {/* Search Results */}
            {searchQuery.trim().length >= 2 && (
              <View style={styles.searchResultsContainer}>
                {searchLoading ? (
                  <ActivityIndicator size="small" color={colors.accent} style={{ padding: 12 }} />
                ) : searchResults.length === 0 ? (
                  <Text style={styles.noResultsText}>No users found matching "{searchQuery}"</Text>
                ) : (
                  searchResults.map(user => {
                    const cleanedName = stripEmojis(user.name || 'Anonymous');
                    return (
                      <View key={user.id} style={styles.searchResultRow}>
                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                          onPress={() => router.push(`/userProfile?id=${user.id}`)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.avatarMini}>
                            {user.avatar_url ? (
                              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
                            ) : (
                              <Text style={styles.avatarLetter}>{cleanedName.charAt(0).toUpperCase()}</Text>
                            )}
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.searchResultName}>{cleanedName}</Text>
                            <Text style={styles.searchResultUsername}>@{user.username || 'username'}</Text>
                            <Text style={styles.searchResultMeta}>Level {user.level || 1} • {user.xp || 0} XP</Text>
                          </View>
                        </TouchableOpacity>
                        {getRelationshipButton(user)}
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {/* Pending Friend Requests */}
            {pendingIncoming.length > 0 && (
              <View style={styles.pendingSection}>
                <Text style={styles.sectionTitle}>FRIEND REQUESTS ({pendingIncoming.length})</Text>
                {pendingIncoming.map(requestUser => {
                  const cleanedName = stripEmojis(requestUser.name || 'Anonymous');
                  return (
                    <View key={requestUser.id} style={styles.requestRow}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                        onPress={() => router.push(`/userProfile?id=${requestUser.id}`)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.avatarMini}>
                          {requestUser.avatar_url ? (
                            <Image source={{ uri: requestUser.avatar_url }} style={styles.avatarImage} />
                          ) : (
                            <Text style={styles.avatarLetter}>{cleanedName.charAt(0).toUpperCase()}</Text>
                          )}
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text style={styles.requestName}>{cleanedName}</Text>
                          <Text style={styles.requestMeta}>Lv.{requestUser.level || 1} • {requestUser.xp || 0} XP</Text>
                        </View>
                      </TouchableOpacity>
                      <View style={styles.requestActions}>
                        <TouchableOpacity style={styles.acceptBtn} onPress={() => acceptRequest(requestUser.id)}>
                          <Text style={styles.acceptBtnText}>Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.declineBtn} onPress={() => declineRequest(requestUser.id)}>
                          <Ionicons name="close-outline" size={20} color="rgba(255,255,255,0.6)" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Current Friends List */}
            <Text style={[styles.sectionTitle, { marginTop: 28 }]}>MY FRIENDS ({friends.length})</Text>
            {friends.length === 0 ? (
              <View style={styles.emptyFriendsContainer}>
                <Text style={styles.emptyFriendsText}>You haven't added any friends yet.</Text>
                <Text style={styles.emptyFriendsSubtext}>Use the search bar above to find and add friends.</Text>
              </View>
            ) : (
              friends.map(friend => {
                const cleanedName = stripEmojis(friend.name || 'Anonymous');
                return (
                  <TouchableOpacity 
                    key={friend.id} 
                    style={styles.friendRow}
                    onPress={() => router.push(`/userProfile?id=${friend.id}`)}
                  >
                    <View style={styles.avatarMini}>
                      {friend.avatar_url ? (
                        <Image source={{ uri: friend.avatar_url }} style={styles.avatarImage} />
                      ) : (
                        <Text style={styles.avatarLetter}>{cleanedName.charAt(0).toUpperCase()}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.friendName}>{cleanedName}</Text>
                      <Text style={styles.friendMeta}>Level {friend.level || 1} • {friend.xp || 0} XP</Text>
                    </View>
                    <Ionicons name="chevron-forward-outline" size={16} color="rgba(255,255,255,0.25)" />
                  </TouchableOpacity>
                );
              })
            )}

            {/* Suggested Athletes */}
            {searchQuery.trim().length === 0 && suggestedAthletes.length > 0 && (
              <View style={{ marginTop: 32 }}>
                <Text style={styles.sectionTitle}>RECOMMENDED FOR YOU</Text>
                <Text style={styles.suggestedSubtext}>Suggested mutual connections</Text>
                <View style={styles.suggestedContainer}>
                  {suggestedAthletes.map(athlete => {
                    const cleanedName = stripEmojis(athlete.name || 'Anonymous');
                    return (
                      <View key={athlete.id} style={styles.suggestedRow}>
                        <TouchableOpacity 
                          style={styles.suggestedProfileInfo} 
                          onPress={() => router.push(`/userProfile?id=${athlete.id}`)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.avatarMini}>
                            {athlete.avatar_url ? (
                              <Image source={{ uri: athlete.avatar_url }} style={styles.avatarImage} />
                            ) : (
                              <Text style={styles.avatarLetter}>{cleanedName.charAt(0).toUpperCase()}</Text>
                            )}
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.suggestedName}>{cleanedName}</Text>
                            <Text style={styles.suggestedMeta}>
                              Lv.{athlete.level || 1} • {athlete.goal ? athlete.goal.replace('_', ' ') : 'maintain'}
                            </Text>
                            <Text style={styles.suggestedMutualText}>{athlete.mutualText}</Text>
                          </View>
                        </TouchableOpacity>
                        {getRelationshipButton(athlete)}
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
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
                  colors={['#161326', '#09080E']}
                  style={[styles.shareCard, { width: 340, height: 605, borderWidth: 0, margin: 0 }]}
                >
                  {/* Decorative glowing blob */}
                  <View style={styles.shareCardGlowBlob} />
                  
                  {/* Topographic Lines Svg */}
                  <View style={StyleSheet.absoluteFill}>
                    <Svg height="100%" width="100%">
                      <Path d="M-50,220 C80,160 180,290 390,210" fill="none" stroke="rgba(167, 139, 250, 0.03)" strokeWidth={2} />
                      <Path d="M-50,250 C80,190 180,320 390,240" fill="none" stroke="rgba(167, 139, 250, 0.015)" strokeWidth={1.5} />
                      <Path d="M-50,280 C80,220 180,350 390,270" fill="none" stroke="rgba(255, 255, 255, 0.01)" strokeWidth={1} />
                      <Path d="M-50,310 C80,250 180,380 390,300" fill="none" stroke="rgba(255, 255, 255, 0.008)" strokeWidth={1} />
                      <Path d="M-50,340 C80,280 180,410 390,330" fill="none" stroke="rgba(167, 139, 250, 0.02)" strokeWidth={1.5} />
                    </Svg>
                  </View>

                  <View style={{ alignItems: 'center', marginTop: 8 }}>
                    <Image 
                      source={require('../../assets/images/logo-egg.png')} 
                      style={styles.shareCardLogo} 
                    />
                    <Text style={styles.shareCardBranding}>FITAPP</Text>
                  </View>
                  
                  <View style={styles.shareCardContent}>
                    {shareCardData.cardType === 'perfect' && (
                      <View style={styles.centerAlign}>
                        <View style={styles.iconGlowFrame}>
                          <Ionicons name="checkmark-circle" size={56} color={colors.accent} />
                        </View>
                        <Text style={styles.shareCardTitle}>{shareCardData.title}</Text>
                        <Text style={styles.shareCardValue}>{shareCardData.value}</Text>
                        <Text style={styles.shareCardSubtext}>{shareCardData.subtext.replace(/\s(\S+)$/, '\u00A0$1')}</Text>
                        
                        {shareCardData.checklist && (
                          <View style={styles.shareChecklist}>
                            {shareCardData.checklist.map((c: any, i: number) => (
                              <View key={i} style={styles.shareChecklistItem}>
                                <Ionicons 
                                  name={c.checked ? "checkmark-circle" : "ellipse-outline"} 
                                  size={16} 
                                  color={c.checked ? colors.accent : "rgba(255,255,255,0.2)"} 
                                />
                                <Text style={[styles.shareChecklistLabel, !c.checked && styles.shareChecklistLabelUnchecked]}>
                                  {c.label}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
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

                  <Text style={styles.shareCardFooter}>BUILD MOMENTUM. LIVE HEALTHIER.</Text>
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

      {/* Spotify-Wrapped Style Weekly Recap Modal Overlay */}
      <Modal
        visible={recapModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setRecapModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackgroundDismiss} 
            activeOpacity={1} 
            onPress={() => setRecapModalVisible(false)}
          />
          
          <View style={styles.recapContainer}>
            {weeklyRecapData && (
              <ViewShot ref={weeklyRecapRef} options={{ format: 'png', quality: 0.95 }} style={{ width: 340, height: 605 }}>
                <LinearGradient
                  colors={['#1F163D', '#0B081A', '#04030A']}
                  style={[styles.recapCard, { width: 340, height: 605, borderWidth: 0, margin: 0 }]}
                >
                  {/* Decorative glowing blob */}
                  <View style={styles.recapCardGlowBlob} />
                  
                  {/* Technical Coordinate Grid Overlay */}
                  <View style={StyleSheet.absoluteFill}>
                    <Svg height="100%" width="100%">
                      <Path d="M0,80 L340,80 M0,200 L340,200 M0,320 L340,320 M0,440 L340,440" stroke="rgba(167, 139, 250, 0.025)" strokeWidth={1} />
                      <Path d="M85,0 L85,605 M170,0 L170,605 M255,0 L255,605" stroke="rgba(167, 139, 250, 0.025)" strokeWidth={1} />
                    </Svg>
                  </View>

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
                  
                  <Text style={styles.recapTitle}>{weeklyRecapData.name}'s Week in Review</Text>
                  
                  <View style={styles.recapGrid}>
                    <View style={styles.recapGridItem}>
                      <Text style={styles.recapLabel}>HEALTH SCORE</Text>
                      <Text style={styles.recapVal}>{weeklyRecapData.oldScore} → {weeklyRecapData.newScore}</Text>
                      <Text style={styles.recapSubVal}>⚡ Score surge</Text>
                    </View>
                    
                    <View style={styles.recapGridItem}>
                      <Text style={styles.recapLabel}>FUTURE SCORE</Text>
                      <Text style={styles.recapVal}>{weeklyRecapData.oldFutureScore} → {weeklyRecapData.newFutureScore}</Text>
                      <Text style={styles.recapSubVal}>📈 Score projected</Text>
                    </View>
                    
                    <View style={styles.recapGridItem}>
                      <Text style={styles.recapLabel}>BEST HABIT</Text>
                      <Text style={styles.recapVal}>{weeklyRecapData.bestHabit}</Text>
                      <Text style={styles.recapSubVal}>🎯 Most consistent</Text>
                    </View>

                    <View style={styles.recapGridItem}>
                      <Text style={styles.recapLabel}>XP EARNED</Text>
                      <Text style={styles.recapVal}>{weeklyRecapData.xpEarned} XP</Text>
                      <Text style={styles.recapSubVal}>⭐ Unlocked progress</Text>
                    </View>

                    <View style={styles.recapGridItem}>
                      <Text style={styles.recapLabel}>LEADERBOARD</Text>
                      <Text style={styles.recapVal}>#{weeklyRecapData.oldRank} → #{weeklyRecapData.newRank}</Text>
                      <Text style={styles.recapSubVal}>↑ Surpassed friends</Text>
                    </View>

                    <View style={styles.recapGridItem}>
                      <Text style={styles.recapLabel}>STREAK</Text>
                      <Text style={styles.recapVal}>{weeklyRecapData.streak} Days</Text>
                      <Text style={styles.recapSubVal}>🔥 Logging beast</Text>
                    </View>
                  </View>

                  <View style={{ width: '100%', alignItems: 'center', marginVertical: 8 }}>
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
                        🏆 BIGGEST WIN: {weeklyRecapData.biggestWin.toUpperCase()}
                      </Text>
                    </LinearGradient>
                  </View>

                  <Text style={styles.recapFooter}>COMPETE WITH FRIENDS. SURPASS YOURSELF.</Text>
                </LinearGradient>
              </ViewShot>
            )}

            <View style={styles.shareActionsRow}>
              <TouchableOpacity 
                style={styles.shareConfirmBtn} 
                onPress={handleShareWeeklyRecap}
              >
                <Ionicons name="sparkles" size={16} color="#000000" style={{ marginRight: 6 }} />
                <Text style={styles.shareConfirmBtnText}>Create Share Card</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareCloseBtn} onPress={() => setRecapModalVisible(false)}>
                <Text style={styles.shareCloseBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Spotify-Wrapped Style Share Card Overlay removed. Native share is opened directly. */}
      {/* Who Reacted Modal */}
      <Modal
        visible={whoReactedModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setWhoReactedModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity 
            style={styles.modalBackgroundDismiss} 
            activeOpacity={1} 
            onPress={() => setWhoReactedModalVisible(false)}
          />
          <View style={styles.whoReactedContainer}>
            <View style={styles.whoReactedHeader}>
              <Text style={styles.whoReactedTitle}>Reactions ({whoReactedEmoji})</Text>
              <TouchableOpacity onPress={() => setWhoReactedModalVisible(false)}>
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.whoReactedScroll}>
              {whoReactedList.length === 0 ? (
                <Text style={styles.noReactorsText}>No reactions found.</Text>
              ) : (
                whoReactedList.map((reactor, idx) => (
                  <View key={idx} style={styles.reactorRow}>
                    <View style={styles.reactorAvatarCircle}>
                      <Ionicons name="person-outline" size={16} color={colors.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reactorName}>{reactor.name}</Text>
                      <Text style={styles.reactorUsername}>@{reactor.username}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
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
  subTabContainer: {
    flexDirection: 'row',
    backgroundColor: '#0B0B0F',
    borderRadius: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 2,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  subTabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  subTabActiveButton: {
    backgroundColor: '#111117',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  subTabText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 13,
    fontWeight: 'bold',
  },
  subTabActiveText: {
    color: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  // Tab 1: Feed
  feedCard: {
    backgroundColor: '#111117',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 14,
  },
  feedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  feedUserName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  feedTimeLabel: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 11,
    marginTop: 1,
  },
  badgeIconBg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  feedTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  feedSubtitle: {
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

  // Tab 2: Leaderboard
  scopeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  scopeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#0B0B0F',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  scopeActiveBtn: {
    backgroundColor: '#111117',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  scopeText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  scopeActiveText: {
    color: '#FFFFFF',
  },
  leaderboardList: {
    backgroundColor: '#111117',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 8,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  leaderboardSelfRow: {
    backgroundColor: 'rgba(167, 139, 250, 0.04)',
  },
  rankText: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: 'bold',
    fontSize: 14,
    width: 32,
  },
  rankGold: { color: '#F59E0B' },
  rankSilver: { color: '#9CA3AF' },
  rankBronze: { color: '#D97706' },
  leaderboardName: {
    color: '#FFFFFF',
    fontSize: 14,
    flex: 1,
    marginLeft: 12,
  },
  leaderboardSelfName: {
    fontWeight: 'bold',
  },
  leaderboardRightStats: {
    alignItems: 'flex-end',
  },
  leaderboardLevel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  leaderboardXp: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    marginTop: 2,
  },

  // Tab 3: Friends
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    letterSpacing: 1.5,
    marginBottom: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111117',
    borderRadius: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    color: '#FFFFFF',
    fontSize: 14,
  },
  searchResultsContainer: {
    backgroundColor: '#111117',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 8,
    marginBottom: 20,
  },
  searchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  searchResultName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchResultMeta: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    marginTop: 2,
  },
  noResultsText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 13,
    textAlign: 'center',
    padding: 16,
  },
  pendingSection: {
    marginBottom: 20,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111117',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 10,
  },
  requestName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  requestMeta: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  acceptBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  acceptBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  declineBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111117',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 10,
  },
  friendName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  friendMeta: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    marginTop: 2,
  },

  // Buttons Mini inside search results
  addBtnMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  addBtnMiniText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  acceptBtnMini: {
    backgroundColor: colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  acceptBtnMiniText: {
    color: '#000000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  pendingStatusBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  pendingStatusText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    fontWeight: 'bold',
  },
  friendStatusBadge: {
    backgroundColor: 'rgba(167, 139, 250, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  friendStatusText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: 'bold',
  },

  // Avatars
  avatarMini: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0B0B0F',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },

  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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
  emptyFriendsContainer: {
    backgroundColor: '#111117',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  emptyFriendsText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  emptyFriendsSubtext: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
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
  
  profileShortcutCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.25)',
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  profileShortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileShortcutAvatarContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#1E1E28',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#A78BFA',
  },
  profileShortcutAvatar: {
    width: '100%',
    height: '100%',
  },
  profileShortcutAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileShortcutTitle: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  levelBadge: {
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    borderColor: 'rgba(167, 139, 250, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  levelBadgeText: {
    color: '#C084FC',
    fontSize: 10,
    fontWeight: 'bold',
  },
  profileShortcutSub: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12.5,
    marginTop: 4,
    fontWeight: '500',
  },
  profileShortcutActionText: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  profileChevronGlow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },
  
  // Weekly Recap Banner
  weeklyRecapBanner: {
    backgroundColor: '#0B0B0F',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: '#A78BFA',
    marginBottom: 16,
    shadowColor: '#A78BFA',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  recapBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  recapBannerHeaderTitle: {
    color: '#A78BFA',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  recapBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recapBannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  recapBannerSub: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    lineHeight: 16,
  },

  // Leaderboard Movement & Rank styles
  rankContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    gap: 2,
  },
  
  // Search helper text
  searchHelperText: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 12,
    marginTop: -8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  searchResultUsername: {
    color: colors.accent,
    fontSize: 12,
    marginTop: 1,
    marginBottom: 2,
  },

  // Weekly Recap Modal card styling
  recapContainer: {
    width: 340,
    alignItems: 'center',
    zIndex: 10,
  },
  recapCard: {
    width: '100%',
    height: 605,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: '#A78BFA',
    padding: 24,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 10,
    overflow: 'hidden',
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
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
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
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
  },
  recapLabel: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  recapVal: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
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
  recapFooter: {
    color: 'rgba(255, 255, 255, 0.25)',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    textAlign: 'center',
    marginTop: 8,
  },
  shareCardWrappedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  shareCardWrappedLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  shareCardWrappedVal: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  suggestedSubtext: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  suggestedContainer: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  suggestedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.03)',
  },
  suggestedProfileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  suggestedName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  suggestedMeta: {
    color: colors.accent,
    fontSize: 11,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  suggestedMutualText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
    marginTop: 2,
  },
  suggestedAddBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  suggestedAddBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
  },
  challengesContainer: {
    paddingHorizontal: 4,
    gap: 16,
    paddingBottom: 20,
  },
  challengeCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  challengeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  challengeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  challengeIcon: {
    fontSize: 24,
  },
  challengeTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  challengeReward: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: 1,
  },
  statusTag: {
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  statusActive: {
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
  },
  statusActiveText: {
    color: '#A78BFA',
    fontSize: 9,
    fontWeight: 'bold',
  },
  statusSuccess: {
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 230, 118, 0.3)',
  },
  statusSuccessText: {
    color: '#00E676',
    fontSize: 9,
    fontWeight: 'bold',
  },
  challengeGoalText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    marginBottom: 8,
  },
  progressContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  challengeTimeLeft: {
    color: 'rgba(255, 255, 255, 0.35)',
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'right',
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
    marginBottom: 8,
  },
  demoButtonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  demoSelectBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.02)',
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
  // Reactions styles
  reactionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    paddingTop: 10,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E2A',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  reactionPillActive: {
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    borderColor: '#A78BFA',
  },
  reactionEmojiText: {
    fontSize: 13,
  },
  reactionCountText: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 12,
    fontWeight: 'bold',
  },
  reactionCountTextActive: {
    color: '#A78BFA',
  },
  addReactionBtn: {
    padding: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inlineEmojiPicker: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    backgroundColor: '#1E1E2A',
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 10,
  },
  emojiPickerOption: {
    padding: 2,
  },
  emojiPickerText: {
    fontSize: 22,
  },
  whoReactedContainer: {
    width: 320,
    maxHeight: 400,
    backgroundColor: '#111117',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    zIndex: 15,
  },
  whoReactedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    paddingBottom: 12,
    marginBottom: 12,
  },
  whoReactedTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  whoReactedScroll: {
    flexGrow: 0,
  },
  noReactorsText: {
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginVertical: 20,
    fontSize: 13,
  },
  reactorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.02)',
  },
  reactorAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reactorName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  reactorUsername: {
    color: 'rgba(255, 255, 255, 0.45)',
    fontSize: 11,
  },
  leaderboardSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
    paddingHorizontal: 20,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  separatorText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 14,
    marginHorizontal: 12,
    fontWeight: 'bold',
    letterSpacing: 2,
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
  recapCardGlowBlob: {
    position: 'absolute',
    bottom: '20%',
    right: '10%',
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(167, 139, 250, 0.04)',
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
});
