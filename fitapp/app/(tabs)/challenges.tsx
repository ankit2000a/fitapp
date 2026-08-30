import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Modal, ActivityIndicator, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { useNavigation } from 'expo-router';

// Interfaces for UI Data Models
interface UserProfile {
  id: string;
  name: string;
  username: string;
  level: number;
  goal: string;
  xp?: number;
}

interface Duel {
  id: string;
  challenger_id: string;
  opponent_id: string;
  type: string;
  start_date: string;
  end_date: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'FORFEITED';
  winner_id: string | null;
  challenger_progress: number;
  opponent_progress: number;
  challenger?: { username: string } | null;
  opponent?: { username: string } | null;
}

interface ChallengeV2 {
  id: string;
  type: 'weekly' | 'monthly';
  template_key: string;
  title: string;
  description: string;
  metric: string;
  target_value: number;
  xp_reward: number;
  start_date: string;
  end_date: string;
  status: 'ACTIVE' | 'DISABLED' | 'ARCHIVED' | 'COMPLETED';
}

interface ParticipationV2 {
  id: string;
  challenge_id: string;
  user_id: string;
  status: 'ACTIVE' | 'COMPLETED' | 'LEFT' | 'EXPIRED' | 'INELIGIBLE' | 'INELIGIBLE_COMPLETED' | 'INELIGIBLE_EXPIRED';
  progress_value: number;
  completed_at: string | null;
  challenge?: ChallengeV2;
}

interface LeaderboardEntry {
  username: string;
  completed_at: string;
}

interface AdminAnalytics {
  totalParticipants: number;
  completions: number;
  abandonedCount: number;
  practiceCount: number;
  activeWeeklyCount: number;
  activeMonthlyCount: number;
  completionRate: number;
  recentCompletions: Array<{
    username: string;
    title: string;
    type: string;
  }>;
}

const METRICS = [
  { key: 'health_score', name: 'Health Score Duel', desc: 'Highest average Health Score wins 📈' },
  { key: 'perfect_day', name: 'Perfect Day Clash', desc: 'Most Perfect Days wins 💯' },
  { key: 'protein', name: 'Protein Battle', desc: 'Most Protein Goal Days wins 🍗' },
  { key: 'missions', name: 'Mission Race', desc: 'Most Daily Missions completed wins 🎯' },
  { key: 'streak', name: 'Consistency Duel', desc: 'Longest consistency streak 🔥' },
  { key: 'calories', name: 'Fat Loss Duel', desc: 'Highest calorie adherence wins 🥗' },
  { key: 'steps', name: 'Step Clash', desc: 'Highest step count wins 👟' },
  { key: 'active_calories', name: 'Calorie Burn Duel', desc: 'Highest active calorie burn wins 🔥' }
];

const DURATIONS = [
  { days: 1, label: '1 Day' },
  { days: 3, label: '3 Days' },
  { days: 7, label: '7 Days' }
];

export default function ChallengesScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'admin'>('active');
  const [isAdmin, setIsAdmin] = useState(false);

  // User & Data States
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [duels, setDuels] = useState<Duel[]>([]);
  const [weeklyParticipations, setWeeklyParticipations] = useState<ParticipationV2[]>([]);
  const [monthlyParticipations, setMonthlyParticipations] = useState<ParticipationV2[]>([]);
  const [weeklyParticipation, setWeeklyParticipation] = useState<ParticipationV2 | null>(null);
  const [monthlyParticipation, setMonthlyParticipation] = useState<ParticipationV2 | null>(null);

  // Expandable Leaderboards States
  const [weeklyLeaderboardVisible, setWeeklyLeaderboardVisible] = useState(false);
  const [monthlyLeaderboardVisible, setMonthlyLeaderboardVisible] = useState(false);
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Create Duel Flow States
  const [createDuelVisible, setCreateDuelVisible] = useState(false);
  const [launchingDuel, setLaunchingDuel] = useState(false);
  const [isAutoMatch, setIsAutoMatch] = useState(false);
  const [opponentUsername, setOpponentUsername] = useState('');
  const [selectedMetric, setSelectedMetric] = useState('health_score');
  const [selectedDurationDays, setSelectedDurationDays] = useState(3);
  const [friendsList, setFriendsList] = useState<UserProfile[]>([]);

  // Leave Challenge Modal States
  const [leaveModalVisible, setLeaveModalVisible] = useState(false);
  const [leaveTargetType, setLeaveTargetType] = useState<'weekly' | 'monthly' | null>(null);

  // Admin Panel States
  const [allChallenges, setAllChallenges] = useState<ChallengeV2[]>([]);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<ChallengeV2 | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [editXp, setEditXp] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'DISABLED' | 'ARCHIVED' | 'COMPLETED'>('ACTIVE');
  const [updatingChallenge, setUpdatingChallenge] = useState(false);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);

  const [adminAnalytics, setAdminAnalytics] = useState<AdminAnalytics>({
    totalParticipants: 0,
    completions: 0,
    abandonedCount: 0,
    practiceCount: 0,
    activeWeeklyCount: 0,
    activeMonthlyCount: 0,
    completionRate: 0,
    recentCompletions: []
  });

  const loadData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // 1. Run PostgreSQL database challenge sync
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      await supabase.rpc('sync_user_challenges', { 
        p_user_id: user.id,
        p_timezone: tz
      });

      // 2. Fetch User Profile
      const { data: profile } = await supabase
        .from('users')
        .select('id, name, username, level, goal, xp, is_admin')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserProfile(profile);
        setIsAdmin(profile.is_admin || false);
      }

      // 3. Fetch Duels
      const { data: dbDuels } = await supabase
        .from('duels')
        .select('*, challenger:users!challenger_id(username), opponent:users!opponent_id(username)')
        .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`);

      if (dbDuels) {
        setDuels(dbDuels);
      }

      // 4. Fetch Participations (Weekly/Monthly)
      const { data: dbParticipations } = await supabase
        .from('challenge_participations_v2')
        .select('*, challenge:challenges_v2(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (dbParticipations) {
        const weeklyParts = dbParticipations.filter(p => p.challenge?.type === 'weekly');
        const monthlyParts = dbParticipations.filter(p => p.challenge?.type === 'monthly');

        setWeeklyParticipations(weeklyParts);
        setMonthlyParticipations(monthlyParts);

        const nowMs = Date.now();
        const activeWeekly = weeklyParts.find(p => {
          const isEnded = p.challenge?.end_date ? new Date(p.challenge.end_date).getTime() < nowMs : false;
          return p.challenge?.status === 'ACTIVE' && p.status !== 'LEFT' && !isEnded;
        }) || null;

        const activeMonthly = monthlyParts.find(p => {
          const isEnded = p.challenge?.end_date ? new Date(p.challenge.end_date).getTime() < nowMs : false;
          return p.challenge?.status === 'ACTIVE' && p.status !== 'LEFT' && !isEnded;
        }) || null;

        setWeeklyParticipation(activeWeekly);
        setMonthlyParticipation(activeMonthly);

        // Fetch Weekly Leaderboard
        if (activeWeekly) {
          const { data: leadWeekly } = await supabase
            .from('challenge_participations_v2')
            .select('completed_at, user:users(username)')
            .eq('challenge_id', activeWeekly.challenge_id)
            .eq('status', 'COMPLETED')
            .order('completed_at', { ascending: true })
            .limit(10);
          if (leadWeekly) {
            setWeeklyLeaderboard(leadWeekly.map(l => ({
              username: (l.user as any)?.username || 'Athlete',
              completed_at: l.completed_at ? new Date(l.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown'
            })));
          }
        }

        // Fetch Monthly Leaderboard
        if (activeMonthly) {
          const { data: leadMonthly } = await supabase
            .from('challenge_participations_v2')
            .select('completed_at, user:users(username)')
            .eq('challenge_id', activeMonthly.challenge_id)
            .eq('status', 'COMPLETED')
            .order('completed_at', { ascending: true })
            .limit(10);
          if (leadMonthly) {
            setMonthlyLeaderboard(leadMonthly.map(l => ({
              username: (l.user as any)?.username || 'Athlete',
              completed_at: l.completed_at ? new Date(l.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown'
            })));
          }
        }
      }

      // 4b. Fetch Accepted Friends
      const { data: friendships } = await supabase
        .from('friendships')
        .select('*')
        .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
        .eq('status', 'accepted');

      const friendIds: string[] = [];
      if (friendships) {
        friendships.forEach(f => {
          const fId = f.user_id === user.id ? f.friend_id : f.user_id;
          friendIds.push(fId);
        });
      }

      let friendsData: UserProfile[] = [];
      if (friendIds.length > 0) {
        const { data: fData } = await supabase
          .from('users')
          .select('id, name, username, level, goal, xp')
          .in('id', friendIds);
        friendsData = fData || [];
      }
      setFriendsList(friendsData);

      // 5. Fetch Admin Analytics and list if current user is admin
      const isUserAdmin = profile?.is_admin ?? false;
      if (profile && isUserAdmin) {
        await loadAdminAnalytics();
        await loadAllChallenges();
      }

    } catch (e) {
      console.log('Error loading challenge data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAdminAnalytics = async () => {
    try {
      const { data: allParticipations } = await supabase
        .from('challenge_participations_v2')
        .select('status, progress_value, challenge_id, user_id, user:users(username), challenge:challenges_v2(title, type)');

      if (allParticipations) {
        const total = allParticipations.length;
        const completed = allParticipations.filter(p => p.status === 'COMPLETED').length;
        const abandoned = allParticipations.filter(p => p.status === 'LEFT').length;
        const practice = allParticipations.filter(p => p.status === 'INELIGIBLE' || p.status === 'INELIGIBLE_COMPLETED' || p.status === 'INELIGIBLE_EXPIRED').length;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
        
        // Count active weekly / monthly challenges
        const { count: activeWeeklyCount } = await supabase
          .from('challenges_v2')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ACTIVE')
          .eq('type', 'weekly');
          
        const { count: activeMonthlyCount } = await supabase
          .from('challenges_v2')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ACTIVE')
          .eq('type', 'monthly');

        setAdminAnalytics({
          totalParticipants: total,
          completions: completed,
          abandonedCount: abandoned,
          practiceCount: practice,
          activeWeeklyCount: activeWeeklyCount || 0,
          activeMonthlyCount: activeMonthlyCount || 0,
          completionRate,
          recentCompletions: allParticipations
            .filter(p => p.status === 'COMPLETED')
            .slice(0, 10)
            .map(p => ({
              username: (p.user as any)?.username || 'User',
              title: (p.challenge as any)?.title || 'Challenge',
              type: (p.challenge as any)?.type || 'weekly'
            }))
        });
        // Fetch all registered users
        const { data: dbUsers } = await supabase
          .from('users')
          .select('id, name, username, level, xp, created_at')
          .order('created_at', { ascending: false });
        if (dbUsers) {
          setAdminUsers(dbUsers);
        }
      }
    } catch (e) {
      console.log('Error loading admin stats:', e);
    }
  };

  const loadAllChallenges = async () => {
    try {
      const { data, error } = await supabase
        .from('challenges_v2')
        .select('*')
        .order('start_date', { ascending: true });
      if (data) {
        setAllChallenges(data);
      }
    } catch (e) {
      console.log('Error loading all challenges:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadData();
    setRefreshing(false);
  };

  // Launch Friends Duel
  const handleLaunchDuel = async () => {
    if (!userProfile) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLaunchingDuel(true);

    try {
      let opponentId: string;
      let opponentUsernameStr: string;

      if (isAutoMatch) {
        // Query users with same goal and similar level (excl. self)
        const { data: matchedUsers, error: matchErr } = await supabase
          .from('users')
          .select('id, username')
          .neq('id', userProfile.id)
          .eq('goal', userProfile.goal)
          .gte('level', Math.max(1, userProfile.level - 5))
          .lte('level', userProfile.level + 5)
          .limit(10);

        if (matchErr || !matchedUsers || matchedUsers.length === 0) {
          // Fallback search
          const { data: fallbackUsers } = await supabase
            .from('users')
            .select('id, username')
            .neq('id', userProfile.id)
            .limit(5);

          if (!fallbackUsers || fallbackUsers.length === 0) {
            Alert.alert('No Match Found', 'There are no other athletes available for matchmaking.');
            setLaunchingDuel(false);
            return;
          }
          const picked = fallbackUsers[Math.floor(Math.random() * fallbackUsers.length)];
          opponentId = picked.id;
          opponentUsernameStr = picked.username;
        } else {
          const picked = matchedUsers[Math.floor(Math.random() * matchedUsers.length)];
          opponentId = picked.id;
          opponentUsernameStr = picked.username;
        }
      } else {
        if (!opponentUsername.trim()) {
          Alert.alert('Error', 'Please enter a username to challenge.');
          setLaunchingDuel(false);
          return;
        }

        const { data: oppProfile, error: oppErr } = await supabase
          .from('users')
          .select('id, username')
          .eq('username', opponentUsername.trim().toLowerCase())
          .single();

        if (oppErr || !oppProfile) {
          Alert.alert('Opponent Not Found', `No user exists with the username @${opponentUsername}.`);
          setLaunchingDuel(false);
          return;
        }

        if (oppProfile.id === userProfile.id) {
          Alert.alert('Invalid Duel', 'You cannot challenge yourself.');
          setLaunchingDuel(false);
          return;
        }

        opponentId = oppProfile.id;
        opponentUsernameStr = oppProfile.username;
      }

      // Insert Duel
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + selectedDurationDays * 24 * 60 * 60 * 1000);

      const { error: insErr } = await supabase
        .from('duels')
        .insert({
          challenger_id: userProfile.id,
          opponent_id: opponentId,
          type: selectedMetric,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          status: 'PENDING',
          challenger_progress: 0,
          opponent_progress: 0
        });

      if (insErr) throw insErr;

      if (isAutoMatch) {
        Alert.alert('Match Proposed! ⚔️', `Challenge request sent to @${opponentUsernameStr} for a ${selectedDurationDays}-day ${selectedMetric.replace('_', ' ').toUpperCase()} clash. They must accept it to start the clash.`);
      } else {
        Alert.alert('Duel Sent! ⚔️', `Invite sent to @${opponentUsernameStr}. They must accept it to start the clash.`);
      }

      setCreateDuelVisible(false);
      setOpponentUsername('');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error Launching Duel', err.message || 'An unexpected error occurred.');
    } finally {
      setLaunchingDuel(false);
    }
  };

  // Withdraw Pending Duel
  const handleWithdrawDuel = async (duelId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Withdraw Duel ⚔️',
      'Are you sure you want to withdraw this pending duel request?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('duels')
                .delete()
                .eq('id', duelId);

              if (error) throw error;
              Alert.alert('Withdrawn', 'Duel request has been withdrawn.');
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to withdraw duel.');
            }
          }
        }
      ]
    );
  };

  // Accept Invite Duel
  const handleAcceptDuel = async (duelId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const now = new Date();
      const duel = duels.find(d => d.id === duelId);
      if (!duel) return;
      
      const durationMs = new Date(duel.end_date).getTime() - new Date(duel.start_date).getTime();
      const newEndDate = new Date(now.getTime() + durationMs);

      const { error } = await supabase
        .from('duels')
        .update({
          status: 'ACTIVE',
          start_date: now.toISOString(),
          end_date: newEndDate.toISOString()
        })
        .eq('id', duelId);

      if (error) throw error;
      Alert.alert('Success', 'Duel accepted! Clash is now active.');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to accept duel.');
    }
  };

  // Decline Invite Duel
  const handleDeclineDuel = async (duelId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { error } = await supabase
        .from('duels')
        .update({ status: 'FORFEITED' })
        .eq('id', duelId);

      if (error) throw error;
      Alert.alert('Declined', 'Invite declined.');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to decline invite.');
    }
  };

  // Forfeit Active Duel
  const handleForfeitDuel = async (duelId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Forfeit Duel 🏳️',
      'Are you sure you want to forfeit this duel? Your opponent will be declared the winner.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Forfeit',
          style: 'destructive',
          onPress: async () => {
            try {
              const duel = duels.find(d => d.id === duelId);
              if (!duel) return;
              const opponentId = duel.challenger_id === userProfile?.id ? duel.opponent_id : duel.challenger_id;
              
              const { error } = await supabase
                .from('duels')
                .update({
                  status: 'COMPLETED',
                  winner_id: opponentId
                })
                .eq('id', duelId);

              if (error) throw error;
              Alert.alert('Forfeited', 'You forfeited the duel.');
              await loadData();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to forfeit duel.');
            }
          }
        }
      ]
    );
  };

  // Leave Weekly/Monthly Challenge
  const handleLeaveChallenge = async () => {
    if (!leaveTargetType || !userProfile) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const targetParticipation = leaveTargetType === 'weekly' ? weeklyParticipation : monthlyParticipation;
    if (!targetParticipation) return;

    try {
      const { error } = await supabase
        .from('challenge_participations_v2')
        .update({ status: 'LEFT' })
        .eq('id', targetParticipation.id);

      if (error) throw error;
      
      Alert.alert('Success', `You have left the ${leaveTargetType} challenge.`);
      setLeaveModalVisible(false);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error Leaving Challenge', err.message || 'An unexpected error occurred.');
    }
  };

  // Edit Challenge Admin Command
  const startEditingChallenge = (c: ChallengeV2) => {
    setEditingChallenge(c);
    setEditTitle(c.title);
    setEditDesc(c.description);
    setEditTarget(String(c.target_value));
    setEditXp(String(c.xp_reward));
    setEditStatus(c.status);
    setEditModalVisible(true);
  };

  const handleUpdateChallenge = async () => {
    if (!editingChallenge) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setUpdatingChallenge(true);

    try {
      const { error } = await supabase
        .from('challenges_v2')
        .update({
          title: editTitle.trim(),
          description: editDesc.trim(),
          target_value: parseInt(editTarget, 10) || editingChallenge.target_value,
          xp_reward: parseInt(editXp, 10) || editingChallenge.xp_reward,
          status: editStatus
        })
        .eq('id', editingChallenge.id);

      if (error) throw error;
      Alert.alert('Success', 'Challenge updated successfully.');
      setEditModalVisible(false);
      await loadData();
      await loadAllChallenges();
    } catch (err: any) {
      Alert.alert('Error Updating Challenge', err.message || 'Failed to update challenge.');
    } finally {
      setUpdatingChallenge(false);
    }
  };

  const handleDeleteChallenge = async (challengeId: string, title: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete Competition? 🗑️',
      `Are you sure you want to permanently delete "${title}"? This will also delete all user progress and enrollments for this challenge.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('challenges_v2')
                .delete()
                .eq('id', challengeId);
              if (error) throw error;
              Alert.alert('Deleted', 'Competition deleted successfully.');
              await loadData();
              await loadAllChallenges();
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete competition.');
            }
          }
        }
      ]
    );
  };

  // Admin Seeding Controls
  const handleCreateMockWeekly = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const now = new Date();
      const day = now.getUTCDay();
      const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
      const startOfWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff, 0, 0, 0, 0));
      const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1000);

      const { error } = await supabase
        .from('challenges_v2')
        .insert({
          type: 'weekly',
          template_key: 'protein_week_' + Date.now(),
          title: 'Protein Week (Mock)',
          description: 'Hit your daily protein target on 5 different days.',
          metric: 'protein',
          target_value: 5,
          xp_reward: 100,
          start_date: startOfWeek.toISOString(),
          end_date: endOfWeek.toISOString(),
          status: 'ACTIVE'
        });

      if (error) throw error;
      Alert.alert('Success', 'Mock active weekly challenge created!');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create mock challenge.');
    }
  };

  const handleCreateMockMonthly = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const now = new Date();
      const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

      const { error } = await supabase
        .from('challenges_v2')
        .insert({
          type: 'monthly',
          template_key: 'protein_master_' + Date.now(),
          title: 'July Protein Master (Mock)',
          description: 'Hit protein goal 25 days.',
          metric: 'protein',
          target_value: 25,
          xp_reward: 500,
          start_date: startOfMonth.toISOString(),
          end_date: endOfMonth.toISOString(),
          status: 'ACTIVE'
        });

      if (error) throw error;
      Alert.alert('Success', 'Mock active monthly challenge created!');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create mock challenge.');
    }
  };

  // Helper date parsing
  const formatUtcDate = (dateStr: string) => {
    if (!dateStr) return '';
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return new Date(dateStr).toLocaleDateString();
    const [_, year, month, day] = match;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIndex = parseInt(month, 10) - 1;
    const monthName = months[monthIndex] || month;
    return `${monthName} ${parseInt(day, 10)}, ${year}`;
  };

  const getDaysRemaining = (endDateStr: string) => {
    if (!endDateStr) return '';
    
    // Parse the date part (YYYY-MM-DD) and treat it as local time
    const match = endDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    let endDate: Date;
    if (match) {
      const [_, y, m, d] = match;
      // Set to 23:59:59 in the user's local timezone on that day
      endDate = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), 23, 59, 59);
    } else {
      endDate = new Date(endDateStr);
    }

    const diffMs = endDate.getTime() - Date.now();
    if (diffMs <= 0) return 'Ended';
    
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
      return `${diffHours}h remaining`;
    }
    return `${diffDays} days remaining`;
  };

  // Build Chronological Unified History List
  const getUnifiedHistory = () => {
    const historyItems: any[] = [];

    // Add completed/forfeited duels
    duels.forEach(d => {
      if (d.status === 'COMPLETED' || d.status === 'FORFEITED') {
        const isWinner = d.winner_id === userProfile?.id;
        const isDraw = d.status === 'COMPLETED' && !d.winner_id;
        const dateVal = d.end_date ? new Date(d.end_date) : new Date();
        const opponentName = d.challenger_id === userProfile?.id ? d.opponent?.username : d.challenger?.username;
        historyItems.push({
          id: d.id,
          type: 'duel',
          title: `Duel vs @${opponentName || 'Opponent'}`,
          metric: d.type,
          status: d.status,
          date: dateVal,
          scoreText: `You: ${d.challenger_id === userProfile?.id ? d.challenger_progress : d.opponent_progress} • Opponent: ${d.challenger_id === userProfile?.id ? d.opponent_progress : d.challenger_progress}`,
          badgeText: isDraw ? '⚔️ DRAW' : isWinner ? '🏆 WON' : '❌ LOST'
        });
      }
    });

    // Add non-active weekly participations
    weeklyParticipations.forEach(p => {
      const isCompleted = p.status === 'COMPLETED';
      const isPracticeCompleted = p.status === 'INELIGIBLE_COMPLETED';
      const isLeft = p.status === 'LEFT';
      const isExpired = p.status === 'EXPIRED' || p.status === 'INELIGIBLE_EXPIRED';
      const isActiveChallenge = p.challenge?.status === 'ACTIVE';

      if (isLeft || isCompleted || isPracticeCompleted || isExpired || !isActiveChallenge) {
        const dateVal = p.completed_at ? new Date(p.completed_at) : (p.challenge?.end_date ? new Date(p.challenge.end_date) : new Date());
        let badgeText = '❌ EXPIRED';
        if (isCompleted) badgeText = '🏆 COMPLETED';
        else if (isPracticeCompleted) badgeText = '🏃 PRACTICE COMPLETED';
        else if (isLeft) badgeText = '🚪 LEFT';

        historyItems.push({
          id: p.id,
          type: 'weekly',
          title: p.challenge?.title || 'Weekly Challenge',
          metric: p.challenge?.metric || '',
          status: p.status,
          date: dateVal,
          scoreText: `Progress: ${p.progress_value} / ${p.challenge?.target_value || 0}`,
          badgeText
        });
      }
    });

    // Add non-active monthly participations
    monthlyParticipations.forEach(p => {
      const isCompleted = p.status === 'COMPLETED';
      const isPracticeCompleted = p.status === 'INELIGIBLE_COMPLETED';
      const isLeft = p.status === 'LEFT';
      const isExpired = p.status === 'EXPIRED' || p.status === 'INELIGIBLE_EXPIRED';
      const isActiveChallenge = p.challenge?.status === 'ACTIVE';

      if (isLeft || isCompleted || isPracticeCompleted || isExpired || !isActiveChallenge) {
        const dateVal = p.completed_at ? new Date(p.completed_at) : (p.challenge?.end_date ? new Date(p.challenge.end_date) : new Date());
        let badgeText = '❌ EXPIRED';
        if (isCompleted) badgeText = '🏆 COMPLETED';
        else if (isPracticeCompleted) badgeText = '🏃 PRACTICE COMPLETED';
        else if (isLeft) badgeText = '🚪 LEFT';

        historyItems.push({
          id: p.id,
          type: 'monthly',
          title: p.challenge?.title || 'Monthly Event',
          metric: p.challenge?.metric || '',
          status: p.status,
          date: dateVal,
          scoreText: `Progress: ${p.progress_value} / ${p.challenge?.target_value || 0}`,
          badgeText
        });
      }
    });

    // Sort by date descending
    return historyItems.sort((a, b) => b.date.getTime() - a.date.getTime());
  };

  const unifiedHistory = getUnifiedHistory();
  const activeDuels = duels.filter(d => d.status === 'PENDING' || d.status === 'ACTIVE');

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Challenges</Text>
          {userProfile && (
            <Text style={styles.userSubTitle}>Level {userProfile.level} • {userProfile.goal.replace('_', ' ').toUpperCase()}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.createDuelHeaderBtn} onPress={() => setCreateDuelVisible(true)}>
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={styles.createDuelHeaderBtnText}>Create Duel</Text>
        </TouchableOpacity>
      </View>

      {/* Tabs Layout */}
      <View style={styles.tabBar}>
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'active' && styles.tabActive]} 
          onPress={() => setActiveTab('active')}
        >
          <Ionicons name="trophy" size={16} color={activeTab === 'active' ? '#FFF' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>Active Quests</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.tabButton, activeTab === 'history' && styles.tabActive]} 
          onPress={() => setActiveTab('history')}
        >
          <Ionicons name="time" size={16} color={activeTab === 'history' ? '#FFF' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>History</Text>
        </TouchableOpacity>

        {isAdmin && (
          <TouchableOpacity 
            style={[styles.tabButton, activeTab === 'admin' && styles.tabActiveAdmin]} 
            onPress={() => setActiveTab('admin')}
          >
            <Ionicons name="shield-checkmark" size={16} color={activeTab === 'admin' ? '#A78BFA' : '#888'} />
            <Text style={[styles.tabText, activeTab === 'admin' && styles.tabTextActiveAdmin]}>Admin</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* TAB 1: ACTIVE QUESTS */}
      {activeTab === 'active' && (
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          {/* Active Duels (1v1) */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Friend Duels ({activeDuels.length}/3)</Text>
          </View>

          {activeDuels.length === 0 ? (
            <View style={styles.noDuelsCard}>
              <Ionicons name="people-outline" size={32} color="rgba(255,255,255,0.2)" />
              <Text style={styles.noDuelsText}>No active duels right now.</Text>
              <TouchableOpacity onPress={() => setCreateDuelVisible(true)}>
                <Text style={styles.noDuelsLink}>Challenge a friend ⚔️</Text>
              </TouchableOpacity>
            </View>
          ) : (
            activeDuels.map(d => {
              const isChallenger = d.challenger_id === userProfile?.id;
              const opponentName = isChallenger ? d.opponent?.username : d.challenger?.username;
              const isPending = d.status === 'PENDING';
              
              const myProgress = isChallenger ? d.challenger_progress : d.opponent_progress;
              const oppProgress = isChallenger ? d.opponent_progress : d.challenger_progress;
              
              const totalProg = myProgress + oppProgress;
              const myPercent = totalProg > 0 ? (myProgress / totalProg) * 100 : 50;

              return (
                <View key={d.id} style={styles.duelCard}>
                  <View style={styles.duelCardHeader}>
                    <Text style={styles.duelCardTitle}>Clash with @{opponentName || 'Athlete'}</Text>
                    <View style={[styles.duelStatusBadge, isPending ? styles.statusPendingBg : styles.statusActiveBg]}>
                      <Text style={[styles.duelStatusText, isPending ? styles.statusPendingText : styles.statusActiveText]}>
                        {isPending ? 'PENDING' : 'ACTIVE'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.duelMetricText}>Type: {d.type.replace('_', ' ').toUpperCase()}</Text>

                  {isPending ? (
                    <View style={styles.duelCardFooter}>
                      {!isChallenger ? (
                        <View style={styles.duelButtonRow}>
                          <TouchableOpacity style={[styles.duelActionBtn, styles.duelDeclineBtn]} onPress={() => handleDeclineDuel(d.id)}>
                            <Text style={styles.duelBtnText}>Decline</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.duelActionBtn, styles.duelAcceptBtn]} onPress={() => handleAcceptDuel(d.id)}>
                            <Text style={[styles.duelBtnText, { color: '#000' }]}>Accept</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <View style={styles.duelPendingRow}>
                          <Text style={styles.duelDaysText}>Waiting for opponent to accept...</Text>
                          <TouchableOpacity style={styles.duelWithdrawBtn} onPress={() => handleWithdrawDuel(d.id)}>
                            <Text style={styles.duelWithdrawText}>Withdraw</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={{ marginTop: 12 }}>
                      <View style={styles.duelProgressContainer}>
                        <View style={styles.duelProgressBar}>
                          <View style={[styles.duelProgressFill, { width: `${myPercent}%` }]} />
                        </View>
                        <View style={styles.duelProgressText}>
                          <Text style={styles.progressValText}>You: {myProgress}</Text>
                          <Text style={styles.progressValText}>Opponent: {oppProgress}</Text>
                        </View>
                      </View>

                      <View style={[styles.duelCardFooter, { marginTop: 14 }]}>
                        <Text style={styles.duelDaysText}>{getDaysRemaining(d.end_date)}</Text>
                        <TouchableOpacity style={styles.duelForfeitBtn} onPress={() => handleForfeitDuel(d.id)}>
                          <Text style={styles.forfeitBtnText}>Forfeit 🏳️</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}

          {/* Active Weekly Challenge */}
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <Text style={styles.sectionTitle}>Global Weekly Quest</Text>
          </View>

          {weeklyParticipation ? (
            <TouchableOpacity 
              activeOpacity={0.9} 
              style={styles.questCard}
              onPress={() => setWeeklyLeaderboardVisible(!weeklyLeaderboardVisible)}
            >
              <View style={styles.questHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.questEnrolled}>AUTO-ENROLLED</Text>
                    {(weeklyParticipation.status === 'INELIGIBLE' || 
                      weeklyParticipation.status === 'INELIGIBLE_COMPLETED' || 
                      weeklyParticipation.status === 'INELIGIBLE_EXPIRED') && (
                      <View style={styles.practiceModeBadge}>
                        <Text style={styles.practiceModeBadgeText}>Practice Mode</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.questTitle}>{weeklyParticipation.challenge?.title}</Text>
                </View>
                <Ionicons name={weeklyLeaderboardVisible ? 'chevron-up' : 'chevron-down'} size={18} color="rgba(255,255,255,0.4)" />
              </View>
              <Text style={styles.questDesc}>{weeklyParticipation.challenge?.description}</Text>

              {(weeklyParticipation.status === 'INELIGIBLE' || 
                weeklyParticipation.status === 'INELIGIBLE_COMPLETED' || 
                weeklyParticipation.status === 'INELIGIBLE_EXPIRED') && (
                <View style={styles.practiceAlert}>
                  <Ionicons name="information-circle-outline" size={16} color="#A78BFA" />
                  <Text style={styles.practiceAlertText}>Reward eligibility begins next week.</Text>
                </View>
              )}

              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${Math.min(100, (weeklyParticipation.progress_value / (weeklyParticipation.challenge?.target_value || 1)) * 100)}%` }
                    ]} 
                  />
                </View>
                <View style={styles.progressTextRow}>
                  <Text style={styles.progressValText}>
                    Progress: {weeklyParticipation.progress_value} / {weeklyParticipation.challenge?.target_value}
                  </Text>
                  <Text style={styles.daysLeftText}>{getDaysRemaining(weeklyParticipation.challenge?.end_date || '')}</Text>
                </View>
              </View>

              <View style={styles.questRewardsContainer}>
                <Text style={styles.rewardLabel}>Reward:</Text>
                <Text style={
                  (weeklyParticipation.status === 'INELIGIBLE' || 
                   weeklyParticipation.status === 'INELIGIBLE_COMPLETED' || 
                   weeklyParticipation.status === 'INELIGIBLE_EXPIRED') 
                    ? styles.rewardValueStruck 
                    : styles.rewardValue
                }>
                  +{weeklyParticipation.challenge?.xp_reward} XP
                </Text>
              </View>

              {/* Expandable Weekly Leaderboard */}
              {weeklyLeaderboardVisible && (
                <>
                  <View style={styles.leaderboardContainer} onStartShouldSetResponder={() => true}>
                    <Text style={styles.leaderboardSectionTitle}>🏆 First 10 Finishers</Text>
                    {weeklyLeaderboard.length === 0 ? (
                      <Text style={styles.noLeaderboardText}>No completions yet. Be the first!</Text>
                    ) : (
                      weeklyLeaderboard.map((entry, idx) => (
                        <View key={idx} style={styles.leaderboardItem}>
                          <Text style={styles.leaderboardRank}>#{idx + 1}</Text>
                          <Text style={styles.leaderboardUser}>@{entry.username}</Text>
                          <Text style={styles.leaderboardDate}>Completed {entry.completed_at}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  <TouchableOpacity 
                    style={styles.leaveChallengeBtn}
                    onPress={() => {
                      setLeaveTargetType('weekly');
                      setLeaveModalVisible(true);
                    }}
                  >
                    <Text style={styles.leaveChallengeBtnText}>Leave Challenge</Text>
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.noDuelsCard}>
              <Text style={styles.noDuelsText}>No active weekly challenge scheduled.</Text>
            </View>
          )}

          {/* Active Monthly Challenge */}
          <View style={[styles.sectionHeader, { marginTop: 24 }]}>
            <Text style={styles.sectionTitle}>Global Monthly Quest</Text>
          </View>

          {monthlyParticipation ? (
            <TouchableOpacity 
              activeOpacity={0.9} 
              style={styles.questCard}
              onPress={() => setMonthlyLeaderboardVisible(!monthlyLeaderboardVisible)}
            >
              <View style={styles.questHeader}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.questEnrolled}>AUTO-ENROLLED</Text>
                    {(monthlyParticipation.status === 'INELIGIBLE' || 
                      monthlyParticipation.status === 'INELIGIBLE_COMPLETED' || 
                      monthlyParticipation.status === 'INELIGIBLE_EXPIRED') && (
                      <View style={styles.practiceModeBadge}>
                        <Text style={styles.practiceModeBadgeText}>Practice Mode</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.questTitle}>{monthlyParticipation.challenge?.title}</Text>
                </View>
                <Ionicons name={monthlyLeaderboardVisible ? 'chevron-up' : 'chevron-down'} size={18} color="rgba(255,255,255,0.4)" />
              </View>
              <Text style={styles.questDesc}>{monthlyParticipation.challenge?.description}</Text>

              {(monthlyParticipation.status === 'INELIGIBLE' || 
                monthlyParticipation.status === 'INELIGIBLE_COMPLETED' || 
                monthlyParticipation.status === 'INELIGIBLE_EXPIRED') && (
                <View style={styles.practiceAlert}>
                  <Ionicons name="information-circle-outline" size={16} color="#A78BFA" />
                  <Text style={styles.practiceAlertText}>Reward eligibility begins next month.</Text>
                </View>
              )}

              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${Math.min(100, (monthlyParticipation.progress_value / (monthlyParticipation.challenge?.target_value || 1)) * 100)}%` }
                    ]} 
                  />
                </View>
                <View style={styles.progressTextRow}>
                  <Text style={styles.progressValText}>
                    Progress: {monthlyParticipation.progress_value} / {monthlyParticipation.challenge?.target_value}
                  </Text>
                  <Text style={styles.daysLeftText}>{getDaysRemaining(monthlyParticipation.challenge?.end_date || '')}</Text>
                </View>
              </View>

              <View style={styles.questRewardsContainer}>
                <Text style={styles.rewardLabel}>Reward:</Text>
                <Text style={
                  (monthlyParticipation.status === 'INELIGIBLE' || 
                   monthlyParticipation.status === 'INELIGIBLE_COMPLETED' || 
                   monthlyParticipation.status === 'INELIGIBLE_EXPIRED') 
                    ? styles.rewardValueStruck 
                    : styles.rewardValue
                }>
                  +{monthlyParticipation.challenge?.xp_reward} XP
                </Text>
              </View>

              {/* Expandable Monthly Leaderboard */}
              {monthlyLeaderboardVisible && (
                <>
                  <View style={styles.leaderboardContainer} onStartShouldSetResponder={() => true}>
                    <Text style={styles.leaderboardSectionTitle}>🏆 First 10 Finishers</Text>
                    {monthlyLeaderboard.length === 0 ? (
                      <Text style={styles.noLeaderboardText}>No completions yet. Be the first!</Text>
                    ) : (
                      monthlyLeaderboard.map((entry, idx) => (
                        <View key={idx} style={styles.leaderboardItem}>
                          <Text style={styles.leaderboardRank}>#{idx + 1}</Text>
                          <Text style={styles.leaderboardUser}>@{entry.username}</Text>
                          <Text style={styles.leaderboardDate}>Completed {entry.completed_at}</Text>
                        </View>
                      ))
                    )}
                  </View>

                  <TouchableOpacity 
                    style={styles.leaveChallengeBtn}
                    onPress={() => {
                      setLeaveTargetType('monthly');
                      setLeaveModalVisible(true);
                    }}
                  >
                    <Text style={styles.leaveChallengeBtnText}>Leave Challenge</Text>
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <View style={styles.noDuelsCard}>
              <Text style={styles.noDuelsText}>No active monthly challenge scheduled.</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* TAB 2: UNIFIED CHRONOLOGICAL HISTORY */}
      {activeTab === 'history' && (
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Completed & Past Challenges</Text>
          </View>

          {unifiedHistory.length === 0 ? (
            <View style={styles.noDuelsCard}>
              <Ionicons name="hourglass-outline" size={32} color="rgba(255,255,255,0.2)" />
              <Text style={styles.noDuelsText}>No history items yet.</Text>
            </View>
          ) : (
            <View style={styles.historyList}>
              {unifiedHistory.map((item, idx) => {
                const isWin = item.badgeText === '🏆 WON' || item.badgeText === '🏆 COMPLETED';
                const isPractice = item.badgeText === '🏃 PRACTICE COMPLETED';
                const isLeft = item.badgeText === '🚪 LEFT';

                return (
                  <View key={idx} style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyTitle}>{item.title}</Text>
                        <Text style={styles.duelMetricText}>Type: {item.metric.replace('_', ' ').toUpperCase()}</Text>
                      </View>
                      <View style={[
                        styles.historyBadge,
                        isWin ? styles.winBadgeBg : isPractice ? styles.practiceBadgeBg : isLeft ? styles.leftBadgeBg : styles.lossBadgeBg
                      ]}>
                        <Text style={[
                          styles.historyBadgeText,
                          isWin ? styles.winBadgeText : isPractice ? styles.practiceBadgeText : isLeft ? styles.leftBadgeText : styles.lossBadgeText
                        ]}>
                          {item.badgeText}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.historyFooter}>
                      <Text style={styles.historyScores}>{item.scoreText}</Text>
                      <Text style={styles.historyDate}>
                        {item.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      )}

      {/* TAB 3: ADMIN PANEL */}
      {activeTab === 'admin' && isAdmin && (
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        >
          {/* Real-time analytics */}
          <View style={styles.adminSection}>
            <Text style={styles.adminTitle}>Product Analytics Dashboard</Text>

            <View style={styles.analyticsGrid}>
              <View style={styles.analyticsStatBox}>
                <Text style={styles.analyticsStatVal}>{adminAnalytics.totalParticipants}</Text>
                <Text style={styles.analyticsStatLabel}>Total Enrollments</Text>
              </View>
              <View style={styles.analyticsStatBox}>
                <Text style={styles.analyticsStatVal}>{adminAnalytics.completions}</Text>
                <Text style={styles.analyticsStatLabel}>Completions (XP)</Text>
              </View>
              <View style={styles.analyticsStatBox}>
                <Text style={styles.analyticsStatVal}>{adminAnalytics.practiceCount}</Text>
                <Text style={styles.analyticsStatLabel}>Practice Mode</Text>
              </View>
              <View style={styles.analyticsStatBox}>
                <Text style={styles.analyticsStatVal}>{adminAnalytics.abandonedCount}</Text>
                <Text style={styles.analyticsStatLabel}>Forfeited (Left)</Text>
              </View>
            </View>

            <View style={[styles.analyticsGrid, { marginTop: 12 }]}>
              <View style={styles.analyticsStatBox}>
                <Text style={styles.analyticsStatVal}>{adminAnalytics.activeWeeklyCount}</Text>
                <Text style={styles.analyticsStatLabel}>Active Weekly</Text>
              </View>
              <View style={styles.analyticsStatBox}>
                <Text style={styles.analyticsStatVal}>{adminAnalytics.activeMonthlyCount}</Text>
                <Text style={styles.analyticsStatLabel}>Active Monthly</Text>
              </View>
              <View style={[styles.analyticsStatBox, { flex: 2 }]}>
                <Text style={styles.analyticsStatVal}>{adminAnalytics.completionRate}%</Text>
                <Text style={styles.analyticsStatLabel}>Aggregated Completion Rate</Text>
              </View>
            </View>
          </View>

          {/* Manage database challenges */}
          <View style={[styles.adminSection, { marginTop: 24 }]}>
            <Text style={styles.adminTitle}>Manage Live & Future Challenges ⚙️</Text>
            
            {allChallenges.length === 0 ? (
              <Text style={[styles.noLeaderboardText, { marginTop: 8 }]}>No challenges found in database.</Text>
            ) : (
              <View style={{ gap: 10, marginTop: 12 }}>
                {allChallenges.map((c) => {
                  const isActive = c.status === 'ACTIVE';
                  return (
                    <View key={c.id} style={styles.adminChallengeCard}>
                      <View style={styles.adminChallengeHeader}>
                        <View>
                          <Text style={styles.adminChallengeTitle}>{c.title}</Text>
                          <Text style={styles.adminChallengeMeta}>
                            Type: {c.type.toUpperCase()} • Metric: {c.metric} • Target: {c.target_value} • Reward: {c.xp_reward} XP
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity style={styles.adminEditBtn} onPress={() => startEditingChallenge(c)}>
                            <Text style={styles.adminEditBtnText}>Edit</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            style={[styles.adminEditBtn, { borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.08)' }]} 
                            onPress={() => handleDeleteChallenge(c.id, c.title)}
                          >
                            <Text style={[styles.adminEditBtnText, { color: '#EF4444' }]}>Delete</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      {(() => {
                        const now = new Date();
                        const startDate = new Date(c.start_date);
                        const endDate = new Date(c.end_date);
                        
                        let displayStatus = 'ACTIVE';
                        let statusColor = '#22C55E'; // green
                        
                        if (now < startDate) {
                          displayStatus = 'UPCOMING';
                          statusColor = '#EAB308'; // yellow
                        } else if (now > endDate) {
                          displayStatus = 'ENDED';
                          statusColor = '#EF4444'; // red
                        }
                        
                        return (
                          <View style={styles.adminChallengeDates}>
                            <Text style={styles.adminDateText}>Start: {formatUtcDate(c.start_date)}</Text>
                            <Text style={styles.adminDateText}>End: {formatUtcDate(c.end_date)}</Text>
                            <Text style={[styles.adminStatusPill, { color: statusColor, borderColor: statusColor }]}>
                              {displayStatus}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Registered Users List */}
          <View style={[styles.adminSection, { marginTop: 24 }]}>
            <Text style={styles.adminTitle}>Registered Users ({adminUsers.length})</Text>
            {adminUsers.length === 0 ? (
              <Text style={[styles.noLeaderboardText, { marginTop: 8 }]}>No registered users found.</Text>
            ) : (
              <View style={{ gap: 10, marginTop: 12 }}>
                {adminUsers.map((u) => (
                  <View key={u.id} style={styles.adminChallengeCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={styles.adminChallengeTitle}>{u.name || 'No Name'}</Text>
                        <Text style={styles.adminChallengeMeta}>
                          @{u.username || 'unknown'} • Level {u.level || 1} • {u.xp || 0} XP
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.adminDateText, { opacity: 0.4 }]}>Joined: {new Date(u.created_at).toLocaleDateString()}</Text>
                        <Text style={[styles.adminDateText, { opacity: 0.3, fontSize: 10, marginTop: 2 }]}>ID: {u.id.substring(0, 8)}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Recent completions feed */}
          <View style={[styles.adminSection, { marginTop: 24 }]}>
            <Text style={styles.adminTitle}>Recent completions activity feed</Text>
            <View style={styles.completionsFeed}>
              {adminAnalytics.recentCompletions.length === 0 ? (
                <Text style={styles.noLeaderboardText}>No completions recorded yet.</Text>
              ) : (
                adminAnalytics.recentCompletions.map((feed, idx) => (
                  <View key={idx} style={styles.completionFeedItem}>
                    <Text style={styles.completionFeedUser}>@{feed.username}</Text>
                    <Text style={styles.completionFeedChallenge}>completed {feed.title} ({feed.type})</Text>
                  </View>
                ))
              )}
            </View>
          </View>

          {/* Database seeding controls */}
          <View style={[styles.adminSection, { marginTop: 24, paddingBottom: 40 }]}>
            <Text style={styles.adminTitle}>Seed Default Challenges</Text>

            <View style={styles.adminButtonRow}>
              <TouchableOpacity style={styles.adminBtn} onPress={handleCreateMockWeekly}>
                <Text style={styles.adminBtnText}>Seed Mock Weekly (Protein)</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.adminBtn} onPress={handleCreateMockMonthly}>
                <Text style={styles.adminBtnText}>Seed Mock Monthly (July Master)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* MODAL: LAUNCH DUEL CLASH */}
      <Modal visible={createDuelVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Launch Duel Clash</Text>
              <TouchableOpacity onPress={() => setCreateDuelVisible(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 20, paddingBottom: 24 }}>
              {/* Search method */}
              <View>
                <Text style={styles.inputLabel}>OPPONENT SEARCH METHOD</Text>
                <View style={styles.segmentedControl}>
                  <TouchableOpacity 
                    style={[styles.segmentBtn, isAutoMatch && styles.segmentActive]} 
                    onPress={() => setIsAutoMatch(true)}
                  >
                    <Text style={[styles.segmentText, isAutoMatch && styles.segmentActiveText]}>Auto-Matchmaker</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.segmentBtn, !isAutoMatch && styles.segmentActive]} 
                    onPress={() => setIsAutoMatch(false)}
                  >
                    <Text style={[styles.segmentText, !isAutoMatch && styles.segmentActiveText]}>Challenge Friend</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {!isAutoMatch && (() => {
                const matchingFriend = friendsList.find(f => f.username.toLowerCase() === opponentUsername.trim().toLowerCase());
                const showDropdown = opponentUsername.trim().length > 0 && !matchingFriend;
                return (
                  <View style={{ zIndex: 10 }}>
                    <Text style={styles.inputLabel}>FRIEND USERNAME</Text>
                    <TextInput
                      style={styles.usernameInput}
                      placeholder="Enter username (e.g. rahulfit)"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      value={opponentUsername}
                      onChangeText={setOpponentUsername}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    {showDropdown && (
                      <View style={styles.recommendationsDropdown}>
                        {friendsList
                          .filter(f => f.username.toLowerCase().startsWith(opponentUsername.trim().toLowerCase()))
                          .map(friend => (
                            <TouchableOpacity
                              key={friend.id}
                              style={styles.recommendationItem}
                              onPress={() => {
                                setOpponentUsername(friend.username);
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                              }}
                            >
                              <Text style={styles.recommendationUsername}>@{friend.username}</Text>
                              <Text style={styles.recommendationDetails}>Level {friend.level}</Text>
                            </TouchableOpacity>
                          ))}
                        {friendsList.filter(f => f.username.toLowerCase().startsWith(opponentUsername.trim().toLowerCase())).length === 0 && (
                          <View style={styles.recommendationEmpty}>
                            <Text style={styles.recommendationEmptyText}>No friends starting with "{opponentUsername}"</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                );
              })()}

              {/* Metric Select with ScrollView */}
              <View>
                <Text style={styles.inputLabel}>CHALLENGE METRIC</Text>
                <ScrollView 
                  style={styles.metricScrollView} 
                  contentContainerStyle={styles.metricGrid}
                  nestedScrollEnabled={true}
                >
                  {METRICS.map(m => (
                    <TouchableOpacity 
                      key={m.key} 
                      style={[styles.metricCard, selectedMetric === m.key && styles.metricActive]}
                      onPress={() => setSelectedMetric(m.key)}
                    >
                      <Text style={styles.metricCardName}>{m.name}</Text>
                      <Text style={styles.metricCardDesc}>{m.desc}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Duration Select */}
              <View>
                <Text style={styles.inputLabel}>CLASH DURATION</Text>
                <View style={styles.durationRow}>
                  {DURATIONS.map(d => (
                    <TouchableOpacity 
                      key={d.days} 
                      style={[styles.durationBtn, selectedDurationDays === d.days && styles.durationSelectedBtn]}
                      onPress={() => setSelectedDurationDays(d.days)}
                    >
                      <Text style={[styles.durationText, selectedDurationDays === d.days && styles.durationSelectedText]}>
                        {d.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Launch Button */}
              <TouchableOpacity 
                style={styles.launchBtn}
                onPress={handleLaunchDuel}
                disabled={launchingDuel}
              >
                {launchingDuel ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.launchBtnText}>
                    {isAutoMatch ? 'Find Aligned Opponent ⚔️' : 'Send Clash Request!'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL: EDIT CHALLENGE (ADMIN POWER) */}
      <Modal visible={editModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Challenge Settings</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 24 }}>
              <View>
                <Text style={styles.inputLabel}>TITLE</Text>
                <TextInput
                  style={styles.usernameInput}
                  value={editTitle}
                  onChangeText={setEditTitle}
                />
              </View>

              <View>
                <Text style={styles.inputLabel}>DESCRIPTION</Text>
                <TextInput
                  style={[styles.usernameInput, { height: 80, textAlignVertical: 'top' }]}
                  multiline={true}
                  value={editDesc}
                  onChangeText={setEditDesc}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>TARGET VALUE</Text>
                  <TextInput
                    style={styles.usernameInput}
                    keyboardType="numeric"
                    value={editTarget}
                    onChangeText={setEditTarget}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>XP REWARD</Text>
                  <TextInput
                    style={styles.usernameInput}
                    keyboardType="numeric"
                    value={editXp}
                    onChangeText={setEditXp}
                  />
                </View>
              </View>

              <View>
                <Text style={styles.inputLabel}>STATUS</Text>
                <View style={styles.segmentedControl}>
                  {(['ACTIVE', 'DISABLED', 'ARCHIVED', 'COMPLETED'] as const).map(st => (
                    <TouchableOpacity 
                      key={st}
                      style={[styles.segmentBtn, editStatus === st && styles.segmentActive]} 
                      onPress={() => setEditStatus(st)}
                    >
                      <Text style={[styles.segmentText, editStatus === st && styles.segmentActiveText, { fontSize: 10 }]}>
                        {st}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity 
                style={styles.launchBtn}
                onPress={handleUpdateChallenge}
                disabled={updatingChallenge}
              >
                {updatingChallenge ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.launchBtnText}>Save Settings</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL: LEAVE CONFIRMATION */}
      <Modal visible={leaveModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            <Ionicons name="warning-outline" size={48} color={colors.red} style={{ marginBottom: 12 }} />
            <Text style={styles.confirmModalTitle}>Leave Challenge?</Text>
            <Text style={styles.confirmModalDesc}>
              This action is permanent. You will forfeit all progress for this cycle, lose reward eligibility, and you cannot rejoin this {leaveTargetType} challenge.
            </Text>
            <View style={styles.confirmModalButtons}>
              <TouchableOpacity 
                style={[styles.confirmBtn, styles.confirmCancelBtn]} 
                onPress={() => setLeaveModalVisible(false)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.confirmBtn, styles.confirmLeaveBtn]} 
                onPress={handleLeaveChallenge}
              >
                <Text style={styles.confirmLeaveText}>Leave</Text>
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold' },
  userSubTitle: { color: 'rgba(255, 255, 255, 0.45)', fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5, marginTop: 2 },
  createDuelHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  createDuelHeaderBtnText: {
    color: colors.accent,
    fontWeight: '600',
    fontSize: 14,
  },
  tabBar: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 16, gap: 8 },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 6
  },
  tabActive: { backgroundColor: 'rgba(167, 139, 250, 0.1)', borderColor: 'rgba(167, 139, 250, 0.3)' },
  tabActiveAdmin: { backgroundColor: 'rgba(167, 139, 250, 0.2)', borderColor: '#A78BFA' },
  tabText: { color: 'rgba(255, 255, 255, 0.45)', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#FFFFFF' },
  tabTextActiveAdmin: { color: '#A78BFA' },
  scrollContainer: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionHeader: { marginBottom: 12, marginTop: 8 },
  sectionTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  noDuelsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  noDuelsText: { color: 'rgba(255, 255, 255, 0.4)', fontSize: 13, textAlign: 'center' },
  noDuelsLink: { color: '#A78BFA', fontSize: 13, fontWeight: 'bold', marginTop: 4 },
  duelCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  duelCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  duelCardTitle: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  duelStatusBadge: { borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6 },
  statusPendingBg: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.3)' },
  statusActiveBg: { backgroundColor: 'rgba(34, 197, 94, 0.15)', borderWidth: 1, borderColor: 'rgba(34, 197, 94, 0.3)' },
  duelStatusText: { fontSize: 9, fontWeight: 'bold' },
  statusPendingText: { color: '#F59E0B' },
  statusActiveText: { color: '#22C55E' },
  duelMetricText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 },
  duelProgressContainer: { marginTop: 10, gap: 6 },
  duelProgressBar: { height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' },
  duelProgressFill: { height: '100%', backgroundColor: '#A78BFA', borderRadius: 4 },
  duelProgressText: { flexDirection: 'row', justifyContent: 'space-between' },
  duelCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  duelDaysText: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  duelButtonRow: { flexDirection: 'row', gap: 8, marginTop: 8, width: '100%', justifyContent: 'flex-end' },
  duelActionBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, minWidth: 80, alignItems: 'center' },
  duelDeclineBtn: { borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'transparent' },
  duelAcceptBtn: { backgroundColor: '#A78BFA', borderColor: '#A78BFA' },
  duelForfeitBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)' },
  forfeitBtnText: { color: '#EF4444', fontSize: 11, fontWeight: '600' },
  duelBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  questCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    marginBottom: 16,
    gap: 12,
  },
  questHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  questEnrolled: { color: '#A78BFA', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5 },
  questTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginTop: 4 },
  questDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 18 },
  progressContainer: { gap: 6 },
  progressBar: { height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#A78BFA', borderRadius: 4 },
  progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressValText: { color: '#FFF', fontSize: 12, fontWeight: '500' },
  daysLeftText: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  questRewardsContainer: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rewardLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 'bold' },
  rewardValue: { color: '#A78BFA', fontSize: 12, fontWeight: 'bold' },
  rewardValueStruck: { color: 'rgba(255,255,255,0.25)', fontSize: 12, fontWeight: 'bold', textDecorationLine: 'line-through' },
  practiceModeBadge: {
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
    marginLeft: 6,
  },
  practiceModeBadgeText: {
    color: '#A78BFA',
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  practiceAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  practiceAlertText: { color: '#A78BFA', fontSize: 12, fontWeight: '500' },
  leaderboardContainer: {
    backgroundColor: '#09090D',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',
    gap: 8,
    marginTop: 8,
  },
  leaderboardSectionTitle: { color: '#FFF', fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
  noLeaderboardText: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontStyle: 'italic' },
  leaderboardItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  leaderboardRank: { color: '#A78BFA', fontSize: 12, fontWeight: 'bold', width: 30 },
  leaderboardUser: { color: '#FFF', fontSize: 12, flex: 1 },
  leaderboardDate: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },
  leaveChallengeBtn: {
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    backgroundColor: 'rgba(239,68,68,0.05)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  leaveChallengeBtnText: { color: '#EF4444', fontSize: 12, fontWeight: 'bold' },
  historyList: { gap: 10 },
  historyCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    padding: 14,
  },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyTitle: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  historyBadge: { borderRadius: 8, paddingVertical: 2, paddingHorizontal: 6 },
  winBadgeBg: { backgroundColor: 'rgba(34,197,94,0.1)' },
  practiceBadgeBg: { backgroundColor: 'rgba(167,139,250,0.1)' },
  leftBadgeBg: { backgroundColor: 'rgba(239,68,68,0.1)' },
  lossBadgeBg: { backgroundColor: 'rgba(120,120,120,0.1)' },
  historyBadgeText: { fontSize: 8, fontWeight: 'bold' },
  winBadgeText: { color: '#22C55E' },
  practiceBadgeText: { color: '#A78BFA' },
  leftBadgeText: { color: '#EF4444' },
  lossBadgeText: { color: 'rgba(255,255,255,0.6)' },
  historyFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, alignItems: 'center' },
  historyScores: { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  historyDate: { color: 'rgba(255,255,255,0.25)', fontSize: 11 },
  adminScroll: { paddingBottom: 40 },
  adminSection: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 16,
  },
  adminTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginBottom: 12 },
  analyticsGrid: { flexDirection: 'row', gap: 10 },
  analyticsStatBox: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    gap: 4
  },
  analyticsStatVal: { color: '#A78BFA', fontSize: 16, fontWeight: 'bold' },
  analyticsStatLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, textAlign: 'center' },
  completionsFeed: { gap: 6, marginTop: 10 },
  completionFeedItem: { flexDirection: 'row', gap: 4 },
  completionFeedUser: { color: '#A78BFA', fontSize: 12, fontWeight: 'bold' },
  completionFeedChallenge: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  adminButtonRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  adminBtn: {
    flex: 1,
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  adminBtnText: { color: '#A78BFA', fontSize: 11, fontWeight: 'bold' },
  adminChallengeCard: {
    backgroundColor: '#000',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    gap: 8,
  },
  adminChallengeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  adminChallengeTitle: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  adminChallengeMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 },
  adminEditBtn: {
    backgroundColor: 'rgba(167, 139, 250, 0.15)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
  },
  adminEditBtnText: { color: '#A78BFA', fontSize: 11, fontWeight: 'bold' },
  adminChallengeDates: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.03)', paddingTop: 8 },
  adminDateText: { color: 'rgba(255,255,255,0.3)', fontSize: 9 },
  adminStatusPill: { fontSize: 9, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#111117', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  inputLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 8 },
  segmentedControl: { flexDirection: 'row', backgroundColor: '#000', borderRadius: 12, padding: 4 },
  segmentBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  segmentActive: { backgroundColor: '#111117', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  segmentText: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },
  segmentActiveText: { color: '#FFF' },
  usernameInput: { backgroundColor: '#000', borderRadius: 12, padding: 14, color: '#FFF', fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  metricScrollView: { maxHeight: 200, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 8, backgroundColor: '#050507' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  metricCard: { 
    width: '48%', 
    backgroundColor: '#000', 
    borderRadius: 14, 
    padding: 12, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.06)', 
    gap: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricActive: { borderColor: '#A78BFA', backgroundColor: 'rgba(167, 139, 250, 0.05)' },
  metricCardName: { color: '#FFF', fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  metricCardDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 9, lineHeight: 12, textAlign: 'center' },
  durationRow: { flexDirection: 'row', gap: 10 },
  durationBtn: { flex: 1, backgroundColor: '#000', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  durationSelectedBtn: { borderColor: '#A78BFA', backgroundColor: 'rgba(167, 139, 250, 0.05)' },
  durationText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 'bold' },
  durationSelectedText: { color: '#A78BFA' },
  launchBtn: { backgroundColor: '#A78BFA', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  launchBtnText: { color: '#000', fontSize: 15, fontWeight: 'bold' },
  confirmModalContent: {
    backgroundColor: '#111117',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  confirmModalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  confirmModalDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  confirmModalButtons: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  confirmCancelBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  confirmLeaveBtn: { backgroundColor: '#EF4444' },
  confirmCancelText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  confirmLeaveText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  
  // Custom Styles
  duelPendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 6,
  },
  duelWithdrawBtn: {
    borderColor: 'rgba(239, 68, 68, 0.3)',
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 80,
  },
  duelWithdrawText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: 'bold',
  },
  recommendationsDropdown: {
    backgroundColor: '#0D0D12',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    marginTop: 6,
    maxHeight: 150,
    overflow: 'hidden',
  },
  recommendationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  recommendationUsername: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  recommendationDetails: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
  },
  recommendationEmpty: {
    padding: 16,
    alignItems: 'center',
  },
  recommendationEmptyText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 12,
    fontStyle: 'italic',
  },
});
