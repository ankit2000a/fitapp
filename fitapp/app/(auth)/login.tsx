import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Image } from 'react-native';
import { useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Configure Native Google Sign-In
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    });
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken || (userInfo as any).idToken;

      if (idToken) {
        console.log('Sending Google ID token to Supabase...');
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });
        if (error) throw error;
        console.log('Google Sign-In successful:', data?.user?.id);
        await AsyncStorage.setItem('just_signed_up', 'true');
      } else {
        throw new Error('No ID token returned from Google Sign-In.');
      }
    } catch (e: any) {
      // Avoid alerts for common cancellation codes:
      // - '12501': user cancelled
      // - 'ASYNC_OP_IN_PROGRESS': another sign in is active
      if (e.code !== 'ASYNC_OP_IN_PROGRESS' && e.code !== '12501' && e.code !== 'DEVELOPER_ERROR') {
        Alert.alert('Error', e.message);
      } else if (e.code === 'DEVELOPER_ERROR') {
        console.warn('Google Sign-In Developer Error: Check if Google Client IDs in .env and Supabase settings are correct.');
        Alert.alert('Configuration Required', 'Please configure EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID and EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID in your .env file and Supabase Dashboard.');
      }
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Image 
        source={require('../../assets/images/logo-egg.png')} 
        style={styles.logoImage} 
      />
      <Text style={styles.title}>FitApp</Text>
      <Text style={styles.subtitle}>Level Up Your Health</Text>

      <TouchableOpacity style={styles.googleButton} onPress={signInWithGoogle} disabled={loading}>
        {loading
          ? <ActivityIndicator color="#000" />
          : <>
              <Text style={styles.googleIcon}>G</Text>
              <Text style={styles.googleText}>Continue with Google</Text>
            </>
        }
      </TouchableOpacity>
      <Text style={styles.disclaimer}>By continuing you agree to our Terms & Privacy Policy</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  logoImage: { width: 90, height: 90, marginBottom: 12 },
  logo: { fontSize: 64, marginBottom: 8 },
  title: { color: colors.text, fontSize: 42, fontWeight: 'bold' },
  subtitle: { color: colors.subtext, fontSize: 16, marginBottom: 32 },
  googleButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24, gap: 12, width: '100%', justifyContent: 'center' },
  googleIcon: { fontSize: 20, fontWeight: 'bold', color: '#4285F4' },
  googleText: { fontSize: 16, fontWeight: '600', color: '#000' },
  disclaimer: { color: colors.subtext, fontSize: 11, textAlign: 'center', marginTop: 16 },
});
