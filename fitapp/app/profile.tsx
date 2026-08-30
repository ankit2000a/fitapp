import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Image, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { colors } from '../constants/colors';
import { useEffect, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { initHealthKit, checkHealthKitAuthorization } from '../lib/healthkit';
import { calculateCalorieGoal } from '../lib/userContext';
import { appEvents, PROFILE_UPDATED_EVENT } from '../lib/events';

const calculateAge = (birthdayStr: string): number => {
  const birth = new Date(birthdayStr);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [activityLevel, setActivityLevel] = useState('lightly_active');

  // Connection states
  const [healthKitConnected, setHealthKitConnected] = useState(false);
  const [checkingConnections, setCheckingConnections] = useState(true);

  // Edit Modals visibility
  const [editProfileVisible, setEditProfileVisible] = useState(false);
  const [editHealthVisible, setEditHealthVisible] = useState(false);
  const [editGoalVisible, setEditGoalVisible] = useState(false);
  
  // Custom Cropper states
  const [cropperVisible, setCropperVisible] = useState(false);
  const [cropImageUri, setCropImageUri] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });
  const [zoomScale, setZoomScale] = useState(1);

  // Form states
  const [editUsername, setEditUsername] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editBirthday, setEditBirthday] = useState('2000-01-01');
  const [editBirthdayDate, setEditBirthdayDate] = useState<Date>(new Date(2000, 0, 1));
  const [editHeight, setEditHeight] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editUnitSystem, setEditUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [editWeightLbs, setEditWeightLbs] = useState('');
  const [editHeightFeet, setEditHeightFeet] = useState('');
  const [editHeightInches, setEditHeightInches] = useState('');
  const [editGender, setEditGender] = useState('male');
  const [editGoal, setEditGoal] = useState('maintain');
  const [privacyOption, setPrivacyOption] = useState<'public' | 'private'>('private');

  useEffect(() => {
    loadProfile();
    checkServicesConnection();
  }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('users').select('*').eq('id', user.id).single();
      
      if (data) {
        setProfile(data);
        setEditUsername(data.username || '');
        setEditFirstName(data.first_name || '');
        setEditLastName(data.last_name || '');
        setEditBirthday(data.birthday || '2000-01-01');
        if (data.birthday) {
          setEditBirthdayDate(new Date(data.birthday));
        }
        if (data.weight_kg) {
          setEditWeight(String(data.weight_kg));
          setEditWeightLbs(String(Math.round(data.weight_kg * 2.20462)));
        } else {
          setEditWeight('');
          setEditWeightLbs('');
        }
        if (data.height_cm) {
          setEditHeight(String(data.height_cm));
          const totalIn = data.height_cm / 2.54;
          setEditHeightFeet(String(Math.floor(totalIn / 12)));
          setEditHeightInches(String(Math.round(totalIn % 12)));
        } else {
          setEditHeight('');
          setEditHeightFeet('');
          setEditHeightInches('');
        }
        setEditGender(data.gender || 'male');
        setEditGoal(data.goal || 'maintain');
        
        if (data.avatar_url) {
          setAvatarUri(data.avatar_url);
        }
      }

      // Load Privacy option
      if (data && data.privacy) {
        setPrivacyOption(data.privacy as 'public' | 'private');
        await AsyncStorage.setItem(`@user_privacy_${user.id}`, data.privacy);
      } else {
        const savedPrivacy = await AsyncStorage.getItem(`@user_privacy_${user.id}`);
        if (savedPrivacy === 'public' || savedPrivacy === 'private') {
          setPrivacyOption(savedPrivacy as 'public' | 'private');
        } else {
          setPrivacyOption('private');
        }
      }

      // Check cache for avatar
      const cachedAvatar = await AsyncStorage.getItem(`@user_avatar_${user.id}`);
      if (cachedAvatar && !data?.avatar_url) {
        setAvatarUri(cachedAvatar);
      }

      // Retrieve activity level with AsyncStorage fallback
      let actLevel = data?.activity_level;
      if (!actLevel && user?.id) {
        try {
          actLevel = await AsyncStorage.getItem(`@user_activity_level_${user.id}`) || 'lightly_active';
        } catch (e) {
          actLevel = 'lightly_active';
        }
      }
      setActivityLevel(actLevel || 'lightly_active');
    } catch (e) {
      console.log('Error loading profile:', e);
    }
  };


  const getRecommendedProtein = (weightKg: number, goal: string): number => {
    let multiplier = 1.6;
    if (goal === 'build_muscle') {
      multiplier = 1.8;
    } else if (goal === 'lose_fat') {
      multiplier = 2.0;
    }
    return Math.round(weightKg * multiplier);
  };

  const updateProteinInDb = async (newVal: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('users')
        .update({ protein_goal_g: newVal })
        .eq('id', user.id);
      if (error) throw error;
      appEvents.emit(PROFILE_UPDATED_EVENT);
    } catch (e) {
      console.log('Error updating protein goal:', e);
    }
  };

  const updateCalorieInDb = async (newVal: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase
        .from('users')
        .update({ calorie_goal: newVal })
        .eq('id', user.id);
      if (error) throw error;
      appEvents.emit(PROFILE_UPDATED_EVENT);
    } catch (e) {
      console.log('Error updating calorie goal:', e);
    }
  };

  const handleDecreaseProtein = () => {
    const recProtein = getRecommendedProtein(profile?.weight_kg || 70, profile?.goal || 'maintain');
    const currentVal = profile?.protein_goal_g || recProtein;
    const newVal = Math.max(recProtein - 15, currentVal - 5);
    setProfile((prev: any) => prev ? { ...prev, protein_goal_g: newVal } : prev);
    updateProteinInDb(newVal);
  };

  const handleIncreaseProtein = () => {
    const recProtein = getRecommendedProtein(profile?.weight_kg || 70, profile?.goal || 'maintain');
    const currentVal = profile?.protein_goal_g || recProtein;
    const newVal = Math.min(recProtein + 15, currentVal + 5);
    setProfile((prev: any) => prev ? { ...prev, protein_goal_g: newVal } : prev);
    updateProteinInDb(newVal);
  };

  const handleDecreaseCalorie = () => {
    const ageVal = profile?.birthday ? calculateAge(profile.birthday) : 25;
    const recCalorie = calculateCalorieGoal({
      weightKg: profile?.weight_kg || 70,
      heightCm: profile?.height_cm || 175,
      age: ageVal,
      gender: profile?.gender || 'male',
      goal: profile?.goal || 'maintain',
      activityLevel: activityLevel
    });
    const currentVal = profile?.calorie_goal || recCalorie;
    const newVal = Math.max(recCalorie - 300, currentVal - 100);
    setProfile((prev: any) => prev ? { ...prev, calorie_goal: newVal } : prev);
    updateCalorieInDb(newVal);
  };

  const handleIncreaseCalorie = () => {
    const ageVal = profile?.birthday ? calculateAge(profile.birthday) : 25;
    const recCalorie = calculateCalorieGoal({
      weightKg: profile?.weight_kg || 70,
      heightCm: profile?.height_cm || 175,
      age: ageVal,
      gender: profile?.gender || 'male',
      goal: profile?.goal || 'maintain',
      activityLevel: activityLevel
    });
    const currentVal = profile?.calorie_goal || recCalorie;
    const newVal = Math.min(recCalorie + 300, currentVal + 100);
    setProfile((prev: any) => prev ? { ...prev, calorie_goal: newVal } : prev);
    updateCalorieInDb(newVal);
  };

  const checkServicesConnection = async () => {
    setCheckingConnections(true);
    try {
      // Check Apple HealthKit
      const isAuthorized = await checkHealthKitAuthorization();
      setHealthKitConnected(isAuthorized);
    } catch (e) {
      console.log('Error checking connected services:', e);
    } finally {
      setCheckingConnections(false);
    }
  };

  const handleConnectHealthKit = async () => {
    try {
      setCheckingConnections(true);
      const success = await initHealthKit();
      setHealthKitConnected(success);
      Alert.alert(
        success ? 'Connected! ✅' : 'Connection Failed ❌',
        success 
          ? 'FitApp has connected to Apple Health successfully.' 
          : 'Please enable read permissions for Steps, Sleep, Active Energy, and Workouts in iOS Settings -> Health.'
      );
    } catch (e) {
      Alert.alert('Error', 'Failed to connect HealthKit');
    } finally {
      setCheckingConnections(false);
    }
  };


  // Profile Save Actions
  const handleSaveAccount = async () => {
    if (!editUsername.trim() || editUsername.length < 3) {
      Alert.alert('Invalid Username', 'Username must be at least 3 characters long.');
      return;
    }
    
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Uniqueness check
      const { data: taken } = await supabase
        .from('users')
        .select('id')
        .eq('username', editUsername.toLowerCase())
        .neq('id', user.id)
        .maybeSingle();

      if (taken) {
        Alert.alert('Username Taken', 'This username is already in use by another user.');
        setUploading(false);
        return;
      }

      const { error } = await supabase
        .from('users')
        .update({
          username: editUsername.toLowerCase(),
          first_name: editFirstName,
          last_name: editLastName,
          name: `${editFirstName} ${editLastName}`.trim()
        })
        .eq('id', user.id);

      if (error) throw error;
      
      await loadProfile();
      setEditProfileVisible(false);
      Alert.alert('Success 🎉', 'Account details updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveMeasurements = async () => {
    let wtVal = 70;
    let htVal = 175;

    if (editUnitSystem === 'imperial') {
      const lbs = parseFloat(editWeightLbs);
      if (isNaN(lbs) || lbs <= 0) {
        Alert.alert('Error', 'Please enter a valid weight in lbs');
        return;
      }
      wtVal = lbs / 2.20462;
      const ft = parseFloat(editHeightFeet) || 0;
      const inch = parseFloat(editHeightInches) || 0;
      if (ft <= 0 || ft > 9) {
        Alert.alert('Error', 'Please enter a valid height in feet');
        return;
      }
      htVal = (ft * 12 + inch) * 2.54;
    } else {
      const kg = parseFloat(editWeight);
      const cm = parseFloat(editHeight);
      if (isNaN(kg) || kg <= 0 || isNaN(cm) || cm <= 0) {
        Alert.alert('Error', 'Please enter a valid weight and height');
        return;
      }
      wtVal = kg;
      htVal = cm;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      const ageVal = editBirthday ? calculateAge(editBirthday) : 25;

      // Calculate calorie target with updated values
      const calorieTarget = calculateCalorieGoal({
        weightKg: wtVal,
        heightCm: htVal,
        age: ageVal,
        gender: editGender,
        goal: profile?.goal || 'maintain',
        activityLevel: activityLevel
      });

      const userGoal = profile?.goal || 'maintain';
      const proteinTarget = getRecommendedProtein(wtVal, userGoal);

      const { error } = await supabase
        .from('users')
        .update({
          birthday: editBirthday,
          age: ageVal,
          weight_kg: wtVal,
          height_cm: htVal,
          gender: editGender,
          calorie_goal: calorieTarget,
          protein_goal_g: proteinTarget
        })
        .eq('id', user.id);

      if (error) throw error;

      await AsyncStorage.setItem(`@user_gender_${user.id}`, editGender);
      await AsyncStorage.setItem(`@user_units_${user.id}`, editUnitSystem);
      await loadProfile();
      appEvents.emit(PROFILE_UPDATED_EVENT);
      setEditHealthVisible(false);
      Alert.alert('Success 🎉', 'Health measurements updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveGoal = async () => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const calorieTarget = calculateCalorieGoal({
        weightKg: profile?.weight_kg || 70,
        heightCm: profile?.height_cm || 175,
        age: profile?.age || 25,
        gender: profile?.gender || 'male',
        goal: editGoal,
        activityLevel: activityLevel
      });

      const proteinTarget = getRecommendedProtein(profile?.weight_kg || 70, editGoal);

      const { error } = await supabase
        .from('users')
        .update({ 
          goal: editGoal,
          calorie_goal: calorieTarget,
          protein_goal_g: proteinTarget
        })
        .eq('id', user.id);

      if (error) throw error;

      await loadProfile();
      appEvents.emit(PROFILE_UPDATED_EVENT);
      setEditGoalVisible(false);
      Alert.alert('Goal Changed 🎉', `Fitness goal updated to ${editGoal.replace('_', ' ').toUpperCase()}.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSavePrivacy = async (opt: 'public' | 'private') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { error } = await supabase
        .from('users')
        .update({ privacy: opt })
        .eq('id', user.id);
        
      if (error) throw error;
      
      await AsyncStorage.setItem(`@user_privacy_${user.id}`, opt);
      setPrivacyOption(opt);
    } catch (e: any) {
      console.log('Error saving privacy:', e);
      Alert.alert('Error', 'Failed to update privacy setting: ' + e.message);
    }
  };

  // Image Upload Logic (Cropper and picker)
  // Image Upload Logic (Cropper and picker)
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera roll permissions to upload a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setImageSize({ width: asset.width, height: asset.height });
      setCropImageUri(asset.uri);
      setZoomScale(1);
      setScrollOffset({ x: 0, y: 0 });
      setCropperVisible(true);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Sorry, we need camera permissions to take a profile picture.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.9,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setImageSize({ width: asset.width, height: asset.height });
      setCropImageUri(asset.uri);
      setZoomScale(1);
      setScrollOffset({ x: 0, y: 0 });
      setCropperVisible(true);
    }
  };

  const handleCrop = async () => {
    if (!cropImageUri || !imageSize.width || !imageSize.height) return;
    
    try {
      setUploading(true);
      setCropperVisible(false);

      const origWidth = imageSize.width;
      const origHeight = imageSize.height;
      const scale = Math.max(280 / origWidth, 280 / origHeight);
      const currentScale = scale * zoomScale;

      let originX = scrollOffset.x / currentScale;
      let originY = scrollOffset.y / currentScale;
      let sizeX = 280 / currentScale;
      let sizeY = 280 / currentScale;

      if (originX < 0) { originX = 0; }
      if (originY < 0) { originY = 0; }
      if (originX + sizeX > origWidth) { sizeX = origWidth - originX; }
      if (originY + sizeY > origHeight) { sizeY = origHeight - originY; }

      const manipResult = await ImageManipulator.manipulateAsync(
        cropImageUri,
        [
          {
            crop: {
              originX: Math.round(originX),
              originY: Math.round(originY),
              width: Math.round(sizeX),
              height: Math.round(sizeY),
            },
          },
          {
            resize: { width: 120, height: 120 },
          },
        ],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      const base64Image = `data:image/jpeg;base64,${manipResult.base64}`;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      await supabase.from('users').update({ avatar_url: base64Image }).eq('id', user.id);
      await AsyncStorage.setItem(`@user_avatar_${user.id}`, base64Image);
      setAvatarUri(base64Image);
      Alert.alert('Success 🎉', 'Profile picture updated successfully!');
    } catch (e: any) {
      Alert.alert('Error', 'Failed to crop/upload image: ' + e.message);
    } finally {
      setUploading(false);
      setCropImageUri(null);
    }
  };

  const removePhoto = async () => {
    Alert.alert('Remove Photo', 'Are you sure you want to remove your profile picture?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setUploading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            await supabase.from('users').update({ avatar_url: null }).eq('id', user.id);
            await AsyncStorage.removeItem(`@user_avatar_${user.id}`);
            setAvatarUri(null);
            Alert.alert('Success', 'Profile picture removed.');
          } catch (e: any) {
            Alert.alert('Error', 'Failed to remove picture: ' + e.message);
          } finally {
            setUploading(false);
          }
        }
      }
    ]);
  };

  const handleAvatarPress = () => {
    Alert.alert(
      'Profile Photo',
      'Choose an option to update your profile photo',
      [
        { text: 'Take Photo', onPress: takePhoto },
        { text: 'Choose from Library', onPress: pickImage },
        ...(avatarUri ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: removePhoto }] : []),
        { text: 'Cancel', style: 'cancel' as const }
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '⚠️ Delete Account',
      'Are you absolutely sure? This will permanently delete your user profile, friendships, logs, and all related fitness history. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Permanently Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setUploading(true);
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                // Explicitly delete user's data from related public tables to prevent lingering data
                try {
                  await supabase.from('friendships').delete().or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
                  await supabase.from('food_logs').delete().eq('user_id', user.id);
                  await supabase.from('health_scores').delete().eq('user_id', user.id);
                } catch (dbErr) {
                  console.warn('Direct cleanup of related tables failed:', dbErr);
                }

                // Delete user auth account and public entries via secure RPC
                const { error: rpcError } = await supabase.rpc('delete_user_account');
                if (rpcError) {
                  console.warn('delete_user_account RPC failed, falling back to direct public table delete:', rpcError.message);
                  await supabase.from('users').delete().eq('id', user.id);
                }
                await supabase.auth.signOut();
                router.replace('/(auth)/login');
              }
            } catch (e: any) {
              Alert.alert('Error deleting account', e.message);
            } finally {
              setUploading(false);
            }
          }
        }
      ]
    );
  };

  const logout = async () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/(auth)/login');
        }
      }
    ]);
  };

  const recProtein = profile ? getRecommendedProtein(profile.weight_kg || 70, profile.goal || 'maintain') : 105;
  const proteinGoal = profile ? (profile.protein_goal_g || recProtein) : 105;
  const isMinProtein = proteinGoal <= recProtein - 15;
  const isMaxProtein = proteinGoal >= recProtein + 15;

  const ageVal = profile?.birthday ? calculateAge(profile.birthday) : 25;
  const recCalorie = profile ? calculateCalorieGoal({
    weightKg: profile.weight_kg || 70,
    heightCm: profile.height_cm || 175,
    age: ageVal,
    gender: profile.gender || 'male',
    goal: profile.goal || 'maintain',
    activityLevel: activityLevel
  }) : 2000;
  const calorieGoal = profile ? (profile.calorie_goal || recCalorie) : 2000;
  const isMinCalorie = calorieGoal <= recCalorie - 300;
  const isMaxCalorie = calorieGoal >= recCalorie + 300;
  const origWidth = imageSize.width;
  const origHeight = imageSize.height;
  const scale = origWidth && origHeight ? Math.max(280 / origWidth, 280 / origHeight) : 1;
  const displayWidth = origWidth * scale;
  const displayHeight = origHeight * scale;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.back}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Account Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      {profile && (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          
          {/* SECTION 1: ACCOUNT */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>ACCOUNT</Text>
            
            <View style={styles.accountRow}>
              <TouchableOpacity onPress={handleAvatarPress} disabled={uploading} activeOpacity={0.8}>
                <View style={styles.avatarLarge}>
                  {uploading ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
                  ) : (
                    <Text style={styles.avatarText}>
                      {profile.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
              
              <View style={styles.accountTextCol}>
                <Text style={styles.profileNameText}>{profile.name}</Text>
                <Text style={styles.profileUsernameText}>@{profile.username}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.actionRowBtn} onPress={() => setEditProfileVisible(true)}>
              <Ionicons name="create-outline" size={16} color={colors.accent} />
              <Text style={styles.actionRowText}>Edit Profile Info</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity 
              style={styles.publicProfileLink}
              onPress={() => router.push(`/userProfile?id=${profile.id}`)}
            >
              <Ionicons name="trophy-outline" size={16} color="#10B981" />
              <Text style={styles.publicProfileLinkText}>View My Public Profile & Badges</Text>
              <Ionicons name="chevron-forward" size={14} color="rgba(255, 255, 255, 0.3)" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>
          </View>

          {/* SECTION 2: HEALTH PROFILE */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>HEALTH PROFILE</Text>
            
            <View style={styles.healthStatsGrid}>
              <View style={styles.healthStatItem}>
                <Text style={styles.healthStatLabel}>AGE</Text>
                <Text style={styles.healthStatValue}>{profile.age || '—'}</Text>
              </View>
              <View style={styles.healthStatItem}>
                <Text style={styles.healthStatLabel}>HEIGHT</Text>
                <Text style={styles.healthStatValue}>{profile.height_cm ? `${profile.height_cm} cm` : '—'}</Text>
              </View>
              <View style={styles.healthStatItem}>
                <Text style={styles.healthStatLabel}>WEIGHT</Text>
                <Text style={styles.healthStatValue}>{profile.weight_kg ? `${profile.weight_kg} kg` : '—'}</Text>
              </View>
              <View style={styles.healthStatItem}>
                <Text style={styles.healthStatLabel}>GENDER</Text>
                <Text style={[styles.healthStatValue, { textTransform: 'capitalize' }]}>{profile.gender || '—'}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.actionRowBtn} onPress={() => setEditHealthVisible(true)}>
              <Ionicons name="scale-outline" size={16} color={colors.accent} />
              <Text style={styles.actionRowText}>Update Measurements</Text>
            </TouchableOpacity>
          </View>

          {/* SECTION 3: FITNESS GOAL */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>FITNESS GOAL</Text>
            
            {/* Goal Selector row */}
            <TouchableOpacity 
              style={styles.inlineGoalRow} 
              onPress={() => setEditGoalVisible(true)}
              activeOpacity={0.7}
            >
              <View style={styles.inlineGoalTextContainer}>
                <Text style={styles.inlineGoalLabel}>Goal</Text>
                <Text style={styles.inlineGoalValue}>
                  {profile.goal === 'build_muscle' ? 'Build Muscle' : profile.goal === 'lose_fat' ? 'Lose Fat' : 'Maintain Weight'}
                </Text>
              </View>
              <View style={styles.inlineGoalChangeBtn}>
                <Text style={styles.inlineGoalChangeText}>Change</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.accent} />
              </View>
            </TouchableOpacity>

            {/* Protein Customization row */}
            <View style={styles.customizerRow}>
              <Text style={styles.customizerLabel}>Protein Goal</Text>
              <View style={styles.customizerControls}>
                <TouchableOpacity 
                  style={[styles.customizerBtn, isMinProtein && styles.customizerBtnDisabled]} 
                  onPress={handleDecreaseProtein}
                  disabled={isMinProtein}
                  activeOpacity={0.6}
                >
                  <Ionicons name="remove" size={18} color={isMinProtein ? 'rgba(255,255,255,0.2)' : '#FFF'} />
                </TouchableOpacity>
                <Text style={styles.customizerValueText}>{proteinGoal}g</Text>
                <TouchableOpacity 
                  style={[styles.customizerBtn, isMaxProtein && styles.customizerBtnDisabled]} 
                  onPress={handleIncreaseProtein}
                  disabled={isMaxProtein}
                  activeOpacity={0.6}
                >
                  <Ionicons name="add" size={18} color={isMaxProtein ? 'rgba(255,255,255,0.2)' : '#FFF'} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Calorie Customization row */}
            <View style={styles.customizerRow}>
              <Text style={styles.customizerLabel}>Calorie Goal</Text>
              <View style={styles.customizerControls}>
                <TouchableOpacity 
                  style={[styles.customizerBtn, isMinCalorie && styles.customizerBtnDisabled]} 
                  onPress={handleDecreaseCalorie}
                  disabled={isMinCalorie}
                  activeOpacity={0.6}
                >
                  <Ionicons name="remove" size={18} color={isMinCalorie ? 'rgba(255,255,255,0.2)' : '#FFF'} />
                </TouchableOpacity>
                <Text style={styles.customizerValueText}>{calorieGoal} kcal</Text>
                <TouchableOpacity 
                  style={[styles.customizerBtn, isMaxCalorie && styles.customizerBtnDisabled]} 
                  onPress={handleIncreaseCalorie}
                  disabled={isMaxCalorie}
                  activeOpacity={0.6}
                >
                  <Ionicons name="add" size={18} color={isMaxCalorie ? 'rgba(255,255,255,0.2)' : '#FFF'} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* SECTION 4: CONNECTED SERVICES */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>CONNECTED SERVICES</Text>

            {checkingConnections ? (
              <ActivityIndicator color={colors.accent} style={{ marginVertical: 10 }} />
            ) : (
              <View style={{ gap: 12 }}>
                <View style={styles.serviceItem}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="heart" size={24} color="#FF2D55" />
                    <View>
                      <Text style={styles.serviceNameText}>Apple Health</Text>
                      <Text style={styles.serviceStatusText}>
                        {healthKitConnected ? 'Connected ✅' : 'Not Connected ❌'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity style={styles.connectServiceBtn} onPress={handleConnectHealthKit}>
                    <Text style={styles.connectServiceText}>
                      {healthKitConnected ? 'Reconnect' : 'Connect'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Sub-permissions list */}
                <View style={styles.permissionsIndicatorCard}>
                  <View style={styles.permissionBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={healthKitConnected ? '#00E676' : 'rgba(255,255,255,0.2)'} />
                    <Text style={[styles.permissionBadgeText, { color: healthKitConnected ? '#FFF' : 'rgba(255,255,255,0.4)' }]}>Steps</Text>
                  </View>
                  <View style={styles.permissionBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={healthKitConnected ? '#00E676' : 'rgba(255,255,255,0.2)'} />
                    <Text style={[styles.permissionBadgeText, { color: healthKitConnected ? '#FFF' : 'rgba(255,255,255,0.4)' }]}>Sleep</Text>
                  </View>
                  <View style={styles.permissionBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={healthKitConnected ? '#00E676' : 'rgba(255,255,255,0.2)'} />
                    <Text style={[styles.permissionBadgeText, { color: healthKitConnected ? '#FFF' : 'rgba(255,255,255,0.4)' }]}>Workouts</Text>
                  </View>
                  <View style={styles.permissionBadge}>
                    <Ionicons name="checkmark-circle" size={12} color={healthKitConnected ? '#00E676' : 'rgba(255,255,255,0.2)'} />
                    <Text style={[styles.permissionBadgeText, { color: healthKitConnected ? '#FFF' : 'rgba(255,255,255,0.4)' }]}>Active Energy</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* SECTION 5: PRIVACY */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>PRIVACY</Text>
            <View style={{ gap: 8, marginTop: 4 }}>
              {[
                { key: 'public', label: '🌐 Public Profile', desc: 'Anyone on FitApp Pulse can look up your score, level, and achievements.' },
                { key: 'private', label: '🔒 Private Profile', desc: 'Detailed scoring charts and logging stats are restricted to accepted friends.' }
              ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.privacySelectCard, privacyOption === opt.key && styles.privacySelectCardActive]}
                  onPress={() => handleSavePrivacy(opt.key as any)}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <Text style={styles.privacyOptionTitle}>{opt.label}</Text>
                    {privacyOption === opt.key && <Ionicons name="checkmark" size={16} color={colors.accent} />}
                  </View>
                  <Text style={styles.privacyOptionDesc}>{opt.desc}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* SECTION 6: ACCOUNT MANAGEMENT */}
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>ACCOUNT MANAGEMENT</Text>
            
            <View style={styles.managementList}>
              <TouchableOpacity style={styles.managementRowBtn} onPress={() => Alert.alert('Terms of Service', 'FitApp terms of service document placeholder.')}>
                <Text style={styles.managementText}>Terms of Service</Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255, 255, 255, 0.25)" />
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.managementRowBtn} onPress={() => Alert.alert('Privacy Policy', 'FitApp privacy policy document placeholder.')}>
                <Text style={styles.managementText}>Privacy Policy</Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255, 255, 255, 0.25)" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.managementRowBtn} onPress={() => Alert.alert('Contact Support', 'Submit a support ticket: akshay@fitapp.app')}>
                <Text style={styles.managementText}>Support & Feedback</Text>
                <Ionicons name="chevron-forward" size={14} color="rgba(255, 255, 255, 0.25)" />
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity style={styles.managementRowBtn} onPress={handleDeleteAccount}>
                <Text style={{ color: colors.red, fontWeight: 'bold' }}>Delete Account</Text>
                <Ionicons name="trash-outline" size={14} color={colors.red} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.logoutBtnRed} onPress={logout}>
                <Ionicons name="log-out-outline" size={18} color="#FFF" />
                <Text style={styles.logoutBtnText}>Log Out Account</Text>
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      )}

      {/* MODAL 1: EDIT PROFILE */}
      <Modal visible={editProfileVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Profile Info</Text>
                <TouchableOpacity onPress={() => setEditProfileVisible(false)}>
                  <Ionicons name="close" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
                <Text style={styles.fieldLabel}>USERNAME (UNIQUE)</Text>
                <TextInput 
                  style={styles.textInput}
                  value={editUsername}
                  onChangeText={t => setEditUsername(t.replace(/[^a-zA-Z0-9_]/g, ''))}
                  autoCapitalize="none"
                  placeholder="username"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />

                <Text style={styles.fieldLabel}>FIRST NAME</Text>
                <TextInput 
                  style={styles.textInput}
                  value={editFirstName}
                  onChangeText={setEditFirstName}
                  placeholder="First Name"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />

                <Text style={styles.fieldLabel}>LAST NAME</Text>
                <TextInput 
                  style={styles.textInput}
                  value={editLastName}
                  onChangeText={setEditLastName}
                  placeholder="Last Name"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                />

                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveAccount} disabled={uploading}>
                  {uploading ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Save Account Details</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL 2: UPDATE MEASUREMENTS */}
      <Modal visible={editHealthVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Update Measurements</Text>
                <TouchableOpacity onPress={() => setEditHealthVisible(false)}>
                  <Ionicons name="close" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 32 }}>
                <Text style={styles.fieldLabel}>BIRTHDAY (AGE CALCULATION)</Text>
                <DateTimePicker
                  value={editBirthdayDate}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  textColor="#FFFFFF"
                  themeVariant="dark"
                  style={{ height: 120, marginVertical: -10 }}
                  onChange={(e, date) => {
                    if (date) {
                      setEditBirthdayDate(date);
                      setEditBirthday(date.toISOString().split('T')[0]);
                    }
                  }}
                />

                <Text style={styles.fieldLabel}>GENDER</Text>
                <View style={styles.genderRow}>
                  {['male', 'female', 'others'].map(g => (
                    <TouchableOpacity
                      key={g}
                      style={[styles.genderBtn, editGender === g && styles.genderBtnActive]}
                      onPress={() => setEditGender(g)}
                    >
                      <Text style={[styles.genderBtnText, editGender === g && styles.genderBtnTextActive]}>
                        {g === 'male' ? '♂️ Male' : g === 'female' ? '♀️ Female' : '⚪ Others'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Unit Toggle Switch */}
                <View style={styles.toggleContainer}>
                  <Text style={[styles.toggleText, editUnitSystem === 'imperial' && styles.toggleTextActive]}>Imperial</Text>
                  <TouchableOpacity 
                    activeOpacity={0.8}
                    style={styles.toggleTrack}
                    onPress={() => {
                      const target = editUnitSystem === 'metric' ? 'imperial' : 'metric';
                      setEditUnitSystem(target);
                      if (target === 'imperial') {
                        const wNum = parseFloat(editWeight);
                        if (!isNaN(wNum)) setEditWeightLbs(String(Math.round(wNum * 2.20462)));
                        const hNum = parseFloat(editHeight);
                        if (!isNaN(hNum)) {
                          const totalIn = hNum / 2.54;
                          setEditHeightFeet(String(Math.floor(totalIn / 12)));
                          setEditHeightInches(String(Math.round(totalIn % 12)));
                        }
                      } else {
                        const wlNum = parseFloat(editWeightLbs);
                        if (!isNaN(wlNum)) setEditWeight(String(Math.round(wlNum / 2.20462)));
                        const ft = parseFloat(editHeightFeet) || 0;
                        const inch = parseFloat(editHeightInches) || 0;
                        if (editHeightFeet || editHeightInches) {
                          setEditHeight(String(Math.round((ft * 12 + inch) * 2.54)));
                        }
                      }
                    }}
                  >
                    <View style={[
                      styles.toggleThumb,
                      editUnitSystem === 'metric' ? { alignSelf: 'flex-end' } : { alignSelf: 'flex-start' }
                    ]} />
                  </TouchableOpacity>
                  <Text style={[styles.toggleText, editUnitSystem === 'metric' && styles.toggleTextActive]}>Metric</Text>
                </View>

                {editUnitSystem === 'metric' ? (
                  <>
                    <Text style={styles.fieldLabel}>WEIGHT (KG)</Text>
                    <TextInput 
                      style={styles.textInput}
                      keyboardType="decimal-pad"
                      value={editWeight}
                      onChangeText={setEditWeight}
                      placeholder="70"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                    />

                    <Text style={styles.fieldLabel}>HEIGHT (CM)</Text>
                    <TextInput 
                      style={styles.textInput}
                      keyboardType="decimal-pad"
                      value={editHeight}
                      onChangeText={setEditHeight}
                      placeholder="175"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>WEIGHT (LBS)</Text>
                    <TextInput 
                      style={styles.textInput}
                      keyboardType="decimal-pad"
                      value={editWeightLbs}
                      onChangeText={setEditWeightLbs}
                      placeholder="154"
                      placeholderTextColor="rgba(255,255,255,0.3)"
                    />

                    <Text style={styles.fieldLabel}>HEIGHT</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <TextInput 
                          style={styles.textInput}
                          keyboardType="number-pad"
                          value={editHeightFeet}
                          onChangeText={setEditHeightFeet}
                          placeholder="5"
                          placeholderTextColor="rgba(255,255,255,0.3)"
                        />
                        <Text style={styles.inputSublabel}>Feet</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextInput 
                          style={styles.textInput}
                          keyboardType="number-pad"
                          value={editHeightInches}
                          onChangeText={setEditHeightInches}
                          placeholder="9"
                          placeholderTextColor="rgba(255,255,255,0.3)"
                        />
                        <Text style={styles.inputSublabel}>Inches</Text>
                      </View>
                    </View>
                  </>
                )}

                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveMeasurements} disabled={uploading}>
                  {uploading ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Update Physical Stats</Text>}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL 3: CHANGE FITNESS GOAL */}
      <Modal visible={editGoalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Fitness Goal</Text>
              <TouchableOpacity onPress={() => setEditGoalVisible(false)}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 32 }}>
              {[
                { id: 'build_muscle', label: '💪 Build Muscle', desc: 'Increases protein target (1.8g/kg) and structures quests around lean mass gains.' },
                { id: 'lose_fat', label: '🔥 Lose Fat', desc: 'Sets a high protein target (2.0g/kg) to preserve muscle during caloric deficits.' },
                { id: 'maintain', label: '⚖️ Maintain', desc: 'Sets base target (1.6g/kg) to stabilize weight and improve general metabolism.' }
              ].map(g => (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.goalSelectCard, editGoal === g.id && styles.goalSelectCardActive]}
                  onPress={() => setEditGoal(g.id)}
                >
                  <Text style={[styles.goalSelectText, editGoal === g.id && styles.goalSelectTextActive]}>
                    {g.label}
                  </Text>
                  <Text style={styles.goalSelectDesc}>{g.desc}</Text>
                </TouchableOpacity>
              ))}

              <TouchableOpacity style={[styles.saveBtn, { marginTop: 14 }]} onPress={handleSaveGoal} disabled={uploading}>
                {uploading ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Update Goal Preference</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Circular Move & Scale Cropper Modal */}
      <Modal visible={cropperVisible} animationType="slide" transparent={false}>
        <View style={[styles.cropperContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.cropperHeader}>
            <TouchableOpacity onPress={() => { setCropperVisible(false); setCropImageUri(null); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.cropperCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.cropperTitle}>Move and Scale</Text>
            <TouchableOpacity onPress={handleCrop} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.cropperDone}>Done</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.cropperWorkArea}>
            {cropImageUri && (
              <View style={styles.viewportContainer}>
                <ScrollView
                  horizontal={true}
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                  maximumZoomScale={5}
                  minimumZoomScale={1}
                  decelerationRate="fast"
                  scrollEventThrottle={16}
                  bounces={false}
                  bouncesZoom={false}
                  alwaysBounceHorizontal={false}
                  alwaysBounceVertical={false}
                  onScroll={(e) => {
                    setScrollOffset({
                      x: e.nativeEvent.contentOffset.x,
                      y: e.nativeEvent.contentOffset.y,
                    });
                    if (e.nativeEvent.zoomScale) {
                      setZoomScale(e.nativeEvent.zoomScale);
                    }
                  }}
                  onMomentumScrollEnd={(e) => {
                    setScrollOffset({
                      x: e.nativeEvent.contentOffset.x,
                      y: e.nativeEvent.contentOffset.y,
                    });
                    if (e.nativeEvent.zoomScale) {
                      setZoomScale(e.nativeEvent.zoomScale);
                    }
                  }}
                  onScrollEndDrag={(e) => {
                    setScrollOffset({
                      x: e.nativeEvent.contentOffset.x,
                      y: e.nativeEvent.contentOffset.y,
                    });
                    if (e.nativeEvent.zoomScale) {
                      setZoomScale(e.nativeEvent.zoomScale);
                    }
                  }}
                  style={styles.cropperScrollView}
                  contentContainerStyle={{ width: displayWidth, height: displayHeight }}
                >
                  <Image source={{ uri: cropImageUri }} style={{ width: displayWidth, height: displayHeight }} resizeMode="cover" />
                </ScrollView>
                <View style={styles.maskCircleCutout} pointerEvents="none" />
                <View style={styles.cropCircleBorder} pointerEvents="none" />
              </View>
            )}
          </View>

          <View style={styles.cropperFooter}>
            <Text style={styles.cropperTip}>Drag to position • Pinch to zoom</Text>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, backgroundColor: '#000' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40, gap: 16 },
  back: { color: colors.accent, fontSize: 16 },
  title: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  
  // Section cards
  sectionCard: { backgroundColor: colors.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  sectionTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 10, letterSpacing: 1.5, fontWeight: 'bold', marginBottom: 14 },
  divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.06)', marginVertical: 14 },
  
  // Section 1: Account
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 14 },
  avatarLarge: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: colors.accent, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%', borderRadius: 34, resizeMode: 'cover' },
  avatarText: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  accountTextCol: { gap: 2 },
  profileNameText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  profileUsernameText: { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  actionRowBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  actionRowText: { color: colors.accent, fontSize: 13, fontWeight: 'bold' },
  publicProfileLink: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  publicProfileLinkText: { color: '#10B981', fontSize: 13, fontWeight: 'bold' },

  // Section 2: Health Profile
  healthStatsGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  healthStatItem: { flex: 1, backgroundColor: '#0B0B0F', paddingVertical: 12, paddingHorizontal: 10, borderRadius: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
  healthStatLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 8, fontWeight: 'bold', letterSpacing: 1 },
  healthStatValue: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },

  // Section 3: Goal
  goalDisplayCard: { backgroundColor: '#0B0B0F', borderRadius: 16, padding: 14, marginBottom: 14, gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
  currentGoalBadge: { color: colors.accent, fontSize: 13, fontWeight: 'bold' },
  goalDescriptionText: { color: 'rgba(255,255,255,0.6)', fontSize: 11.5, lineHeight: 16 },
  inlineGoalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0B0B0F', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)', marginBottom: 8 },
  inlineGoalTextContainer: { gap: 2 },
  inlineGoalLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  inlineGoalValue: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  inlineGoalChangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.03)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  inlineGoalChangeText: { color: colors.accent, fontSize: 12, fontWeight: 'bold' },
  customizerRow: { marginTop: 12, gap: 8 },
  customizerLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  customizerControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#0B0B0F', borderRadius: 16, padding: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)' },
  customizerBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  customizerBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.03)', opacity: 0.4 },
  customizerValueText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },

  // Section 4: Connected Services
  serviceItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  serviceNameText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  serviceStatusText: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  connectServiceBtn: { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 12 },
  connectServiceText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  permissionsIndicatorCard: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  permissionBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
  permissionBadgeText: { fontSize: 10, fontWeight: '600' },

  // Section 5: Privacy
  privacySelectCard: { backgroundColor: '#0B0B0F', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.03)', gap: 2 },
  privacySelectCardActive: { borderColor: colors.accent, backgroundColor: 'rgba(167,139,250,0.04)' },
  privacyOptionTitle: { color: '#FFF', fontSize: 12.5, fontWeight: 'bold' },
  privacyOptionDesc: { color: 'rgba(255,255,255,0.45)', fontSize: 11, lineHeight: 14 },

  // Section 6: Management
  managementList: { gap: 1 },
  managementRowBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12 },
  managementText: { color: '#FFF', fontSize: 13.5 },
  logoutBtnRed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 14, marginTop: 16 },
  logoutBtnText: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },

  // Modal base
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#111117', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 20, maxHeight: '85%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  fieldLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' },
  textInput: { backgroundColor: '#0B0B0F', color: '#FFF', borderRadius: 12, padding: 14, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  saveBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#000', fontSize: 14, fontWeight: 'bold' },

  // Gender Modal Selector
  genderRow: { flexDirection: 'row', gap: 8 },
  genderBtn: { flex: 1, backgroundColor: '#0B0B0F', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  genderBtnActive: { borderColor: colors.accent, backgroundColor: 'rgba(167,139,250,0.08)' },
  genderBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 'bold' },
  genderBtnTextActive: { color: colors.accent },

  // Goal modal select
  goalSelectCard: { backgroundColor: '#0B0B0F', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 4 },
  goalSelectCardActive: { borderColor: colors.accent, backgroundColor: 'rgba(167,139,250,0.04)' },
  goalSelectText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 'bold' },
  goalSelectTextActive: { color: '#FFF' },
  goalSelectDesc: { color: 'rgba(255,255,255,0.4)', fontSize: 11, lineHeight: 14 },

  // Custom Cropper Styles
  cropperContainer: { flex: 1, backgroundColor: '#0a0a0a' },
  cropperHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#111' },
  cropperCancel: { color: 'rgba(255,255,255,0.5)', fontSize: 16 },
  cropperTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  cropperDone: { color: colors.accent, fontSize: 16, fontWeight: 'bold' },
  cropperWorkArea: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  viewportContainer: { width: 280, height: 280, overflow: 'visible', justifyContent: 'center', alignItems: 'center' },
  cropperScrollView: { width: 280, height: 280, backgroundColor: '#000' },
  maskCircleCutout: { position: 'absolute', width: 1080, height: 1080, borderRadius: 540, borderWidth: 400, borderColor: 'rgba(10, 10, 10, 0.85)', top: -400, left: -400 },
  cropCircleBorder: { position: 'absolute', width: 280, height: 280, borderRadius: 140, borderWidth: 1.5, borderColor: 'rgba(255, 255, 255, 0.5)', top: 0, left: 0 },
  cropperFooter: { paddingVertical: 24, alignItems: 'center', backgroundColor: '#111' },
  cropperTip: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 16,
  },
  toggleText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 14,
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
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
});
