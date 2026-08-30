import { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView, TextInput, Modal, Image, Dimensions, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { colors } from '../../constants/colors';
import { recognizeAndRoast, analyzeFoodByName } from '../../lib/claude';
import { buildUserContext, getCleanRoastText } from '../../lib/userContext';
import { supabase } from '../../lib/supabase';
import * as Sharing from 'expo-sharing';
import ViewShot, { captureRef } from 'react-native-view-shot';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { appEvents, FOOD_LOGGED_EVENT } from '../../lib/events';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { lookupBarcode } from '../../lib/openfoodfacts';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';

type Screen = 'idle' | 'loading' | 'roast';

export default function LogScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();
  const [screen, setScreen] = useState<Screen>('idle');
  const [mode, setMode] = useState<'food' | 'barcode' | 'label'>('food');
  
  // Camera & Image states
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const roastRef = useRef<any>(null);

  const handleRequestPermission = async () => {
    try {
      const res = await requestPermission();
      if (!res.granted && !res.canAskAgain) {
        Alert.alert(
          'Camera Permission',
          'Camera access was previously denied. Please enable it in Settings to scan your meals.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      }
    } catch (err) {
      console.log('Error requesting camera permission, opening settings directly:', err);
      Linking.openSettings();
    }
  };

  // Result Analysis states
  const [result, setResult] = useState<any>(null);
  const [editFoodName, setEditFoodName] = useState('');
  const [editCalories, setEditCalories] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editCarbs, setEditCarbs] = useState('');
  const [editFat, setEditFat] = useState('');
  const [editFiber, setEditFiber] = useState('');
  const [servingSize, setServingSize] = useState<'small' | 'regular' | 'large'>('regular');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLogDate, setEditingLogDate] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  // Editing UI states
  const [isEditingName, setIsEditingName] = useState(false);
  const [ingredientsExpanded, setIngredientsExpanded] = useState(false);
  const [showTips, setShowTips] = useState(false);

  // Food History states
  const [showFoodHistory, setShowFoodHistory] = useState(false);
  const [foodHistory, setFoodHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fix Results states
  const [showFixResults, setShowFixResults] = useState(false);
  const [fixFeedback, setFixFeedback] = useState('');
  const [fixLoading, setFixLoading] = useState(false);

  // Drink Detection / Clarification states
  const [drinkConfirmed, setDrinkConfirmed] = useState(false);
  const [selectedDrinkType, setSelectedDrinkType] = useState<string | null>(null);
  const [scoops, setScoops] = useState<number>(1);
  const [mixedWith, setMixedWith] = useState<'water' | 'milk'>('water');
  const [forceClarify, setForceClarify] = useState(false);
  const [customDrinkName, setCustomDrinkName] = useState('');

  const recalculateProteinShake = (scoopCount: number, mixLiquid: 'water' | 'milk') => {
    const baselineScoopCalories = 120;
    const baselineScoopProtein = 24;
    const baselineScoopCarbs = 3;
    const baselineScoopFat = 1.5;

    const milkCalories = 130;
    const milkProtein = 8;
    const milkCarbs = 12;
    const milkFat = 5;

    const finalCal = (baselineScoopCalories * scoopCount) + (mixLiquid === 'milk' ? milkCalories : 0);
    const finalProt = (baselineScoopProtein * scoopCount) + (mixLiquid === 'milk' ? milkProtein : 0);
    const finalCarbs = (baselineScoopCarbs * scoopCount) + (mixLiquid === 'milk' ? milkCarbs : 0);
    const finalFat = (baselineScoopFat * scoopCount) + (mixLiquid === 'milk' ? milkFat : 0);

    setEditCalories(String(finalCal));
    setEditProtein(String(finalProt));
    setEditCarbs(String(finalCarbs));
    setEditFat(String(finalFat));
    setEditFiber('0');

    const liquidLabel = mixLiquid === 'milk' ? 'with Milk' : 'with Water';
    setEditFoodName(`Protein Shake (${scoopCount} Scoop${scoopCount > 1 ? 's' : ''}, ${liquidLabel})`);
  };

  const getAllowedRange = (baseline: number) => {
    const min = Math.round(baseline * 0.8);
    const max = Math.max(baseline === 0 ? 2 : 0, Math.round(baseline * 1.2));
    return { min, max };
  };

  const adjustMacro = (
    key: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber',
    change: number,
    baselineValue: number,
    currentValueStr: string,
    setter: (v: string) => void
  ) => {
    const currentVal = parseFloat(currentValueStr) || 0;
    const newVal = currentVal + change;
    const { min, max } = getAllowedRange(baselineValue);
    
    // Clamp to min/max
    const clampedVal = Math.min(Math.max(newVal, min), max);
    setter(String(clampedVal));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };


  const handleSelectDrinkType = async (type: string) => {
    setSelectedDrinkType(type);
    setDrinkConfirmed(true);
    
    if (type === 'Protein Shake') {
      recalculateProteinShake(1, 'water');
    } else {
      setRecalculating(true);
      try {
        const ctx = await buildUserContext();
        if (!ctx) throw new Error('Could not load user context');
        const data = await analyzeFoodByName(type, ctx);
        
        setResult(data);
        setEditFoodName(data.foodName);
        setEditCalories(String(data.calories));
        setEditProtein(String(data.protein));
        setEditCarbs(String(data.carbs));
        setEditFat(String(data.fat));
        setServingSize('regular');
      } catch (e: any) {
        Alert.alert('Error updating drink nutrition', e.message);
      } finally {
        setRecalculating(false);
      }
    }
  };

  const handleConfirmDrink = () => {
    const drinkType = result?.drinkType || 'Other';
    setSelectedDrinkType(drinkType);
    setDrinkConfirmed(true);
    if (drinkType === 'Protein Shake') {
      recalculateProteinShake(1, 'water');
    }
  };

  const handleScoopsChange = (val: number) => {
    setScoops(val);
    recalculateProteinShake(val, mixedWith);
  };

  const handleMixedWithChange = (val: 'water' | 'milk') => {
    setMixedWith(val);
    recalculateProteinShake(scoops, val);
  };

  useEffect(() => {
    if (barcode === 'true') {
      setMode('barcode');
    }
  }, [barcode]);

  const handleCapturePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: true,
      });
      if (!photo) return;

      setPhotoUri(photo.uri);
      setScreen('loading');
      setEditingLogId(null);
      setServingSize('regular');

      const compressed = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      setPhotoBase64(compressed.base64 || null);

      const ctx = await buildUserContext();
      if (!ctx) throw new Error('Could not load user context');
      const data = await recognizeAndRoast(compressed.base64!, ctx, undefined, mode === 'label' ? 'label' : 'food');

      setResult(data);
      if (data.isFood === false) {
        setEditFoodName('Not a meal');
        setEditCalories('0');
        setEditProtein('0');
        setEditCarbs('0');
        setEditFat('0');
        setEditFiber('0');
      } else {
        setEditFoodName(data.foodName);
        setEditCalories(String(data.calories));
        setEditProtein(String(data.protein));
        setEditCarbs(String(data.carbs));
        setEditFat(String(data.fat));
        setEditFiber(String(data.fiber || 0));
      }

      // Reset drink states
      setDrinkConfirmed(mode !== 'food' || !data.isDrink);
      setSelectedDrinkType(data.isDrink ? (data.drinkType || null) : null);
      setScoops(1);
      setMixedWith('water');
      setForceClarify(false);
      setCustomDrinkName('');

      setScreen('roast');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      const isNotFoodError = e?.message === 'not_food' || e?.message === 'not_label' || e?.message?.includes('not_food') || e?.message?.includes('not_label');
      if (isNotFoodError) {
        setResult({
          foodName: 'Error: Not a meal',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          roast: 'This does not look like food or a nutrition label to me. Did I get this wrong?',
          isNotFood: true,
          detectedItems: mode === 'label' ? ['Not a nutrition label'] : ['Not a meal/food item']
        });
        setEditFoodName('Error: Not a meal');
        setEditCalories('0');
        setEditProtein('0');
        setEditCarbs('0');
        setEditFat('0');
        setScreen('roast');
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning || Haptics.NotificationFeedbackType.Error);
      } else {
        Alert.alert('Error analyzing food', e?.message || JSON.stringify(e));
        setScreen('idle');
      }
    }
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (screen !== 'idle' || mode !== 'barcode') return;
    setScreen('loading');
    setEditingLogId(null);
    setServingSize('regular');
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const product = await lookupBarcode(data);
      if (!product.found) {
        Alert.alert('Product not found', 'Try taking a photo instead.');
        setScreen('idle');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('users').select('diet').eq('id', user!.id).single();

      const { data: edgeData, error: invokeError } = await supabase.functions.invoke('gemini-proxy', {
        body: {
          contents: [{
            parts: [{
              text: `You are a brutally honest, funny best friend who knows nutrition. Roast this person about the packaged food they just scanned. 2-3 sentences MAX. Funny, specific, not mean. Use "bro" or "bestie".

They just scanned: ${product.foodName} (${product.calories} cal, ${product.protein}g protein)
Diet: ${profile?.diet || 'nonveg'}

Return ONLY the roast text, nothing else.`
            }]
          }]
        }
      });
      if (invokeError) throw invokeError;
      if (edgeData.error) throw new Error(edgeData.error.message || JSON.stringify(edgeData.error));
      const roast = edgeData.candidates[0].content.parts[0].text.trim();

      const fullResult = {
        ...product,
        roast,
        nutritionScore: (product as any).nutritionScore || 6,
        foodQuality: (product as any).foodQuality || 'Processed',
        healthImpact: (product as any).healthImpact || -2,
        suggestions: (product as any).suggestions || 'Packaged product detected. Monitor sodium and sugar intake.'
      };

      setResult(fullResult);
      setPhotoUri(null);
      setPhotoBase64(null);
      setEditFoodName(fullResult.foodName);
      setEditCalories(String(fullResult.calories));
      setEditProtein(String(fullResult.protein));
      setEditCarbs(String(fullResult.carbs));
      setEditFat(String(fullResult.fat));
      setEditFiber(String((fullResult as any).fiber || 0));

      // Reset drink states
      setDrinkConfirmed(true);
      setSelectedDrinkType(null);
      setScoops(1);
      setMixedWith('water');
      setForceClarify(false);
      setCustomDrinkName('');

      setScreen('roast');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.log('Error scanning barcode:', e);
      const fallbackResult = {
        foodName: 'Packaged Food Item',
        calories: 220,
        protein: 6,
        carbs: 28,
        fat: 9,
        roast: `Packaged food? Bold choice. At least you logged it 📦`,
        nutritionScore: 5,
        foodQuality: 'Processed',
        healthImpact: -2,
        suggestions: 'Packaged product log. Consider switching to whole foods where possible.'
      };
      setResult(fallbackResult);
      setPhotoUri(null);
      setPhotoBase64(null);
      setEditFoodName(fallbackResult.foodName);
      setEditCalories(String(fallbackResult.calories));
      setEditProtein(String(fallbackResult.protein));
      setEditCarbs(String(fallbackResult.carbs));
      setEditFat(String(fallbackResult.fat));
      setEditFiber('0');

      // Reset drink states
      setDrinkConfirmed(true);
      setSelectedDrinkType(null);
      setScoops(1);
      setMixedWith('water');
      setForceClarify(false);
      setCustomDrinkName('');

      setScreen('roast');
    }
  };

  const handleFixResults = async () => {
    if (!photoBase64) return;
    setFixLoading(true);
    setEditingLogId(null);
    setServingSize('regular');
    try {
      const ctx = await buildUserContext();
      if (!ctx) throw new Error('Could not load user context');
      
      const data = await recognizeAndRoast(photoBase64, ctx, fixFeedback, mode === 'label' ? 'label' : 'food');

      setResult(data);
      if (data.isFood === false) {
        setEditFoodName('Not a meal');
        setEditCalories('0');
        setEditProtein('0');
        setEditCarbs('0');
        setEditFat('0');
        setEditFiber('0');
      } else {
        setEditFoodName(data.foodName);
        setEditCalories(String(data.calories));
        setEditProtein(String(data.protein));
        setEditCarbs(String(data.carbs));
        setEditFat(String(data.fat));
        setEditFiber(String(data.fiber || 0));
      }

      // Reset drink states
      setDrinkConfirmed(mode !== 'food' || !data.isDrink);
      setSelectedDrinkType(data.isDrink ? (data.drinkType || null) : null);
      setScoops(1);
      setMixedWith('water');
      setForceClarify(false);
      setCustomDrinkName('');

      setShowFixResults(false);
      setFixFeedback('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      const isNotFoodError = e?.message === 'not_food' || e?.message === 'not_label' || e?.message?.includes('not_food') || e?.message?.includes('not_label');
      if (isNotFoodError) {
        setResult({
          foodName: 'Error: Not a meal',
          calories: 0,
          protein: 0,
          carbs: 0,
          fat: 0,
          roast: 'This does not look like food or a nutrition label to me. Did I get this wrong?',
          isNotFood: true,
          detectedItems: mode === 'label' ? ['Not a nutrition label'] : ['Not a meal/food item']
        });
        setEditFoodName('Error: Not a meal');
        setEditCalories('0');
        setEditProtein('0');
        setEditCarbs('0');
        setEditFat('0');
        setShowFixResults(false);
        setFixFeedback('');
      } else {
        Alert.alert('Error re-analyzing', e?.message || JSON.stringify(e));
      }
    } finally {
      setFixLoading(false);
    }
  };

  const handleNameChange = async (newName: string) => {
    if (!newName.trim() || (result && newName === result.foodName)) {
      setIsEditingName(false);
      return;
    }
    setRecalculating(true);
    setIsEditingName(false);
    try {
      const ctx = await buildUserContext();
      if (!ctx) throw new Error('Could not load user context');
      
      const data = await analyzeFoodByName(newName, ctx);
      
      setResult(data);
      setEditFoodName(data.foodName);
      setEditCalories(String(data.calories));
      setEditProtein(String(data.protein));
      setEditCarbs(String(data.carbs));
      setEditFat(String(data.fat));
      setEditFiber(String(data.fiber || 0));
      setServingSize('regular');

      // Update drink states based on the manual change
      if (data.isDrink) {
        setSelectedDrinkType(data.drinkType || null);
        setDrinkConfirmed(true);
        if (data.drinkType === 'Protein Shake') {
          setScoops(1);
          setMixedWith('water');
          recalculateProteinShake(1, 'water');
        }
      } else {
        setDrinkConfirmed(true);
        setSelectedDrinkType(null);
      }
    } catch (e: any) {
      Alert.alert('Error updating food nutrition', e.message);
      if (result) setEditFoodName(result.foodName);
    } finally {
      setRecalculating(false);
    }
  };

  const handleSaveMeal = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { data: { user } } = await supabase.auth.getUser();
      
      const getMultiplier = () => {
        if (servingSize === 'small') return 0.75;
        if (servingSize === 'large') return 1.5;
        return 1.0;
      };
      const multiplier = getMultiplier();

      const checkValue = (val: string, baseline: number): number => {
        const num = Math.round(parseFloat(val)) || 0;
        const { min, max } = getAllowedRange(baseline);
        return Math.min(Math.max(num, min), max);
      };

      const finalBaselineCal = checkValue(editCalories, result?.calories || 0);
      const finalBaselineProt = checkValue(editProtein, result?.protein || 0);
      const finalBaselineCarbs = checkValue(editCarbs, result?.carbs || 0);
      const finalBaselineFat = checkValue(editFat, result?.fat || 0);
      const finalBaselineFiber = checkValue(editFiber, result?.fiber || 0);

      const logCalories = Math.round(finalBaselineCal * multiplier);
      const logProtein = Math.round(finalBaselineProt * multiplier);
      const logCarbs = Math.round(finalBaselineCarbs * multiplier);
      const logFat = Math.round(finalBaselineFat * multiplier);

      const isEdited =
        finalBaselineCal !== (result?.calories || 0) ||
        finalBaselineProt !== (result?.protein || 0) ||
        finalBaselineCarbs !== (result?.carbs || 0) ||
        finalBaselineFat !== (result?.fat || 0) ||
        finalBaselineFiber !== (result?.fiber || 0);

      const sourceName = mode === 'label' ? 'label_scan' : mode === 'barcode' ? 'barcode_scan' : 'ai_scan';
      const detectedItemsStr = result?.detectedItems && result.detectedItems.length > 0
        ? `;DETECTED_ITEMS:${result.detectedItems.join(',')}`
        : '';
      
      const metadataSuffix = ` ||| SOURCE:${sourceName};EDITED:${isEdited ? 'true' : 'false'};ORIGINAL_CALORIES:${result?.calories || 0};ORIGINAL_PROTEIN:${result?.protein || 0};ORIGINAL_CARBS:${result?.carbs || 0};ORIGINAL_FAT:${result?.fat || 0};ORIGINAL_FIBER:${result?.fiber || 0};EDITED_CALORIES:${finalBaselineCal};EDITED_PROTEIN:${finalBaselineProt};EDITED_CARBS:${finalBaselineCarbs};EDITED_FAT:${finalBaselineFat};EDITED_FIBER:${finalBaselineFiber};CONFIDENCE_IDENTIFICATION:${result?.foodIdentificationConfidence || 90};CONFIDENCE_PORTION:${result?.portionEstimationConfidence || 85};CONFIDENCE_NUTRITION:${result?.nutritionEstimationConfidence || 85}${detectedItemsStr}`;

      const roastClean = (result?.roast || 'Meal logged successfully.').split(' ||| ')[0];
      const roastText = roastClean + metadataSuffix;

      if (editingLogId) {
        await supabase.from('food_logs').update({
          food_name: editFoodName,
          calories: logCalories,
          protein_g: logProtein,
          carbs_g: logCarbs,
          fat_g: logFat,
          roast_text: roastText
        }).eq('id', editingLogId);

        appEvents.emit(FOOD_LOGGED_EVENT);
        Alert.alert('Saved! 📝', 'Nutrition History updated.');
      } else {
        // Check for duplicate food logging in the last 120 seconds
        const twoMinutesAgo = new Date(Date.now() - 120 * 1000).toISOString();
        const { data: recentLogs, error: checkError } = await supabase
          .from('food_logs')
          .select('food_name')
          .eq('user_id', user!.id)
          .gte('logged_at', twoMinutesAgo);

        if (checkError) {
          console.warn('Error checking duplicate logs:', checkError);
        } else if (recentLogs && recentLogs.length > 0) {
          const isDuplicate = recentLogs.some(
            (log) => log.food_name?.toLowerCase().trim() === editFoodName.toLowerCase().trim()
          );
          if (isDuplicate) {
            Alert.alert('Duplicate Meal', 'You recently logged this meal.');
            return;
          }
        }

        await supabase.from('food_logs').insert({
          user_id: user!.id,
          food_name: editFoodName,
          calories: logCalories,
          protein_g: logProtein,
          carbs_g: logCarbs,
          fat_g: logFat,
          roast_text: roastText,
          meal_type: 'snack',
          logged_at: new Date().toISOString()
        });

        const encouragementMessages = [
          "Keep logging! Consistency is key. 🔑",
          "Great job tracking your nutrition today! 🍎",
          "Every log counts towards a healthier you! 🌱",
          "Stay mindful, stay fueled! ⚡️",
          "Awesome progress! Keep building the habit. 🚀",
          "You're doing great! Keep it up! 💪"
        ];
        const randomMsg = encouragementMessages[Math.floor(Math.random() * encouragementMessages.length)];
        appEvents.emit(FOOD_LOGGED_EVENT);
        Alert.alert('Logged! 💪', randomMsg);
      }


      // Reset state and return home
      setPhotoUri(null);
      setPhotoBase64(null);
      setResult(null);
      setEditingLogId(null);
      setEditingLogDate(null);
      setServingSize('regular');
      setScreen('idle');
      router.replace('/');
    } catch (e: any) {
      Alert.alert('Error saving log', e.message);
    }
  };

  const handleDeleteMeal = async () => {
    if (!editingLogId) return;
    
    Alert.alert(
      'Delete Meal',
      'Are you sure you want to delete this meal from your log?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              const { error } = await supabase
                .from('food_logs')
                .delete()
                .eq('id', editingLogId);

              if (error) throw error;

              appEvents.emit(FOOD_LOGGED_EVENT);
              Alert.alert('Deleted! 🗑️', 'Meal has been deleted.');
              
              // Reset edit states and return to camera
              setEditingLogId(null);
              setEditingLogDate(null);
              setResult(null);
              setScreen('idle');
            } catch (e: any) {
              Alert.alert('Error', 'Failed to delete meal: ' + e.message);
            }
          }
        }
      ]
    );
  };

  const formatHistoryDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const logDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
      const diffDays = Math.round((today - logDay) / (1000 * 60 * 60 * 24));
      
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      if (diffDays === 0) {
        return `Today, ${timeStr}`;
      } else if (diffDays === 1) {
        return `Yesterday, ${timeStr}`;
      } else {
        return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timeStr}`;
      }
    } catch (e) {
      return '';
    }
  };

  const fetchFoodHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('food_logs')
        .select('*')
        .eq('user_id', user.id)
        .not('food_name', 'like', '__reward_lock:%')
        .order('logged_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setFoodHistory(data || []);
    } catch (e) {
      console.log('Error fetching food history:', e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenFoodHistory = () => {
    setShowFoodHistory(true);
    fetchFoodHistory();
  };

  const handleSelectHistoryItem = async (item: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingLogId(item.id);
    setEditingLogDate(item.logged_at);
    
    let idConfidence = 90;
    let portionConfidence = 85;
    let nutritionConfidence = 85;
    let historyDetectedItems: string[] | null = null;
    let historyFiber = 0;

    if (item.roast_text) {
      const parts = item.roast_text.split(' ||| ');
      if (parts.length > 1) {
        const macroPart = parts[1];
        macroPart.split(';').forEach((p: string) => {
          const [key, val] = p.split(':');
          if (key && val) {
            const lowKey = key.toLowerCase();
            if (lowKey === 'confidence_identification') idConfidence = parseInt(val) || 90;
            if (lowKey === 'confidence_portion') portionConfidence = parseInt(val) || 85;
            if (lowKey === 'confidence_nutrition') nutritionConfidence = parseInt(val) || 85;
            if (lowKey === 'original_fiber') historyFiber = parseFloat(val) || 0;
            if (lowKey === 'edited_fiber') historyFiber = parseFloat(val) || 0;
            if (lowKey === 'detected_items') {
              historyDetectedItems = val.split(',').map((x: string) => x.trim()).filter(Boolean);
            }
          }
        });
      }
    }

    setResult({
      foodName: item.food_name,
      calories: item.calories,
      protein: item.protein_g,
      carbs: item.carbs_g,
      fat: item.fat_g,
      roast: item.roast_text,
      nutritionScore: item.nutrition_score || 6,
      foodQuality: item.food_quality || 'Good',
      healthImpact: item.health_impact || 0,
      suggestions: item.suggestions || '',
      ingredients: item.ingredients || '',
      foodIdentificationConfidence: idConfidence,
      portionEstimationConfidence: portionConfidence,
      nutritionEstimationConfidence: nutritionConfidence,
      detectedItems: historyDetectedItems,
      alternatives: []
    });
    setEditFoodName(item.food_name);
    setEditCalories(String(item.calories));
    setEditProtein(String(item.protein_g));
    setEditCarbs(String(item.carbs_g));
    setEditFat(String(item.fat_g));
    setEditFiber(String(historyFiber));
    setServingSize('regular');

    // Reset/Confirm drink states for history items
    setDrinkConfirmed(true);
    setSelectedDrinkType(null);
    setScoops(1);
    setMixedWith('water');
    setForceClarify(false);
    setCustomDrinkName('');

    setScreen('roast');
    setShowFoodHistory(false);
  };



  // Permission views
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color={colors.accent} style={{ marginBottom: 16 }} />
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionSubtitle}>
            FitApp is a camera-first nutrition logger. Please grant camera access to scan your meals.
          </Text>
          <TouchableOpacity style={styles.grantBtn} onPress={handleRequestPermission}>
            <Text style={styles.grantBtnText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (screen === 'loading') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Analyzing meal contents...</Text>
      </View>
    );
  }

  if (screen === 'roast' && result) {
    const getMultiplier = () => {
      if (servingSize === 'small') return 0.75;
      if (servingSize === 'large') return 1.5;
      return 1.0;
    };
    const multiplier = getMultiplier();

    const isNotFood =
      result.isFood === false ||
      (editFoodName || '').toLowerCase().includes('not a meal') ||
      (editFoodName || '').toLowerCase().includes('not_food') ||
      (editFoodName || '').toLowerCase().includes('error: not') ||
      !!result.isNotFood;

    const isCalDecDisabled = (parseFloat(editCalories) || 0) - 10 < getAllowedRange(result?.calories || 0).min;
    const isCalIncDisabled = (parseFloat(editCalories) || 0) + 10 > getAllowedRange(result?.calories || 0).max;

    const isProteinDecDisabled = (parseFloat(editProtein) || 0) - 1 < getAllowedRange(result?.protein || 0).min;
    const isProteinIncDisabled = (parseFloat(editProtein) || 0) + 1 > getAllowedRange(result?.protein || 0).max;

    const isCarbsDecDisabled = (parseFloat(editCarbs) || 0) - 1 < getAllowedRange(result?.carbs || 0).min;
    const isCarbsIncDisabled = (parseFloat(editCarbs) || 0) + 1 > getAllowedRange(result?.carbs || 0).max;

    const isFatDecDisabled = (parseFloat(editFat) || 0) - 1 < getAllowedRange(result?.fat || 0).min;
    const isFatIncDisabled = (parseFloat(editFat) || 0) + 1 > getAllowedRange(result?.fat || 0).max;

    const isFiberDecDisabled = (parseFloat(editFiber) || 0) - 1 < getAllowedRange(result?.fiber || 0).min;
    const isFiberIncDisabled = (parseFloat(editFiber) || 0) + 1 > getAllowedRange(result?.fiber || 0).max;


    return (
      <ViewShot ref={roastRef} options={{ format: 'jpg', quality: 0.9 }} style={{ flex: 1 }}>
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => { setScreen('idle'); setResult(null); setEditingLogId(null); setEditingLogDate(null); }} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.roastContent}>
            {/* Top Photo Preview */}
            {photoUri && (
              <View style={styles.previewImageContainer}>
                <Image source={{ uri: photoUri }} style={styles.previewImage} resizeMode="cover" />
                <TouchableOpacity
                  style={styles.imageShareOverlay}
                  onPress={async () => {
                    try {
                      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      const uri = await captureRef(roastRef, { format: 'jpg', quality: 0.9 });
                      await Sharing.shareAsync(uri);
                    } catch (e) {
                      console.log('Share error:', e);
                    }
                  }}
                >
                  <Ionicons name="share-social-outline" size={16} color="#FFF" />
                  <Text style={styles.shareOverlayText}>Share</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Drink Clarification / Confirmation Block */}
            {result.isDrink && mode === 'food' && (
              <View style={styles.drinkClarifyCard}>
                {!drinkConfirmed ? (
                  <>
                    {/* High Confidence Flow (>85%) */}
                    {result.drinkConfidence > 85 && !forceClarify && (
                      <View>
                        <View style={styles.drinkClarifyHeader}>
                          <Ionicons name="sparkles" size={18} color="#FFD700" />
                          <Text style={styles.drinkClarifyTitle}>Detected Drink</Text>
                        </View>
                        <Text style={styles.drinkNameHuge}>{result.drinkType || result.foodName}</Text>
                        <TouchableOpacity style={styles.drinkConfirmBtn} onPress={handleConfirmDrink}>
                          <Text style={styles.drinkConfirmText}>✓ Confirm</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={{ alignSelf: 'center', marginTop: 12 }} 
                          onPress={() => setForceClarify(true)}
                        >
                          <Text style={{ color: colors.subtext, fontSize: 13, textDecorationLine: 'underline' }}>
                            Not this? Select another
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Medium Confidence Flow (60–85%) */}
                    {result.drinkConfidence >= 60 && result.drinkConfidence <= 85 && !forceClarify && (
                      <View>
                        <View style={styles.drinkClarifyHeader}>
                          <Ionicons name="help-circle-outline" size={18} color={colors.accent} />
                          <Text style={styles.drinkClarifyTitle}>Detected Drink</Text>
                        </View>
                        <Text style={[styles.drinkNameHuge, { marginBottom: 6 }]}>{result.drinkType || result.foodName}</Text>
                        
                        <Text style={[styles.drinkClarifySubtitle, { textAlign: 'center', marginBottom: 12 }]}>
                          Select the correct option below:
                        </Text>
                        
                        <View style={styles.drinkAltContainer}>
                          {/* Main detected type */}
                          <TouchableOpacity 
                            style={[styles.drinkAltPill, { borderColor: colors.accent, backgroundColor: 'rgba(167,139,250,0.1)' }]}
                            onPress={() => handleSelectDrinkType(result.drinkType || 'Other')}
                          >
                            <Text style={[styles.drinkAltPillText, { color: colors.accent }]}>
                              {result.drinkType || 'Other'}
                            </Text>
                          </TouchableOpacity>

                          {/* Alternatives */}
                          {(result.alternatives || []).filter((alt: string) => alt !== result.drinkType).map((alt: string) => (
                            <TouchableOpacity 
                              key={alt}
                              style={styles.drinkAltPill}
                              onPress={() => handleSelectDrinkType(alt)}
                            >
                              <Text style={styles.drinkAltPillText}>{alt}</Text>
                            </TouchableOpacity>
                          ))}

                          <TouchableOpacity 
                            style={styles.drinkAltPill}
                            onPress={() => setForceClarify(true)}
                          >
                            <Text style={[styles.drinkAltPillText, { color: colors.orange }]}>None of these</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}

                    {/* Low Confidence Flow (<60% or forceClarify) */}
                    {(result.drinkConfidence < 60 || forceClarify) && (
                      <View>
                        <View style={styles.drinkClarifyHeader}>
                          <Ionicons name="alert-circle-outline" size={18} color={colors.orange} />
                          <Text style={styles.drinkClarifyTitle}>What are you drinking?</Text>
                        </View>
                        <Text style={styles.drinkClarifySubtitle}>
                          We couldn't reliably identify this drink. Please select one:
                        </Text>
                        <View style={styles.drinkGrid}>
                          {[
                            'Protein Shake', 'Coffee', 'Tea', 'Smoothie', 
                            'Juice', 'Milkshake', 'Soda', 'Other'
                          ].map((type) => (
                            <TouchableOpacity
                              key={type}
                              style={[
                                styles.drinkGridItem,
                                selectedDrinkType === type && styles.drinkGridItemActive
                              ]}
                              onPress={() => {
                                if (type !== 'Other') {
                                  handleSelectDrinkType(type);
                                } else {
                                  setSelectedDrinkType('Other');
                                }
                              }}
                            >
                              <Text style={styles.drinkGridItemText}>{type}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        {selectedDrinkType === 'Other' && (
                          <View style={styles.drinkCustomInputRow}>
                            <TextInput
                              style={styles.drinkCustomInput}
                              placeholder="Enter drink name..."
                              placeholderTextColor="rgba(255,255,255,0.4)"
                              value={customDrinkName}
                              onChangeText={setCustomDrinkName}
                              onSubmitEditing={() => {
                                if (customDrinkName.trim()) {
                                  handleSelectDrinkType(customDrinkName.trim());
                                }
                              }}
                            />
                            <TouchableOpacity 
                              style={styles.drinkCustomSubmitBtn}
                              onPress={() => {
                                if (customDrinkName.trim()) {
                                  handleSelectDrinkType(customDrinkName.trim());
                                }
                              }}
                            >
                              <Text style={styles.drinkCustomSubmitBtnText}>Done</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    )}
                  </>
                ) : (
                  // Confirmed View / Details
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={18} color={colors.green} />
                        <Text style={{ color: colors.green, fontWeight: 'bold', fontSize: 14 }}>
                          Drink Confirmed: {selectedDrinkType}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setDrinkConfirmed(false)}>
                        <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>Change</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Special Protein Shake Flow */}
                    {selectedDrinkType === 'Protein Shake' && (
                      <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.06)', paddingTop: 12 }}>
                        <Text style={styles.shakeSectionTitle}>How many scoops?</Text>
                        <View style={styles.shakePillRow}>
                          {([1, 2, 3] as const).map((s) => (
                            <TouchableOpacity
                              key={s}
                              style={[
                                styles.shakeOptionPill,
                                scoops === s && styles.shakeOptionPillActive
                              ]}
                              onPress={() => handleScoopsChange(s)}
                            >
                              <Text style={[
                                styles.shakeOptionText,
                                scoops === s && styles.shakeOptionTextActive
                              ]}>
                                {s} Scoop{s > 1 ? 's' : ''}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <Text style={styles.shakeSectionTitle}>Mixed With</Text>
                        <View style={styles.shakePillRow}>
                          {(['water', 'milk'] as const).map((liq) => (
                            <TouchableOpacity
                              key={liq}
                              style={[
                                styles.shakeOptionPill,
                                mixedWith === liq && styles.shakeOptionPillActive
                              ]}
                              onPress={() => handleMixedWithChange(liq)}
                            >
                              <Text style={[
                                styles.shakeOptionText,
                                mixedWith === liq && styles.shakeOptionTextActive
                              ]}>
                                {liq.charAt(0).toUpperCase() + liq.slice(1)}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <Text style={styles.shakeRecalcLabel}>
                          Recalculated macros automatically for {scoops} scoop{scoops > 1 ? 's' : ''} with {mixedWith}.
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            )}

            {/* Detected Items Section */}
            {result.detectedItems && result.detectedItems.length > 0 && (
              <View style={styles.detectedItemsCard}>
                <View style={styles.detectedItemsHeader}>
                  <Ionicons name="restaurant-outline" size={16} color={colors.accent} />
                  <Text style={styles.detectedItemsTitle}>Detected Items</Text>
                </View>
                <View style={styles.detectedItemsList}>
                  {result.detectedItems.map((item: string, idx: number) => (
                    <View key={idx} style={styles.detectedItemRow}>
                      <Text style={styles.detectedItemBullet}>•</Text>
                      <Text style={styles.detectedItemText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Food Name & Edit Trigger */}
            <View style={styles.foodNameSection}>
              {isEditingName ? (
                <TextInput
                  style={styles.foodNameInput}
                  value={editFoodName}
                  onChangeText={setEditFoodName}
                  autoFocus
                  onBlur={() => handleNameChange(editFoodName)}
                  onSubmitEditing={() => handleNameChange(editFoodName)}
                />
              ) : (
                <View style={styles.foodNameRow}>
                  <Text style={styles.foodNameText} numberOfLines={2}>{editFoodName}</Text>
                  <TouchableOpacity onPress={() => setIsEditingName(true)} style={styles.nameEditBtn}>
                    <Ionicons name="pencil" size={16} color={colors.accent} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {recalculating && (
              <View style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={{ color: colors.subtext, fontSize: 13 }}>Rerunning nutrition analysis...</Text>
              </View>
            )}

            {isNotFood ? (
              <View style={styles.recoveryCard}>
                <View style={styles.recoveryHeaderRow}>
                  <Ionicons name="help-circle-outline" size={18} color="#FFD700" />
                  <Text style={styles.recoveryTitle}>Did we get this wrong?</Text>
                </View>
                <Text style={styles.recoverySubtitle}>
                  Sometimes the AI makes a mistake if the photo is blurry or lighting is bad. If this actually was a meal, you can correct it:
                </Text>
                <View style={{ gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.recoveryOptionBtn, { backgroundColor: colors.accent, paddingVertical: 12, justifyContent: 'center' }]}
                    onPress={() => {
                      setScreen('idle');
                      setResult(null);
                      setEditingLogId(null);
                    }}
                  >
                    <Ionicons name="camera-outline" size={18} color="#FFF" />
                    <Text style={[styles.recoveryOptionText, { color: '#FFF', fontWeight: 'bold' }]}>Retake Photo</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={[styles.recoveryOptionBtn, { borderColor: colors.accent, borderWidth: 1, paddingVertical: 12, justifyContent: 'center' }]}
                    onPress={() => {
                      setEditFoodName('');
                      setEditCalories('0');
                      setEditProtein('0');
                      setEditCarbs('0');
                      setEditFat('0');
                      setEditFiber('0');
                      setIsEditingName(true);
                    }}
                  >
                    <Ionicons name="pencil-outline" size={18} color={colors.accent} />
                    <Text style={[styles.recoveryOptionText, { color: colors.accent, fontWeight: 'bold' }]}>Enter Name Manually</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {/* Low Confidence Recovery Flow */}
                {result.foodIdentificationConfidence !== undefined && result.foodIdentificationConfidence < 70 && (
                  <View style={styles.recoveryCard}>
                    <View style={styles.recoveryHeaderRow}>
                      <Ionicons name="help-circle-outline" size={18} color="#FFD700" />
                      <Text style={styles.recoveryTitle}>Did we identify this correctly?</Text>
                    </View>
                    <Text style={styles.recoverySubtitle}>
                      We are unsure about this meal. Choose a correction option below:
                    </Text>
                    <View style={styles.recoveryOptionsContainer}>
                      {result.alternatives && result.alternatives.map((alt: string) => (
                        <TouchableOpacity
                          key={alt}
                          style={styles.recoveryOptionBtn}
                          onPress={() => handleNameChange(alt)}
                        >
                          <Ionicons name="ellipse-outline" size={15} color={colors.accent} />
                          <Text style={styles.recoveryOptionText}>{alt}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={styles.recoveryOptionBtn}
                        onPress={() => setIsEditingName(true)}
                      >
                        <Ionicons name="pencil-outline" size={15} color={colors.accent} />
                        <Text style={styles.recoveryOptionText}>Other (Type name)</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* Serving Size Selector */}
                <View style={styles.servingSizeContainer}>
                  <Text style={styles.servingSizeTitle}>Serving Size</Text>
                  <View style={styles.servingSizeRow}>
                    {(['small', 'regular', 'large'] as const).map((sz) => (
                      <TouchableOpacity
                        key={sz}
                        style={[
                          styles.servingSizePill,
                          servingSize === sz && styles.servingSizePillActive
                        ]}
                        onPress={() => setServingSize(sz)}
                      >
                        <Text style={[
                          styles.servingSizeText,
                          servingSize === sz && styles.servingSizeTextActive
                        ]}>
                          {sz.charAt(0).toUpperCase() + sz.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Nutrition List */}
                <View style={styles.nutritionCard}>
                  <View style={styles.nutritionHeaderRow}>
                    <Text style={styles.nutritionTitle}>Nutrition</Text>
                    {mode === 'food' && (
                      <Text style={styles.nutritionSubtitle}>Tap + / - to adjust baseline</Text>
                    )}
                  </View>
                  
                  <View style={styles.nutritionItemRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="flame-outline" size={16} color={colors.orange} />
                      <Text style={styles.nutritionItemKey}>Calories</Text>
                    </View>
                    {mode === 'food' ? (
                      <View style={styles.inlineEditControls}>
                        <TouchableOpacity 
                          style={[styles.inlineEditBtn, isCalDecDisabled && styles.inlineEditBtnDisabled]} 
                          disabled={isCalDecDisabled}
                          onPress={() => adjustMacro('calories', -10, result.calories || 0, editCalories, setEditCalories)}
                        >
                          <Ionicons name="remove" size={14} color={isCalDecDisabled ? "rgba(255,255,255,0.2)" : "#FFF"} />
                        </TouchableOpacity>
                        <Text style={styles.inlineEditVal}>{Math.round((parseFloat(editCalories) || 0) * multiplier)} kcal</Text>
                        <TouchableOpacity 
                          style={[styles.inlineEditBtn, isCalIncDisabled && styles.inlineEditBtnDisabled]} 
                          disabled={isCalIncDisabled}
                          onPress={() => adjustMacro('calories', 10, result.calories || 0, editCalories, setEditCalories)}
                        >
                          <Ionicons name="add" size={14} color={isCalIncDisabled ? "rgba(255,255,255,0.2)" : "#FFF"} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.nutritionItemVal}>{Math.round((parseFloat(editCalories) || 0) * multiplier)} kcal</Text>
                    )}
                  </View>

                  <View style={styles.nutritionItemRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="fitness-outline" size={16} color="#FFD700" />
                      <Text style={styles.nutritionItemKey}>Protein</Text>
                    </View>
                    {mode === 'food' ? (
                      <View style={styles.inlineEditControls}>
                        <TouchableOpacity 
                          style={[styles.inlineEditBtn, isProteinDecDisabled && styles.inlineEditBtnDisabled]} 
                          disabled={isProteinDecDisabled}
                          onPress={() => adjustMacro('protein', -1, result.protein || 0, editProtein, setEditProtein)}
                        >
                          <Ionicons name="remove" size={14} color={isProteinDecDisabled ? "rgba(255,255,255,0.2)" : "#FFF"} />
                        </TouchableOpacity>
                        <Text style={styles.inlineEditVal}>{Math.round((parseFloat(editProtein) || 0) * multiplier)}g</Text>
                        <TouchableOpacity 
                          style={[styles.inlineEditBtn, isProteinIncDisabled && styles.inlineEditBtnDisabled]} 
                          disabled={isProteinIncDisabled}
                          onPress={() => adjustMacro('protein', 1, result.protein || 0, editProtein, setEditProtein)}
                        >
                          <Ionicons name="add" size={14} color={isProteinIncDisabled ? "rgba(255,255,255,0.2)" : "#FFF"} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.nutritionItemVal}>{Math.round((parseFloat(editProtein) || 0) * multiplier)}g</Text>
                    )}
                  </View>

                  <View style={styles.nutritionItemRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="nutrition-outline" size={16} color="#00E676" />
                      <Text style={styles.nutritionItemKey}>Carbs</Text>
                    </View>
                    {mode === 'food' ? (
                      <View style={styles.inlineEditControls}>
                        <TouchableOpacity 
                          style={[styles.inlineEditBtn, isCarbsDecDisabled && styles.inlineEditBtnDisabled]} 
                          disabled={isCarbsDecDisabled}
                          onPress={() => adjustMacro('carbs', -1, result.carbs || 0, editCarbs, setEditCarbs)}
                        >
                          <Ionicons name="remove" size={14} color={isCarbsDecDisabled ? "rgba(255,255,255,0.2)" : "#FFF"} />
                        </TouchableOpacity>
                        <Text style={styles.inlineEditVal}>{Math.round((parseFloat(editCarbs) || 0) * multiplier)}g</Text>
                        <TouchableOpacity 
                          style={[styles.inlineEditBtn, isCarbsIncDisabled && styles.inlineEditBtnDisabled]} 
                          disabled={isCarbsIncDisabled}
                          onPress={() => adjustMacro('carbs', 1, result.carbs || 0, editCarbs, setEditCarbs)}
                        >
                          <Ionicons name="add" size={14} color={isCarbsIncDisabled ? "rgba(255,255,255,0.2)" : "#FFF"} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.nutritionItemVal}>{Math.round((parseFloat(editCarbs) || 0) * multiplier)}g</Text>
                    )}
                  </View>

                  <View style={styles.nutritionItemRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="water-outline" size={16} color="#A78BFA" />
                      <Text style={styles.nutritionItemKey}>Fat</Text>
                    </View>
                    {mode === 'food' ? (
                      <View style={styles.inlineEditControls}>
                        <TouchableOpacity 
                          style={[styles.inlineEditBtn, isFatDecDisabled && styles.inlineEditBtnDisabled]} 
                          disabled={isFatDecDisabled}
                          onPress={() => adjustMacro('fat', -1, result.fat || 0, editFat, setEditFat)}
                        >
                          <Ionicons name="remove" size={14} color={isFatDecDisabled ? "rgba(255,255,255,0.2)" : "#FFF"} />
                        </TouchableOpacity>
                        <Text style={styles.inlineEditVal}>{Math.round((parseFloat(editFat) || 0) * multiplier)}g</Text>
                        <TouchableOpacity 
                          style={[styles.inlineEditBtn, isFatIncDisabled && styles.inlineEditBtnDisabled]} 
                          disabled={isFatIncDisabled}
                          onPress={() => adjustMacro('fat', 1, result.fat || 0, editFat, setEditFat)}
                        >
                          <Ionicons name="add" size={14} color={isFatIncDisabled ? "rgba(255,255,255,0.2)" : "#FFF"} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.nutritionItemVal}>{Math.round((parseFloat(editFat) || 0) * multiplier)}g</Text>
                    )}
                  </View>

                  {result.fiber !== undefined && result.fiber !== null && (
                    <View style={styles.nutritionItemRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="leaf-outline" size={16} color="#34D399" />
                        <Text style={styles.nutritionItemKey}>Dietary Fiber</Text>
                      </View>
                      {mode === 'food' ? (
                        <View style={styles.inlineEditControls}>
                          <TouchableOpacity 
                            style={[styles.inlineEditBtn, isFiberDecDisabled && styles.inlineEditBtnDisabled]} 
                            disabled={isFiberDecDisabled}
                            onPress={() => adjustMacro('fiber', -1, result.fiber || 0, editFiber, setEditFiber)}
                          >
                            <Ionicons name="remove" size={14} color={isFiberDecDisabled ? "rgba(255,255,255,0.2)" : "#FFF"} />
                          </TouchableOpacity>
                          <Text style={styles.inlineEditVal}>{Math.round((parseFloat(editFiber || '0') || 0) * multiplier)}g</Text>
                          <TouchableOpacity 
                            style={[styles.inlineEditBtn, isFiberIncDisabled && styles.inlineEditBtnDisabled]} 
                            disabled={isFiberIncDisabled}
                            onPress={() => adjustMacro('fiber', 1, result.fiber || 0, editFiber, setEditFiber)}
                          >
                            <Ionicons name="add" size={14} color={isFiberIncDisabled ? "rgba(255,255,255,0.2)" : "#FFF"} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Text style={styles.nutritionItemVal}>{Math.round((parseFloat(editFiber || '0') || 0) * multiplier)}g</Text>
                      )}
                    </View>
                  )}

                  {result.sugar !== undefined && result.sugar !== null && (
                    <View style={[styles.nutritionItemRow, { borderBottomWidth: 0 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="alert-circle-outline" size={16} color="#F59E0B" />
                        <Text style={styles.nutritionItemKey}>Total Sugar</Text>
                      </View>
                      <Text style={styles.nutritionItemVal}>{Math.round((parseFloat(String(result.sugar)) || 0) * multiplier)}g</Text>
                    </View>
                  )}
                </View>

                {/* Ingredients Section */}
                {result.ingredients ? (
                  <View style={styles.ingredientsContainer}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}
                      onPress={() => setIngredientsExpanded(!ingredientsExpanded)}
                    >
                      <Text style={styles.ingredientsTitle}>Ingredients</Text>
                      <Ionicons name={ingredientsExpanded ? "chevron-up" : "chevron-down"} size={18} color="#FFF" />
                    </TouchableOpacity>
                    
                    {ingredientsExpanded && (
                      <Text style={styles.ingredientsList}>
                        {result.ingredients}
                      </Text>
                    )}
                  </View>
                ) : null}

                {/* Bottom Button Row */}
                {result.isDrink && !drinkConfirmed && mode === 'food' ? (
                  <View style={styles.bottomActionsRow}>
                    <TouchableOpacity 
                      style={[styles.saveMealBtn, { backgroundColor: '#333', flex: 1 }]} 
                      disabled={true}
                    >
                      <Text style={[styles.saveMealText, { color: 'rgba(255,255,255,0.4)' }]}>
                        Confirm beverage category to save
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.bottomActionsRow}>
                    {photoBase64 && (
                      <TouchableOpacity style={styles.fixResultsBtn} onPress={() => setShowFixResults(true)}>
                        <Ionicons name="add" size={18} color="#FFF" />
                        <Text style={styles.fixResultsText}>Fix Results</Text>
                      </TouchableOpacity>
                    )}

                    {editingLogId && (
                      <TouchableOpacity style={styles.deleteMealBtn} onPress={handleDeleteMeal}>
                        <Ionicons name="trash-outline" size={18} color="#FF4444" />
                        <Text style={styles.deleteMealText}>Delete</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity style={[styles.saveMealBtn, !photoBase64 && !editingLogId && { flex: 1 }]} onPress={handleSaveMeal}>
                      <Text style={styles.saveMealText}>{editingLogId ? 'Update Meal' : 'Save Meal'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </ViewShot>
    );
  }

  // Camera view
  return (
    <View style={styles.cameraContainer}>
      {isFocused && (
        <CameraView
          style={StyleSheet.absoluteFillObject}
          ref={cameraRef}
          facing="back"
          flash={flashOn ? 'on' : 'off'}
          barcodeScannerSettings={
            mode === 'barcode'
              ? { barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'] }
              : undefined
          }
          onBarcodeScanned={mode === 'barcode' ? handleBarcodeScanned : undefined}
        />
      )}

      {/* Target scanning guides */}
      <View style={styles.targetContainer} pointerEvents="none">
        <View style={[
          styles.targetFrame, 
          mode === 'barcode' && { height: 140, width: 310 },
          mode === 'label' && { height: 360, width: 280 }
        ]}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
        <Text style={styles.targetText}>
          {mode === 'food' ? 'Point camera at your meal' : mode === 'barcode' ? 'Align barcode inside the box' : 'Align nutrition label inside the box'}
        </Text>
      </View>

      {/* Top Header Overlay */}
      <SafeAreaView style={styles.cameraHeaderOverlay} edges={['top']}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerRoundBtn}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleOpenFoodHistory} style={styles.headerHistoryBtn}>
            <Ionicons name="time-outline" size={18} color={colors.accent} />
            <Text style={styles.headerHistoryText}>Food History</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* FOOD HISTORY MODAL */}
      <Modal visible={showFoodHistory} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheetContent}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Food History</Text>
              <TouchableOpacity onPress={() => setShowFoodHistory(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            {historyLoading ? (
              <View style={{ paddingVertical: 40, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator color={colors.accent} size="large" />
              </View>
            ) : foodHistory.length === 0 ? (
              <View style={{ paddingVertical: 40, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No meals logged yet.</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} style={{ maxHeight: 400 }}>
                {foodHistory.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.historyItemCard}
                    onPress={() => handleSelectHistoryItem(item)}
                  >
                    <View style={styles.historyItemHeader}>
                      <Text style={styles.historyItemName} numberOfLines={1}>{item.food_name}</Text>
                      <Text style={styles.historyItemDate}>{formatHistoryDate(item.logged_at)}</Text>
                    </View>
                    <View style={styles.historyItemMacros}>
                      <Text style={styles.historyItemMacroText}>{item.calories} kcal</Text>
                      <View style={styles.macroDot} />
                      <Text style={styles.historyItemMacroText}>P: {item.protein_g}g</Text>
                      <View style={styles.macroDot} />
                      <Text style={styles.historyItemMacroText}>C: {item.carbs_g}g</Text>
                      <View style={styles.macroDot} />
                      <Text style={styles.historyItemMacroText}>F: {item.fat_g}g</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Bottom controls overlay */}
      <SafeAreaView style={styles.cameraBottomOverlay} edges={['bottom']}>
        <View style={styles.cameraControlsContainer}>
          {/* Camera Capture Guidance Card */}
          {mode === 'food' && (
            <TouchableOpacity 
              style={styles.tipsPill} 
              onPress={() => setShowTips(!showTips)}
              activeOpacity={0.8}
            >
              <Ionicons name="information-circle-outline" size={15} color={colors.accent} />
              <Text style={styles.tipsPillText}>Scan Tips</Text>
              <Ionicons name={showTips ? "chevron-up" : "chevron-down"} size={14} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}

          {mode === 'food' && showTips && (
            <View style={styles.guidanceCard}>
              <Text style={styles.guidanceText}>
                Best results when the entire meal is clearly visible.
              </Text>
              <View style={styles.guidanceGrid}>
                <View style={styles.guidanceGridCol}>
                  <Text style={styles.guidanceBullet}>✅ Keep entire meal visible</Text>
                  <Text style={styles.guidanceBullet}>✅ Use good lighting</Text>
                  <Text style={styles.guidanceBullet}>✅ Avoid strong shadows</Text>
                </View>
                <View style={styles.guidanceGridCol}>
                  <Text style={styles.guidanceBullet}>✅ Angle ~45° or above</Text>
                  <Text style={styles.guidanceBullet}>✅ Include full plate/bowl</Text>
                  <Text style={styles.guidanceBullet}>✅ Avoid blurry photos</Text>
                </View>
              </View>
            </View>
          )}

          {/* Mode pills */}
          <View style={styles.modeSelectorRow}>
            <TouchableOpacity
              style={[styles.modePill, mode === 'food' && styles.modePillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMode('food');
              }}
            >
              <Ionicons name="camera" size={14} color={mode === 'food' ? '#000' : 'rgba(255,255,255,0.8)'} />
              <Text style={[styles.modePillText, mode === 'food' && styles.modePillTextActive]}>Scan Food</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modePill, mode === 'barcode' && styles.modePillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMode('barcode');
              }}
            >
              <Ionicons name="barcode-outline" size={14} color={mode === 'barcode' ? '#000' : 'rgba(255,255,255,0.8)'} />
              <Text style={[styles.modePillText, mode === 'barcode' && styles.modePillTextActive]}>Barcode</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modePill, mode === 'label' && styles.modePillActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setMode('label');
              }}
            >
              <Ionicons name="list-outline" size={14} color={mode === 'label' ? '#000' : 'rgba(255,255,255,0.8)'} />
              <Text style={[styles.modePillText, mode === 'label' && styles.modePillTextActive]}>Nutrition Label</Text>
            </TouchableOpacity>
          </View>

          {/* Shutter row */}
          {mode !== 'barcode' && (
            <View style={styles.shutterRow}>
              <TouchableOpacity style={styles.flashBtn} onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFlashOn(!flashOn);
              }}>
                <Ionicons name={flashOn ? "flash" : "flash-off"} size={22} color="#FFF" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.shutterBtn} onPress={handleCapturePhoto}>
                <View style={styles.shutterInner} />
              </TouchableOpacity>

              <View style={{ width: 44 }} />
            </View>
          )}
        </View>
      </SafeAreaView>


      {/* FIX RESULTS MODAL */}
      <Modal visible={showFixResults} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheetContent, { maxHeight: '60%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Fix Results</Text>
              <TouchableOpacity onPress={() => setShowFixResults(false)} style={styles.modalCloseBtn}>
                <Ionicons name="close" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>

            <View style={{ gap: 14, paddingBottom: 24 }}>
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 18 }}>
                Let the AI know what was incorrect or what details were missed (e.g. "I added a scoop of whey protein" or "actually this is brown rice").
              </Text>

              <TextInput
                style={[styles.modalTextInput, { minHeight: 80, textAlignVertical: 'top' }]}
                placeholder="Type your corrections here..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                multiline
                numberOfLines={3}
                value={fixFeedback}
                onChangeText={setFixFeedback}
              />

              <TouchableOpacity
                style={styles.modalSubmitBtn}
                onPress={handleFixResults}
                disabled={fixLoading}
              >
                {fixLoading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Re-Analyze Image</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { color: colors.subtext, fontSize: 15, fontWeight: '500' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.bg },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  
  // Camera layout
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  cameraHeaderOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10 },
  headerRoundBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  headerHistoryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  headerHistoryText: { color: colors.accent, fontWeight: '600', fontSize: 14 },
  
  // Target scanner outlines
  targetContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  targetFrame: { width: 310, height: 310, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#FFF' },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  targetText: { color: '#FFF', fontSize: 13, fontWeight: '600', marginTop: 18, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, overflow: 'hidden' },

  // Bottom camera bar
  cameraBottomOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  cameraControlsContainer: { paddingBottom: 24, alignItems: 'center', gap: 16 },
  modeSelectorRow: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 24, gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20 },
  modePillActive: { backgroundColor: colors.accent },
  modePillText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 'bold' },
  modePillTextActive: { color: '#000' },
  shutterRow: { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'space-between', paddingHorizontal: 48 },
  flashBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  shutterBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 5, borderColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  shutterInner: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFF' },

  // Results UI
  roastContent: { padding: 20, gap: 16, paddingBottom: 40 },
  previewImageContainer: { width: '100%', height: 200, borderRadius: 20, overflow: 'hidden', position: 'relative', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  previewImage: { width: '100%', height: '100%' },
  imageShareOverlay: { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.7)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 12 },
  shareOverlayText: { color: '#FFF', fontSize: 11, fontWeight: '600' },

  // Meal Title Section
  foodNameSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 4 },
  foodNameRow: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 },
  foodNameText: { color: '#FFF', fontSize: 22, fontWeight: 'bold' },
  nameEditBtn: { padding: 4 },
  foodNameInput: { flex: 1, color: '#FFF', fontSize: 22, fontWeight: 'bold', borderBottomWidth: 1, borderBottomColor: colors.accent, paddingBottom: 2 },
  servingSizeContainer: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginTop: 8
  },
  servingSizeTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10
  },
  servingSizeRow: {
    flexDirection: 'row',
    gap: 8
  },
  servingSizePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)'
  },
  servingSizePillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  servingSizeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: 'bold'
  },
  servingSizeTextActive: {
    color: '#000'
  },

  nutritionCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginTop: 8
  },
  nutritionTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold'
  },
  nutritionItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)'
  },
  nutritionItemKey: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '500'
  },
  nutritionItemVal: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold'
  },

  ingredientsContainer: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginTop: 8
  },
  ingredientsHeader: {
    paddingVertical: 4
  },
  ingredientsTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold'
  },
  ingredientsList: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 10
  },

  // Health Score Card
  healthScoreCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  healthScoreTitle: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  healthScoreLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '500' },
  scoreCircleBg: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(167, 139, 250, 0.12)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.accent },
  scoreCircleText: { color: colors.accent, fontSize: 16, fontWeight: 'bold' },

  // Roast Card
  roastCard: { backgroundColor: colors.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  roastText: { color: 'rgba(255,255,255,0.9)', fontSize: 14, lineHeight: 22, textAlign: 'center' },

  // AI Recommendations
  suggestionsCard: { backgroundColor: colors.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', gap: 4 },
  suggestionsTitle: { color: '#FFF', fontSize: 14, fontWeight: 'bold' },
  suggestionsText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 18 },

  // Action Buttons
  bottomActionsRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  fixResultsBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingVertical: 16 },
  fixResultsText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
  saveMealBtn: { flex: 1, backgroundColor: colors.accent, borderRadius: 20, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  saveMealText: { color: '#000', fontSize: 15, fontWeight: 'bold' },
  deleteMealBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#FF4444', borderRadius: 20, paddingVertical: 16 },
  deleteMealText: { color: '#FF4444', fontSize: 15, fontWeight: 'bold' },

  // Modals Base
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalSheetContent: { backgroundColor: '#111117', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%', borderTopWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
  modalCloseBtn: { padding: 4 },
  inputGroup: { gap: 6 },
  inputLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 'bold', letterSpacing: 1.5 },
  modalTextInput: { backgroundColor: '#0B0B0F', color: '#FFF', borderRadius: 12, padding: 12, fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  modalSubmitBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  modalSubmitBtnText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
  permissionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  permissionTitle: { color: '#FFF', fontSize: 22, fontWeight: 'bold', marginTop: 16, marginBottom: 8 },
  permissionSubtitle: { color: colors.subtext, fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  grantBtn: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 32 },
  grantBtnText: { color: '#000', fontSize: 16, fontWeight: 'bold' },

  // History Item Cards
  historyItemCard: { backgroundColor: '#1A1A24', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', marginBottom: 8 },
  historyItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  historyItemName: { color: '#FFF', fontSize: 15, fontWeight: 'bold', flex: 1, marginRight: 8 },
  historyItemDate: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  historyItemMacros: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  historyItemMacroText: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  macroDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },

  // Label details
  labelDetailsCard: { backgroundColor: colors.card, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', gap: 8, marginTop: 8 },
  labelDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)', paddingVertical: 8 },
  labelDetailKey: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '500' },
  labelDetailVal: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },
  labelDetailIngredients: { color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 18, marginTop: 2 },

  // Tips Pill
  tipsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignSelf: 'center',
    marginBottom: 8,
  },
  tipsPillText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Guidance card
  guidanceCard: {
    backgroundColor: 'rgba(17, 17, 23, 0.9)',
    borderRadius: 20,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    width: '90%',
    maxWidth: 360,
    alignSelf: 'center',
    gap: 6,
    marginBottom: 8,
  },
  guidanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  guidanceTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  guidanceText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 10,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  guidanceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  guidanceGridCol: {
    flex: 1,
    gap: 4,
  },
  guidanceBullet: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 9.5,
    fontWeight: '500',
  },

  // Recovery card
  recoveryCard: {
    backgroundColor: 'rgba(255, 215, 0, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    borderRadius: 20,
    padding: 16,
    gap: 8,
    marginTop: 8,
  },
  recoveryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recoveryTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  recoverySubtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    lineHeight: 16,
  },
  recoveryOptionsContainer: {
    gap: 8,
    marginTop: 4,
  },
  recoveryOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  recoveryOptionText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
  },

  // Detected Items card
  detectedItemsCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginTop: 8,
  },
  detectedItemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  detectedItemsTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  detectedItemsList: {
    gap: 6,
  },
  detectedItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  detectedItemBullet: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: 'bold',
  },
  detectedItemText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 13,
    lineHeight: 18,
  },

  // Drink Clarification Styles
  drinkClarifyCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginTop: 8,
  },
  drinkClarifyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  drinkClarifyTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  drinkNameHuge: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginVertical: 12,
  },
  drinkConfirmBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  drinkConfirmText: {
    color: '#000',
    fontSize: 15,
    fontWeight: 'bold',
  },
  drinkClarifySubtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginBottom: 12,
  },
  drinkAltContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  drinkAltPill: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  drinkAltPillText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
  },
  drinkGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  drinkGridItem: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drinkGridItemActive: {
    backgroundColor: 'rgba(167, 139, 250, 0.12)',
    borderColor: colors.accent,
  },
  drinkGridItemText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  drinkCustomInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    width: '100%',
  },
  drinkCustomInput: {
    flex: 1,
    backgroundColor: '#0B0B0F',
    color: '#FFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  drinkCustomSubmitBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drinkCustomSubmitBtnText: {
    color: '#000',
    fontWeight: 'bold',
  },
  shakeSectionTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 6,
  },
  shakePillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  shakeOptionPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shakeOptionPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  shakeOptionText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: 'bold',
  },
  shakeOptionTextActive: {
    color: '#000',
  },
  shakeRecalcLabel: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },

  // Inline Edit Nutrition Styles
  nutritionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  nutritionSubtitle: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    fontWeight: '500',
  },
  inlineEditControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineEditBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  inlineEditBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderColor: 'rgba(255,255,255,0.03)',
  },
  inlineEditVal: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    minWidth: 50,
    textAlign: 'center',
  },
});
