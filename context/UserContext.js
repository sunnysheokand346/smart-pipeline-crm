import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { supabase } from '../supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTransientSignIn, setTransientSignIn } from '../utils/transientSignIn';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const transientClearTimeout = useRef(null);

  const fetchUserProfile = async (userObj) => {
    if (!userObj) return null;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userObj.id)
        .single();

      if (!error) {
        setProfile(data);
        // If the profile is marked paused/disabled, immediately sign out to prevent access.
        if (data?.is_paused) {
          try {
            await supabase.auth.signOut();
          } catch (e) {
            console.warn('Failed to sign out paused user', e?.message || e);
          }
          setUser(null);
          Alert.alert('Account disabled', 'This account has been disabled. Contact your manager.');
        }
      }
    } catch (err) {
      console.error('Profile fetch error:', err.message);
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
      await AsyncStorage.removeItem('rememberMe');
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error('Logout error:', err.message);
    }
  };

  useEffect(() => {
    let mounted = true;

    const scheduleClearTransient = () => {
      if (transientClearTimeout.current) {
        clearTimeout(transientClearTimeout.current);
      }
      transientClearTimeout.current = setTimeout(async () => {
        try {
          setTransientSignIn(false);
          await AsyncStorage.removeItem('transientSignIn');
        } catch (e) { /* ignore */ }
        transientClearTimeout.current = null;
      }, 800);
    };

    const restoreSession = async () => {
      console.log('UserContext: restoreSession start');
      try {
        const remember = await AsyncStorage.getItem('rememberMe');
        const transientInMemory = getTransientSignIn();
        const transientStorage = await AsyncStorage.getItem('transientSignIn');
        const transient = transientInMemory || transientStorage === 'true';
        console.log('UserContext: restoreSession flags', { remember, transientInMemory, transientStorage, transient });

        if (remember === 'true' || transient) {
          const { data: { session }, error } = await supabase.auth.getSession();
          console.log('UserContext: restoreSession session', { session: !!session, error: error?.message });
          if (!error && session && mounted) {
            setUser(session.user);
            await fetchUserProfile(session.user);
            if (transient) {
              scheduleClearTransient();
            }
          }
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          console.log('UserContext: restoreSession no-remember sessionExists', !!session);
          if (session && mounted) {
            await supabase.auth.signOut();
            console.log('UserContext: restoreSession signed out because not remembered');
            setUser(null);
          }
        }
      } catch (err) {
        console.error('Session restore error:', err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    restoreSession();

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      console.log('UserContext:onAuthStateChange event', { event, userId: session?.user?.id });
      try {
        const transientInMemory = getTransientSignIn();
        const transientStorage = await AsyncStorage.getItem('transientSignIn');
        const transient = transientInMemory || transientStorage === 'true';
        const remember = await AsyncStorage.getItem('rememberMe');
        console.log('UserContext:onAuthStateChange flags', { remember, transientInMemory, transientStorage, transient });

        if (remember !== 'true' && !transient) {
          if (session?.user) {
            await supabase.auth.signOut();
          }
          console.log('UserContext:onAuthStateChange signing out because neither remembered nor transient');
          setUser(null);
          return;
        }

        console.log('UserContext:onAuthStateChange accepting session', { user: !!session?.user });
        setUser(session?.user || null);
        if (session?.user) await fetchUserProfile(session.user);

        if (transient) {
          console.log('UserContext:onAuthStateChange scheduling clearing transient markers');
          scheduleClearTransient();
        }
      } catch (err) {
        console.error('Auth state handler error:', err.message);
      }
    });

    return () => {
      mounted = false;
      if (transientClearTimeout.current) {
        clearTimeout(transientClearTimeout.current);
        transientClearTimeout.current = null;
      }
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <UserContext.Provider value={{ user, profile, loading, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
