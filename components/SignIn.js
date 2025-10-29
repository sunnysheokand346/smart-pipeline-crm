import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert, KeyboardAvoidingView, TouchableOpacity } from 'react-native';
import { TextInput, Button, Text, Title, Checkbox } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../supabaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setTransientSignIn } from '../utils/transientSignIn';

export default function SignIn() {
  const navigation = useNavigation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Restore rememberMe preference
  useEffect(() => {
    const loadRemember = async () => {
      const remember = await AsyncStorage.getItem('rememberMe');
      if (remember === 'true') setRememberMe(true);
      else setRememberMe(false);
    };
    loadRemember();
  }, []);

  const handleSignIn = async () => {
    if (!identifier || !password) {
      Alert.alert('Missing Fields', 'Please enter username/email and password');
      return;
    }

    setIsSigningIn(true);
    try {
      const input = identifier.trim().toLowerCase();

      console.log('🔍 Searching profile for input:', input);

      // Find profile by username or email (case-insensitive)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email, username, is_paused')
        .or(`username.ilike.${input},email.ilike.${input}`)
        .maybeSingle();

      if (profileError) {
        console.error('❌ Error fetching profile:', profileError.message);
        throw new Error('Could not find user. Please try again.');
      }

      if (!profile || !profile.email) {
        Alert.alert('Account Not Found', 'No account found with that username or email.');
        return;
      }

      if (profile.is_paused === true) {
        Alert.alert('Account Disabled', 'This account has been disabled by the admin.');
        return;
      }

      // Store rememberMe preference
      if (rememberMe) {
        await AsyncStorage.setItem('rememberMe', 'true');
      } else {
        await AsyncStorage.removeItem('rememberMe');
        setTransientSignIn(true);
        await AsyncStorage.setItem('transientSignIn', 'true');
      }

      console.log('🔐 Attempting to sign in with email:', profile.email);

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });

      if (signInError) {
        console.error('❌ Sign in failed:', signInError.message);
        throw new Error(signInError.message);
      }

      console.log('✅ Sign in successful');
      // Supabase auth listener should handle redirect after login
    } catch (error) {
      console.error('⚠️ SignIn Error:', error.message);
      try {
        setTransientSignIn(false);
        await AsyncStorage.removeItem('transientSignIn');
      } catch (e) {
        // ignore cleanup errors
      }
      Alert.alert('Sign In Failed', error.message || 'Unable to sign in.');
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <Title style={styles.title}>Smart Pipeline CRM</Title>
      <Text style={styles.subtitle}>Sign in to continue</Text>

      <TextInput
        label="Username or Email"
        value={identifier}
        onChangeText={setIdentifier}
        mode="outlined"
        style={styles.input}
        autoCapitalize="none"
        left={<TextInput.Icon icon="account" />}
      />

      <TextInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        mode="outlined"
        secureTextEntry={!isPasswordVisible}
        style={styles.input}
        left={<TextInput.Icon icon="lock" />}
        right={
          <TextInput.Icon
            icon={isPasswordVisible ? 'eye-off' : 'eye'}
            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
          />
        }
      />

      <View style={styles.optionsContainer}>
        <Checkbox.Item
          label="Remember Me"
          status={rememberMe ? 'checked' : 'unchecked'}
          onPress={() => setRememberMe(!rememberMe)}
          position="leading"
          style={styles.checkboxContainer}
          labelStyle={styles.checkboxLabel}
        />
        <TouchableOpacity onPress={() => Alert.alert('Forgot Password', 'Coming soon')}>
          <Text style={styles.forgotPassword}>Forgot Password?</Text>
        </TouchableOpacity>
      </View>

      <Button
        mode="contained"
        onPress={handleSignIn}
        loading={isSigningIn}
        disabled={isSigningIn}
        style={styles.button}
        contentStyle={styles.buttonContent}
      >
        {isSigningIn ? 'Signing In...' : 'Sign In'}
      </Button>

      <Button
        mode="text"
        onPress={() => navigation.navigate('SignUp')}
        style={styles.link}
      >
        Don't have an account? Sign Up
      </Button>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subtitle: { textAlign: 'center', marginBottom: 40, color: '#666' },
  input: { marginBottom: 16 },
  optionsContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  checkboxContainer: { paddingHorizontal: 0, paddingVertical: 0, marginLeft: -10 },
  checkboxLabel: { color: '#666' },
  forgotPassword: { textAlign: 'right', color: '#00346a', fontWeight: 'bold' },
  button: { marginTop: 8 },
  buttonContent: { paddingVertical: 8 },
  link: { marginTop: 20 },
});
