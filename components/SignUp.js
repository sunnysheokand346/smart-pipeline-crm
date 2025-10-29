// components/SignUp.js
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, ScrollView, Alert } from 'react-native';
import { TextInput, Button, Text, HelperText, RadioButton } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../supabaseClient';

export default function SignUp() {
  const navigation = useNavigation();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [isUsernameTaken, setIsUsernameTaken] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('manager');
  const [managerId, setManagerId] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password === confirmPassword || confirmPassword === '';

  // 🔎 Username availability check
  useEffect(() => {
    const checkUsername = async () => {
      const trimmed = username.trim().toLowerCase();
      if (!trimmed) {
        setIsUsernameTaken(false);
        return;
      }
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', trimmed)
        .maybeSingle();
      if (error) {
        console.error('Username check error:', error.message);
        return;
      }
      setIsUsernameTaken(!!data);
    };

    const debounce = setTimeout(checkUsername, 500);
    return () => clearTimeout(debounce);
  }, [username]);

  // 🔐 Sign-up handler
  const handleSignUp = async () => {
    if (!name || !username || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill all fields.');
      return;
    }

    if (!passwordsMatch) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    if (isUsernameTaken) {
      Alert.alert('Error', 'Username already taken.');
      return;
    }

    const finalUsername = username.trim().toLowerCase();

    setLoading(true);
    try {
      console.log('📥 Signing up:', { name, finalUsername, email, role, managerId });

      // Step 1️⃣ — Create user account (send confirmation email)
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) throw error;

      const user = data?.user;
      if (!user) {
        Alert.alert('Signup Error', 'User creation failed.');
        return;
      }

      console.log('📧 Confirmation email sent to:', email);

      // Step 2️⃣ — Navigate to OTP confirmation screen
      // We’ll update profile only after OTP verification
      navigation.navigate('OTP Confirmation', {
      email: email.trim().toLowerCase(),
      name,
      finalUsername,
      role,
      managerId: managerId
,
});

    } catch (err) {
      console.error('❌ Signup failed:', err.message);
      Alert.alert('Signup Error', err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Create Account</Text>

        <TextInput label="Full Name" value={name} onChangeText={setName} style={styles.input} />

        <TextInput
          label="Username"
          value={username}
          onChangeText={setUsername}
          style={styles.input}
          autoCapitalize="none"
        />
        {isUsernameTaken && username.trim() !== '' && (
          <HelperText type="error">Username already taken</HelperText>
        )}

        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          style={styles.input}
        />

        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />

        <TextInput
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          style={styles.input}
        />

        {!passwordsMatch && <HelperText type="error">Passwords do not match</HelperText>}

        <Text style={styles.roleLabel}>Role</Text>
        <RadioButton.Group onValueChange={setRole} value={role}>
          <View style={styles.radioRow}>
            <RadioButton value="manager" />
            <Text style={styles.radioLabel}>Manager</Text>
            <RadioButton value="telecaller" />
            <Text style={styles.radioLabel}>Telecaller</Text>
          </View>
        </RadioButton.Group>

        {role === 'telecaller' && (
          <TextInput
            label="Manager UUID"
            value={managerId}
            onChangeText={setManagerId}
            style={styles.input}
            autoCapitalize="none"
          />
        )}

        <Button
          mode="contained"
          onPress={handleSignUp}
          loading={loading}
          disabled={
            !name ||
            !username.trim() ||
            isUsernameTaken ||
            !email ||
            !password ||
            !confirmPassword ||
            !passwordsMatch ||
            (role === 'telecaller' && !managerId)
          }
        >
          Sign Up
        </Button>

        <Text style={styles.loginLink} onPress={() => navigation.navigate('SignIn')}>
          Already have an account? Sign In
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    flexGrow: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  input: { marginBottom: 16 },
  roleLabel: {
    fontSize: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  radioLabel: {
    marginRight: 16,
  },
  loginLink: {
    marginTop: 20,
    textAlign: 'center',
    color: '#00346a',
    textDecorationLine: 'underline',
  },
});
