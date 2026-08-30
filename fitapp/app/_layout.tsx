import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { Alert, View, Text, Image } from 'react-native';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RootLayout() {
  const router = useRouter();
  const [appReady, setAppReady] = useState(false);
  const [targetRoute, setTargetRoute] = useState<string | null>(null);
  const authCheckInProgress = useRef(false);

  const clearAuthData = async (shouldSignOut = true) => {
    console.log('clearAuthData: Clearing all auth & local storage, shouldSignOut =', shouldSignOut);
    if (shouldSignOut) {
      try {
        // Fire and forget signOut so it never blocks local storage clearing and navigation
        supabase.auth.signOut().catch(e => console.log('signOut error:', e));
      } catch (e) {
        console.log('signOut error:', e);
      }
    }

    try {
      await AsyncStorage.clear();
    } catch (e) {
      console.log('AsyncStorage clear error:', e);
    }

    try {
      // Clear Zustand persisted state if exists safely
      // @ts-ignore
      if (typeof useAuthStore !== 'undefined') {
        // @ts-ignore
        useAuthStore.persist?.clearStorage?.();
        // @ts-ignore
        useAuthStore.getState?.().reset?.();
      }
    } catch (e) {
      console.log('Zustand clear error:', e);
    }
  };

  const performAuthCheck = async (session: any) => {
    if (authCheckInProgress.current) return;
    authCheckInProgress.current = true;

    console.log('Session validation: id =', session?.user?.id);

    if (!session?.user) {
      console.log('No session user found. Preparing logout.');
      await clearAuthData(true);
      setTargetRoute('/(auth)/login');
      setAppReady(true);
      authCheckInProgress.current = false;
      return;
    }

    try {
      // 1. Validate session against Supabase Auth (treat Supabase as source of truth)
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      console.log('Session validation against Supabase Auth: user exists =', !!user);

      if (authError || !user) {
        console.log('Supabase Auth user is invalid or deleted. Preparing logout.');
        await clearAuthData(true);
        setTargetRoute('/(auth)/login');
        setAppReady(true);
        authCheckInProgress.current = false;
        return;
      }

      // 2. Fetch user profile from database
      const { data: profile, error: dbError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();

      console.log('Database profile validation: exists =', !!profile);

      if (dbError) {
        if (dbError.code === 'PGRST116') {
          console.log('Profile missing from DB (PGRST116). Directing to onboarding.');
          setTargetRoute('/(auth)/onboarding');
        } else {
          console.log('Database connection error fetching profile. Force logout.', dbError);
          await clearAuthData(true);
          setTargetRoute('/(auth)/login');
        }
      } else if (!profile || !profile.first_name || !profile.username) {
        console.log('Profile incomplete or missing from DB. Directing to onboarding.');
        setTargetRoute('/(auth)/onboarding');
      } else {
        // Profile exists and is complete, set storage and direct to dashboard
        try {
          await AsyncStorage.setItem('onboarded', 'true');
        } catch (e) {
          console.log('Error setting onboarded flag:', e);
        }
        setTargetRoute('/(tabs)');
      }
    } catch (e) {
      console.log('Auth check error. Preparing logout.', e);
      await clearAuthData(true);
      setTargetRoute('/(auth)/login');
    }

    setAppReady(true);
    authCheckInProgress.current = false;
  };

  useEffect(() => {
    let isMounted = true;

    // Safety timeout — never get stuck
    const timeout = setTimeout(() => {
      if (isMounted && !appReady) {
        console.log('Safety timeout triggered — checking local session to bypass safely');
        Promise.all([
          supabase.auth.getSession(),
          AsyncStorage.getItem('onboarded')
        ]).then(([{ data: { session } }, onboarded]) => {
          if (isMounted) {
            if (session?.user) {
              if (onboarded === 'true') {
                setTargetRoute('/(tabs)');
              } else {
                setTargetRoute('/(auth)/onboarding');
              }
            } else {
              setTargetRoute('/(auth)/login');
            }
            setAppReady(true);
          }
        }).catch(err => {
          console.log('Error in safety timeout bypass check:', err);
          if (isMounted) {
            setTargetRoute('/(auth)/login');
            setAppReady(true);
          }
        });
      }
    }, 10000);

    // Initial check
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        performAuthCheck(session);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('onAuthStateChange event:', event, 'session user:', session?.user?.id);
      if (event === 'SIGNED_OUT') {
        await clearAuthData(false);
        if (isMounted) {
          setTargetRoute('/(auth)/login');
          setAppReady(true);
        }
      } else if (event === 'SIGNED_IN' && session) {
        if (isMounted) {
          performAuthCheck(session);
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  // Safe navigation hook to route after the navigator stack mounts
  useEffect(() => {
    if (appReady && targetRoute) {
      console.log('Router is ready. Replacing route with:', targetRoute);
      const t = setTimeout(() => {
        router.replace(targetRoute as any);
      }, 100);
      return () => clearTimeout(t);
    }
  }, [appReady, targetRoute]);

  if (!appReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#111113', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <Image 
          source={require('../assets/images/logo-egg.png')} 
          style={{ width: 120, height: 120, marginBottom: 12 }} 
        />
        <Text style={{ color: '#FFFFFF', fontSize: 36, fontWeight: 'bold', letterSpacing: 4 }}>FITAPP</Text>
        <Text style={{ color: '#666', fontSize: 11, letterSpacing: 2 }}>LEVEL UP YOUR HEALTH</Text>
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
