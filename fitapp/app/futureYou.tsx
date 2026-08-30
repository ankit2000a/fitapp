import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { buildUserContext } from '../lib/userContext';
import {
  fetchFutureYouData,
  getDemoModeState,
  setDemoModeState,
  getDemoProjection,
  FutureProjection
} from '../lib/futureYou';
import { appEvents, FUTURE_YOU_UPDATED_EVENT } from '../lib/events';

const { width } = Dimensions.get('window');

const colors = {
  bg: '#000000',
  card: '#111117',
  cardSecondary: '#0B0B0F',
  accent: '#A78BFA',
  border: 'rgba(255,255,255,0.06)',
  text: '#FFFFFF',
  subtext: 'rgba(255,255,255,0.65)',
  green: '#22C55E',
  orange: '#F59E0B',
  red: '#EF4444'
};

export default function FutureYouScreen() {
  const router = useRouter();
  const navigation = useNavigation();

  // States
  const [loading, setLoading] = useState(true);
  const [projection, setProjection] = useState<FutureProjection | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [firstName, setFirstName] = useState<string>('Trainer');
  const [currentUsername, setCurrentUsername] = useState<string>('');
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoDay, setDemoDay] = useState('day1');
  const [sandboxExpanded, setSandboxExpanded] = useState(false);

  // Animation refs
  const glowAnim = useRef(new Animated.Value(0.4)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Pulsing glow animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1.0,
          duration: 2000,
          useNativeDriver: true
        }),
        Animated.timing(glowAnim, {
          toValue: 0.4,
          duration: 2000,
          useNativeDriver: true
        })
      ])
    ).start();
  }, [glowAnim]);

  // Load user data & forecast
  const loadForecast = async (forceRefresh = false) => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Load Profile for name
      const { data: profile } = await supabase
        .from('users')
        .select('first_name, username')
        .eq('id', user.id)
        .single();
      const userFirstName = profile?.first_name || 'Trainer';
      setFirstName(userFirstName);
      setCurrentUsername(profile?.username || '');

      // Check Demo state
      const activeDemoDay = await getDemoModeState(user.id);
      if (activeDemoDay) {
        setDemoEnabled(true);
        setDemoDay(activeDemoDay);
        const demoProj = getDemoProjection(activeDemoDay, userFirstName);
        setProjection(demoProj);
      } else {
        setDemoEnabled(false);
        const ctx = await buildUserContext();
        if (ctx) {
          const data = await fetchFutureYouData(user.id, ctx, forceRefresh);
          setProjection(data);
        }
      }

      // Trigger enter animation
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true
        })
      ]).start();

    } catch (e) {
      console.error('Error loading future projection:', e);
      Alert.alert('Load Error', 'Could not load your Future You projection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadForecast();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadForecast(false);
    });
    return unsubscribe;
  }, [navigation]);

  // Sandbox state handlers
  const handleToggleDemoMode = async (enabled: boolean) => {
    setDemoEnabled(enabled);
    await setDemoModeState(userId, enabled, demoDay);

    if (enabled) {
      // Notify main screen context update
      await AsyncStorage.setItem('@future_you_context_dirty', 'true');
      if (demoDay === 'day7' || demoDay === 'day6' || demoDay === 'day5' || demoDay === 'day4' || demoDay === 'day3' || demoDay === 'day2' || demoDay === 'day1') {
        await AsyncStorage.removeItem('@future_you_day7_opened');
      } else {
        await AsyncStorage.setItem('@future_you_day7_opened', 'true');
      }
      const demoProj = getDemoProjection(demoDay, firstName);
      setProjection(demoProj);
    } else {
      await AsyncStorage.setItem('@future_you_context_dirty', 'true');
      loadForecast(true);
    }
    appEvents.emit(FUTURE_YOU_UPDATED_EVENT);
  };

  const handleChangeDemoDay = async (day: string) => {
    setDemoDay(day);
    await setDemoModeState(userId, true, day);
    await AsyncStorage.setItem('@future_you_context_dirty', 'true');
    if (day === 'day7' || day === 'day6' || day === 'day5' || day === 'day4' || day === 'day3' || day === 'day2' || day === 'day1') {
      await AsyncStorage.removeItem('@future_you_day7_opened');
    } else {
      await AsyncStorage.setItem('@future_you_day7_opened', 'true');
    }
    const demoProj = getDemoProjection(day, firstName);
    setProjection(demoProj);
    appEvents.emit(FUTURE_YOU_UPDATED_EVENT);
  };

  const handleForceRecalculation = async () => {
    await handleToggleDemoMode(false);
    loadForecast(true);
  };

  // Helper to get status icon/color for Section 3 drivers
  const renderDriverIcon = (status: 'success' | 'warning' | 'info') => {
    switch (status) {
      case 'success':
        return <Ionicons name="checkmark-circle" size={16} color="#10B981" />;
      case 'warning':
        return <Ionicons name="warning" size={16} color="#F59E0B" />;
      case 'info':
      default:
        return <Ionicons name="information-circle" size={16} color="#60A5FA" />;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#A78BFA" />
        <Text style={styles.loadingText}>Projecting Your Future Body...</Text>
      </View>
    );
  }

  // Fallback if no projection loaded
  if (!projection) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>No forecast data found.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={{ color: '#A78BFA' }}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const {
    future_direction,
    future_confidence,
    future_message,
    future_biggest_lever,
    future_biggest_lever_impact,
    future_biggest_lever_insight,
    future_projection_data,
    drivers,
    isLocked,
    progress,
    dayName
  } = projection as FutureProjection & { isLocked?: boolean; progress?: number; dayName?: string };

  const isImproving = future_direction === 'Improving';
  const isDeclining = future_direction === 'Declining';
  const delta = future_projection_data.health_score_projected - future_projection_data.health_score_current;

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient
        colors={['#09090E', '#030305']}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Future You™</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* LOCKED STATE OR NORMAL SECTIONS */}
          {isLocked ? (
            <View style={styles.lockedProgressCard}>
              <View style={styles.lockedCardHeader}>
                <View style={styles.lockedStatusRow}>
                  <View style={styles.pulsingDotGreen} />
                  <Text style={styles.lockedStatusTitle}>Habit Profile Compiling...</Text>
                </View>
                <View style={styles.lockedBadge}>
                  <Text style={styles.lockedBadgeText}>{dayName || 'Day 1 of 7'}</Text>
                </View>
              </View>

              <View style={styles.lockedProgressBarContainer}>
                <LinearGradient
                  colors={['#8B5CF6', '#C084FC']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.lockedProgressBarFill, { width: `${(progress || 0.15) * 100}%` }]}
                />
              </View>

              <Text style={styles.lockedCardDescription}>
                Future You is currently studying your lifestyle patterns. We require <Text style={{ color: '#A78BFA', fontWeight: 'bold' }}>7 days of logs</Text> to compile your baseline and generate custom 10-day health score projections.
              </Text>
            </View>
          ) : (
            <>
              {/* SECTION 1: True Hero Section */}
              <View style={styles.heroSection}>
                <Text style={styles.heroDirection}>
                  {isImproving ? '↗ Improving' : isDeclining ? '↘ Declining' : '→ Stable'}
                </Text>
                <Text style={styles.heroLabel}>Projected Change</Text>
                <Text style={styles.heroValue}>
                  {delta > 0 ? `+${delta}` : delta}
                </Text>
                <Text style={styles.heroSublabel}>Health Score Points</Text>
                <Text style={styles.heroTiming}>Next 10 Days</Text>
                <Text style={styles.heroContext}>
                  {delta >= 0 ? 'Based on your last 15 days.' : 'If current habits continue.'}
                </Text>
              </View>

              {/* SECTION 2: Timeline Breakdown */}
              <View style={styles.timelineSection}>
                <View style={styles.timelineNode}>
                  <Text style={styles.timelineLabel}>RECENT AVERAGE</Text>
                  <Text style={styles.timelineVal}>{future_projection_data.health_score_current}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color="rgba(255, 255, 255, 0.25)" />
                <View style={styles.timelineNode}>
                  <Text style={styles.timelineLabel}>PROJECTED</Text>
                  <Text style={styles.timelineValProjected}>{future_projection_data.health_score_projected}</Text>
                </View>
              </View>
            </>
          )}

          {/* SECTION 4: Future You Says (AI Message) */}
          <View style={styles.card}>
            <View style={styles.coachTitleRow}>
              <Ionicons name="sparkles-outline" size={14} color="#A78BFA" />
              <Text style={[styles.cardTitle, { marginBottom: 0 }]}>FUTURE YOU SAYS</Text>
            </View>
            <View style={styles.chatBubble}>
              <Text style={styles.coachMessage}>"{future_message}"</Text>
            </View>
          </View>

          {/* SECTION 3: What's Driving Your Future */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>WHAT'S DRIVING YOUR FUTURE?</Text>
            <View style={styles.driversContainer}>
              {drivers && drivers.map((driver, idx) => (
                <View key={idx} style={styles.driverRow}>
                  <View style={styles.driverIconContainer}>
                    {renderDriverIcon(driver.status)}
                  </View>
                  <Text style={styles.driverText}>{driver.text}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* SECTION 5: Biggest Opportunity */}
          <View style={[styles.card, styles.opportunityCard]}>
            <Text style={styles.opportunityCardTitle}>BIGGEST OPPORTUNITY</Text>
            <Text style={styles.opportunitySubtitle}>What will improve your future health score fastest?</Text>
            <View style={styles.opportunityContent}>
              <Ionicons name="trending-up" size={24} color="#A78BFA" style={{ marginRight: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.opportunityTitle}>{future_biggest_lever}</Text>
                <Text style={styles.opportunityImpact}>Potential Improvement: {future_biggest_lever_impact}</Text>
                {future_biggest_lever_insight ? (
                  <Text style={styles.opportunityInsight}>{future_biggest_lever_insight}</Text>
                ) : null}
              </View>
            </View>
          </View>

          {/* DEV SANDBOX / DEMO PANEL */}
          {currentUsername.toLowerCase().replace('@', '').startsWith('akshaysing') && (
            <View style={styles.sandboxCard}>
              <TouchableOpacity
                style={styles.sandboxHeader}
                onPress={() => setSandboxExpanded(!sandboxExpanded)}
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
                    <Text style={styles.sandboxLabel}>Future You Demo Mode</Text>
                    <TouchableOpacity
                      style={[styles.toggleBtn, demoEnabled ? styles.toggleBtnActive : {}]}
                      onPress={() => handleToggleDemoMode(!demoEnabled)}
                    >
                      <Text style={styles.toggleBtnText}>{demoEnabled ? 'ON' : 'OFF'}</Text>
                    </TouchableOpacity>
                  </View>

                  {demoEnabled && (
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.sandboxSubLabel}>Select Simulated Timeline Stage:</Text>
                      <View style={styles.demoButtonsGrid}>
                        {['day1', 'day2', 'day3', 'day4', 'day5', 'day6', 'day7', 'day8', 'day14', 'day30'].map((d) => (
                          <TouchableOpacity
                            key={d}
                            style={[styles.demoSelectBtn, demoDay === d ? styles.demoSelectBtnActive : {}]}
                            onPress={() => handleChangeDemoDay(d)}
                          >
                            <Text style={[styles.demoSelectBtnText, demoDay === d ? { color: '#000' } : {}]}>
                              {d.toUpperCase()}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {!demoEnabled && (
                    <TouchableOpacity
                      style={styles.forceCalcBtn}
                      onPress={handleForceRecalculation}
                    >
                      <Text style={styles.forceCalcBtnText}>Force Live AI Recalculation</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          <View style={{ height: 60 }} />
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#09090E',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#09090E',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12
  },
  loadingText: {
    color: '#A78BFA',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10
  },
  scrollContainer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  heroSection: {
    alignItems: 'center',
    marginVertical: 28,
  },
  heroDirection: {
    color: '#A78BFA',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  heroLabel: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroValue: {
    color: '#FFF',
    fontSize: 110,
    fontWeight: '900',
    letterSpacing: -2,
    marginVertical: 4,
  },
  heroSublabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  heroTiming: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 11,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 2,
  },
  heroContext: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    marginTop: 10,
    fontStyle: 'italic',
  },
  timelineSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111117',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  timelineNode: {
    flex: 1,
    alignItems: 'center',
  },
  timelineLabel: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  timelineVal: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '800',
  },
  timelineValProjected: {
    color: '#A78BFA',
    fontSize: 28,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#111117',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  coachTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  chatBubble: {
    backgroundColor: 'rgba(139, 92, 246, 0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.12)',
    padding: 14,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  coachName: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  coachMessage: {
    color: '#E9D5FF',
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  driversContainer: {
    gap: 10,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverIconContainer: {
    marginRight: 10,
  },
  driverText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
  },
  opportunityCard: {
    backgroundColor: '#111117',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },
  opportunityCardTitle: {
    color: '#A78BFA',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  opportunitySubtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 12,
    marginBottom: 12,
  },
  opportunityContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 139, 250, 0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.15)',
    padding: 12,
  },
  opportunityTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  opportunityImpact: {
    color: '#A78BFA',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 2,
  },
  opportunityInsight: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 18,
  },
  sandboxCard: {
    backgroundColor: '#111117',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
    marginTop: 10,
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
  forceCalcBtn: {
    backgroundColor: '#A78BFA',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  forceCalcBtnText: {
    color: '#000',
    fontSize: 11,
    fontWeight: 'bold',
  },
  lockedProgressCard: {
    backgroundColor: '#111117',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 24,
    marginVertical: 20,
  },
  lockedCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  lockedStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulsingDotGreen: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A78BFA',
  },
  lockedStatusTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  lockedBadge: {
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.25)',
  },
  lockedBadgeText: {
    color: '#A78BFA',
    fontSize: 11,
    fontWeight: 'bold',
  },
  lockedProgressBarContainer: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 16,
  },
  lockedProgressBarFill: {
    height: '100%',
    backgroundColor: '#A78BFA',
    borderRadius: 4,
  },
  lockedCardDescription: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 13,
    lineHeight: 20,
  },
});
