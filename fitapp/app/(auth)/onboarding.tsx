import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '../../constants/colors';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initHealthKit } from '../../lib/healthkit';
import { Ionicons } from '@expo/vector-icons';
import { calculateCalorieGoal } from '../../lib/userContext';
import * as Haptics from 'expo-haptics';

export default function OnboardingScreen() {
  const [step, setStep] = useState(1);
  const [gender, setGender] = useState('male');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [birthday, setBirthday] = useState('2000-01-01');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [weightLbs, setWeightLbs] = useState('');
  const [heightFeet, setHeightFeet] = useState('');
  const [heightInches, setHeightInches] = useState('');
  const [goal, setGoal] = useState('maintain');
  const [activityLevel, setActivityLevel] = useState('lightly_active');
  const [loading, setLoading] = useState(false);
  const [healthKitConnected, setHealthKitConnected] = useState(false);
  const [permissionsRequested, setPermissionsRequested] = useState(false);
  const router = useRouter();
  const { edit } = useLocalSearchParams();
  const [birthdayDate, setBirthdayDate] = useState<Date>(new Date(2000, 0, 1));

  const activityOptions = [
    { id: 'sedentary', label: 'Sedentary', desc: 'Desk job / little exercise' },
    { id: 'lightly_active', label: 'Lightly Active', desc: '1–3 workouts per week' },
    { id: 'moderately_active', label: 'Moderately Active', desc: '3–5 workouts per week' },
    { id: 'very_active', label: 'Very Active', desc: '6–7 workouts per week' },
  ];

  useEffect(() => {
    loadExistingProfile();
  }, []);

  useEffect(() => {
    if (edit === 'true') {
      setStep(1); // Start editing at step 1
    }
  }, [edit]);

  useEffect(() => {
    if (step === 4) {
      triggerPermissionsAutomatically();
    }
  }, [step]);

  const loadExistingProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
    if (data) {
      if (data.first_name) setFirstName(data.first_name);
      if (data.last_name) setLastName(data.last_name);
      if (data.username) setUsername(data.username);
      if (data.birthday) {
        setBirthday(data.birthday);
        try {
          setBirthdayDate(new Date(data.birthday));
        } catch (e) { }
      }
      if (data.weight_kg) {
        setWeight(String(data.weight_kg));
        setWeightLbs(String(Math.round(data.weight_kg * 2.20462)));
      }
      if (data.height_cm) {
        setHeight(String(data.height_cm));
        const totalIn = data.height_cm / 2.54;
        setHeightFeet(String(Math.floor(totalIn / 12)));
        setHeightInches(String(Math.round(totalIn % 12)));
      }
      if (data.gender) setGender(data.gender);
      if (data.goal) setGoal(data.goal);
      if (data.activity_level) setActivityLevel(data.activity_level);
    }

    // Pull from google metadata if firstName is still blank
    const meta = user?.user_metadata || {};
    const googleFirstName = meta.given_name || meta.first_name || '';
    const googleLastName = meta.family_name || meta.last_name || '';
    const googleFullName = meta.full_name || meta.name || '';

    if (!firstName && !data?.first_name) {
      if (googleFirstName) {
        setFirstName(googleFirstName);
        setLastName(googleLastName);
      } else if (googleFullName) {
        const parts = googleFullName.split(' ');
        setFirstName(parts[0] || '');
        setLastName(parts.slice(1).join(' ') || '');
      } else {
        const email = user.email || '';
        setFirstName(email.split('@')[0] || 'User');
        setLastName('');
      }
    }

    if (!username && !data?.username) {
      const baseName = (googleFirstName || googleFullName || user.email || 'user').toLowerCase().replace(/[^a-z0-9]/g, '');
      setUsername(baseName + Math.floor(Math.random() * 999));
    }

    try {
      const cachedActivity = await AsyncStorage.getItem(`@user_activity_level_${user.id}`);
      if (cachedActivity && (!data || !data.activity_level)) {
        setActivityLevel(cachedActivity);
      }
    } catch (e) {
      console.log('Error loading cached activity level in onboarding:', e);
    }
  };

  const calculateAge = (birthdayStr: string): number => {
    const birth = new Date(birthdayStr);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  const suggestUsername = () => {
    const base = (firstName + lastName).toLowerCase().replace(/[^a-z0-9]/g, '');
    const num = Math.floor(Math.random() * 999);
    return `${base}${num}`;
  };

  const checkUsername = async (uname: string) => {
    if (!uname || uname.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      return false;
    }
    if (!/^[a-z0-9_]+$/.test(uname)) {
      setUsernameError('Only lowercase letters, numbers, and underscores');
      return false;
    }
    setCheckingUsername(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from('users')
      .select('id')
      .eq('username', uname)
      .neq('id', user.id)
      .single();
    setCheckingUsername(false);
    if (data) {
      const suggestion = suggestUsername();
      setUsernameError(`@${uname} is taken. Try @${suggestion}`);
      return false;
    }
    setUsernameError('');
    return true;
  };

  const save = async () => {
    if (!username) { Alert.alert('Please choose a username'); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const finalFirstName = firstName || user.user_metadata?.given_name || user.user_metadata?.first_name || user.email?.split('@')[0] || 'User';
    const finalLastName = lastName || user.user_metadata?.family_name || user.user_metadata?.last_name || '';

    const calculatedAge = birthday ? calculateAge(birthday) : null;
    const ageVal = calculatedAge || 25;

    let wtVal = 70;
    let htVal = 175;

    if (unitSystem === 'imperial') {
      const lbs = parseFloat(weightLbs);
      if (!isNaN(lbs)) {
        wtVal = lbs / 2.20462;
      }
      const ft = parseFloat(heightFeet) || 0;
      const inch = parseFloat(heightInches) || 0;
      if (ft > 0 || inch > 0) {
        htVal = (ft * 12 + inch) * 2.54;
      }
    } else {
      const kg = parseFloat(weight);
      if (!isNaN(kg)) {
        wtVal = kg;
      }
      const cm = parseFloat(height);
      if (!isNaN(cm)) {
        htVal = cm;
      }
    }

    // Dynamic protein target calculations:
    // Build Muscle: 1.8g * weight
    // Lose Fat: 2.0g * weight
    // Maintain: 1.6g * weight
    let calculatedProtein = 112;
    if (goal === 'build_muscle') {
      calculatedProtein = Math.round(wtVal * 1.8);
    } else if (goal === 'lose_fat') {
      calculatedProtein = Math.round(wtVal * 2.0);
    } else {
      calculatedProtein = Math.round(wtVal * 1.6);
    }

    const calculatedCalorie = calculateCalorieGoal({
      weightKg: wtVal,
      heightCm: htVal,
      age: ageVal,
      gender: gender,
      goal: goal || 'maintain',
      activityLevel: activityLevel
    });

    const profilePayload: any = {
      id: user.id,
      first_name: finalFirstName,
      last_name: finalLastName,
      name: `${finalFirstName} ${finalLastName}`.trim(),
      username: username.toLowerCase(),
      birthday: birthday || null,
      age: calculatedAge,
      weight_kg: wtVal,
      height_cm: htVal,
      goal: goal || 'maintain',
      calorie_goal: calculatedCalorie,
      protein_goal_g: calculatedProtein,
      gender: gender,
      activity_level: activityLevel
    };

    let { error } = await supabase.from('users').upsert(profilePayload);
    if (error && (
      error.message.includes('activity_level') ||
      error.message.includes('column "activity_level"')
    )) {
      console.log('onboarding: activity_level column or schema cache error, retrying without it...');
      delete profilePayload.activity_level;
      const retryResult = await supabase.from('users').upsert(profilePayload);
      error = retryResult.error;
    }
    if (error && (
      error.message.includes('gender') ||
      error.message.includes('column "gender"')
    )) {
      console.log('onboarding: gender column or schema cache error, retrying without it...');
      delete profilePayload.gender;
      const retryResult = await supabase.from('users').upsert(profilePayload);
      error = retryResult.error;
    }

    setLoading(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      try {
        await AsyncStorage.setItem(`@user_gender_${user.id}`, gender);
        await AsyncStorage.setItem(`@user_activity_level_${user.id}`, activityLevel);
        // Default to intermediate (8k steps) progression tier
        await AsyncStorage.setItem(`@user_steps_tier_${user.id}`, 'intermediate');
        await AsyncStorage.setItem('onboarded', 'true');
      } catch (e) {
        console.log('Error setting local storage keys:', e);
      }
      router.replace('/(tabs)');
    }
  };

  const triggerPermissionsAutomatically = async () => {
    if (permissionsRequested) return;
    setPermissionsRequested(true);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Request HealthKit Native permissions
    try {
      const success = await initHealthKit();
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      }
      setHealthKitConnected(success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      console.log('Error connecting HealthKit:', e);
    }

    setLoading(false);
  };

  const goals = [
    { id: 'build_muscle', label: '💪 Build Muscle' },
    { id: 'lose_fat', label: '🔥 Lose Fat' },
    { id: 'maintain', label: '⚖️ Maintain' },
  ];

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Choose Username 🏷️</Text>
            <Text style={styles.stepSubtitle}>Usernames are unique, searchable, and serve as your primary identity.</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="e.g. akshay"
                placeholderTextColor={colors.subtext}
                value={username}
                onChangeText={t => {
                  setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''));
                  setUsernameError('');
                }}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.suggestBtn}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setUsername(suggestUsername());
                }}
              >
                <Text style={{ color: colors.accent, fontSize: 12 }}>Suggest</Text>
              </TouchableOpacity>
            </View>
            {usernameError ? <Text style={styles.errorText}>{usernameError}</Text> : null}
            {checkingUsername ? <ActivityIndicator color={colors.accent} /> : null}
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Basic Info</Text>
            <Text style={styles.stepSubtitle}>Helps us calculate accurate health score goals</Text>

            <Text style={styles.label}>Birthday</Text>
            <DateTimePicker
              value={birthdayDate}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              minimumDate={new Date(1950, 0, 1)}
              textColor="#FFFFFF"
              themeVariant="dark"
              style={{ height: 150, marginTop: -10 }}
              onChange={(event, selectedDate) => {
                if (selectedDate) {
                  setBirthdayDate(selectedDate);
                  setBirthday(selectedDate.toISOString().split('T')[0]);
                }
              }}
            />

            <Text style={styles.label}>Gender</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 8 }}>
              {['male', 'female', 'others'].map(g => (
                <TouchableOpacity
                  key={g}
                  style={[
                    styles.genderBtn,
                    gender === g && styles.genderBtnActive
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setGender(g);
                  }}
                >
                  <Text style={[
                    styles.genderBtnText,
                    gender === g && styles.genderBtnTextActive
                  ]}>
                    {g === 'male' ? '♂️ Male' : g === 'female' ? '♀️ Female' : '⚪ Others'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Unit Toggle Switch */}
            <View style={styles.toggleContainer}>
              <Text style={[styles.toggleText, unitSystem === 'imperial' && styles.toggleTextActive]}>Imperial</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.toggleTrack}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const target = unitSystem === 'metric' ? 'imperial' : 'metric';
                  setUnitSystem(target);
                  if (target === 'imperial') {
                    const wNum = parseFloat(weight);
                    if (!isNaN(wNum)) setWeightLbs(String(Math.round(wNum * 2.20462)));
                    const hNum = parseFloat(height);
                    if (!isNaN(hNum)) {
                      const totalIn = hNum / 2.54;
                      setHeightFeet(String(Math.floor(totalIn / 12)));
                      setHeightInches(String(Math.round(totalIn % 12)));
                    }
                  } else {
                    const wlNum = parseFloat(weightLbs);
                    if (!isNaN(wlNum)) setWeight(String(Math.round(wlNum / 2.20462)));
                    const ft = parseFloat(heightFeet) || 0;
                    const inch = parseFloat(heightInches) || 0;
                    if (heightFeet || heightInches) {
                      setHeight(String(Math.round((ft * 12 + inch) * 2.54)));
                    }
                  }
                }}
              >
                <View style={[
                  styles.toggleThumb,
                  unitSystem === 'metric' ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }
                ]} />
              </TouchableOpacity>
              <Text style={[styles.toggleText, unitSystem === 'metric' && styles.toggleTextActive]}>Metric</Text>
            </View>

            {unitSystem === 'metric' ? (
              <>
                <Text style={styles.label}>Weight (kg)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="70"
                  placeholderTextColor={colors.subtext}
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                />

                <Text style={styles.label}>Height (cm)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="175"
                  placeholderTextColor={colors.subtext}
                  value={height}
                  onChangeText={setHeight}
                  keyboardType="decimal-pad"
                />
              </>
            ) : (
              <>
                <Text style={styles.label}>Weight (lbs)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="154"
                  placeholderTextColor={colors.subtext}
                  value={weightLbs}
                  onChangeText={setWeightLbs}
                  keyboardType="decimal-pad"
                />

                <Text style={styles.label}>Height</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={styles.input}
                      placeholder="5"
                      placeholderTextColor={colors.subtext}
                      value={heightFeet}
                      onChangeText={setHeightFeet}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.inputSublabel}>Feet</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      style={styles.input}
                      placeholder="9"
                      placeholderTextColor={colors.subtext}
                      value={heightInches}
                      onChangeText={setHeightInches}
                      keyboardType="number-pad"
                    />
                    <Text style={styles.inputSublabel}>Inches</Text>
                  </View>
                </View>
              </>
            )}
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Your Goal 🎯</Text>
            <Text style={styles.stepSubtitle}>Choose what you want to focus on. No long descriptions.</Text>
            <View style={styles.optionGrid}>
              {goals.map(g => (
                <TouchableOpacity key={g.id} style={[styles.optionBtn, goal === g.id && styles.optionSelected]} onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setGoal(g.id);
                }}>
                  <Text style={[styles.optionText, goal === g.id && styles.optionTextSelected]}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case 4:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>How active are you? ⚡</Text>
            <Text style={styles.stepSubtitle}>This information is required for accurate calorie recommendations.</Text>
            <View style={styles.optionGrid}>
              {activityOptions.map(opt => (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.activityOptionBtn, activityLevel === opt.id && styles.activityOptionSelected]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setActivityLevel(opt.id);
                  }}
                >
                  <View style={styles.radioButtonContainer}>
                    <View style={[styles.radioButton, activityLevel === opt.id && styles.radioButtonChecked]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.activityOptionText, activityLevel === opt.id && styles.activityOptionTextSelected]}>{opt.label}</Text>
                      <Text style={styles.activityOptionDesc}>{opt.desc}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      case 5:
        return (
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>Connect Your Health Data</Text>
            <Text style={styles.stepSubtitle}>
              FitApp uses Apple Health data to automatically calculate your health score, track sleep, monitor activity, and reduce manual logging.
            </Text>

            {loading ? (
              <View style={{ marginVertical: 20, alignItems: 'center', gap: 12 }}>
                <ActivityIndicator size="large" color={colors.accent} />
                <Text style={{ color: colors.subtext, fontSize: 13 }}>Triggering native permission popups...</Text>
              </View>
            ) : (
              <View style={styles.permissionsList}>
                <View style={styles.permissionItem}>
                  <Ionicons name="checkmark-circle" size={20} color={healthKitConnected ? colors.green : colors.subtext} />
                  <Text style={[styles.permissionText, { color: healthKitConnected ? '#FFF' : colors.subtext }]}>
                    Apple Health {healthKitConnected ? 'Connected ✅' : 'Not Connected ❌'}
                  </Text>
                </View>
                <View style={styles.permissionItem}>
                  <Ionicons name="walk" size={16} color={healthKitConnected ? colors.accent : colors.subtext} style={{ marginLeft: 4 }} />
                  <Text style={[styles.permissionText, { fontSize: 13, color: healthKitConnected ? '#FFF' : colors.subtext }]}>Steps Count, Workouts, & Sleep</Text>
                </View>
              </View>
            )}
          </View>
        );
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      if (!username.trim()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Please choose a username');
        return;
      }
      const valid = await checkUsername(username);
      if (!valid) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
    } else if (step === 2) {
      if (!birthday) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Please select your birthday');
        return;
      }
      if (unitSystem === 'imperial') {
        if (!weightLbs.trim() || isNaN(parseFloat(weightLbs)) || parseFloat(weightLbs) <= 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert('Please enter a valid weight');
          return;
        }
        const ft = parseFloat(heightFeet);
        if (isNaN(ft) || ft <= 0 || ft > 9) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert('Please enter a valid height in feet');
          return;
        }
      } else {
        if (!weight.trim() || isNaN(parseFloat(weight)) || parseFloat(weight) <= 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert('Please enter a valid weight');
          return;
        }
        if (!height.trim() || isNaN(parseFloat(height)) || parseFloat(height) <= 0) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          Alert.alert('Please enter a valid height');
          return;
        }
      }
    } else if (step === 3) {
      if (!goal) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Please select your goal');
        return;
      }
    } else if (step === 4) {
      if (!activityLevel) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Please select your activity level');
        return;
      }
    }

    if (step < 5) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setStep(step + 1);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await save();
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Progress dots */}
        <View style={styles.progressDots}>
          {[1, 2, 3, 4, 5].map(i => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive, i < step && styles.dotDone]} />
          ))}
        </View>
 
        {renderStep()}
 
        <TouchableOpacity style={styles.nextBtn} onPress={handleNext} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={styles.nextBtnText}>{step === 5 ? 'Continue' : 'Next →'}</Text>
          }
        </TouchableOpacity>
 
        {step > 1 && (
          <TouchableOpacity onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setStep(step - 1);
          }}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 24, paddingBottom: 40 },
  progressDots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 60, marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#333' },
  dotActive: { backgroundColor: colors.accent, width: 24 },
  dotDone: { backgroundColor: colors.accent },
  stepContainer: { gap: 12, marginBottom: 32 },
  stepTitle: { color: colors.text, fontSize: 26, fontWeight: 'bold' },
  stepSubtitle: { color: colors.subtext, fontSize: 15, marginBottom: 8, lineHeight: 22 },
  label: { color: colors.subtext, fontSize: 13, marginTop: 8 },
  input: { backgroundColor: colors.card, color: colors.text, borderRadius: 12, padding: 16, fontSize: 16 },
  suggestBtn: { backgroundColor: colors.card, borderRadius: 12, padding: 16, justifyContent: 'center', borderWidth: 1, borderColor: colors.accent },
  errorText: { color: colors.red, fontSize: 13 },
  optionGrid: { flexDirection: 'column', gap: 12, marginTop: 12 },
  optionBtn: { backgroundColor: colors.card, borderRadius: 12, padding: 18, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  optionSelected: { borderColor: colors.accent, backgroundColor: 'rgba(167, 139, 250, 0.08)' },
  optionText: { color: colors.subtext, fontSize: 16, fontWeight: '600' },
  optionTextSelected: { color: colors.accent, fontWeight: 'bold' },
  activityOptionBtn: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  activityOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(167, 139, 250, 0.05)',
  },
  radioButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioButtonChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  activityOptionText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  activityOptionTextSelected: {
    color: colors.accent,
  },
  activityOptionDesc: {
    color: colors.subtext,
    fontSize: 12.5,
    marginTop: 2,
  },
  nextBtn: { backgroundColor: colors.accent, borderRadius: 12, padding: 18, alignItems: 'center', marginBottom: 12, marginTop: 12 },
  nextBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  backText: { color: colors.subtext, textAlign: 'center', fontSize: 14, paddingVertical: 8 },
  genderBtn: { flex: 1, backgroundColor: colors.card, borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#222' },
  genderBtnActive: { borderColor: colors.accent, backgroundColor: `${colors.accent}15` },
  genderBtnText: { color: colors.subtext, fontSize: 14, fontWeight: '600' },
  genderBtnTextActive: { color: colors.accent },
  permissionsList: {
    gap: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginTop: 12,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  permissionText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '500',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 16,
  },
  toggleText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleTextActive: {
    color: '#FFF',
  },
  toggleTrack: {
    width: 56,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#3A3A3C',
    padding: 2,
    justifyContent: 'center',
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFF',
  },
  inputSublabel: {
    color: colors.subtext,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
});
