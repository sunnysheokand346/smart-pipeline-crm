import { supabase } from '../supabaseClient';
import React, { useState, useEffect } from 'react';
import { View, TextInput, Button, Alert, StyleSheet, Text, ActivityIndicator, ScrollView } from 'react-native';
import { Appbar } from 'react-native-paper';
import { useUser } from '../context/UserContext';
import { Dropdown } from 'react-native-element-dropdown';
import { uploadLeadsToSupabase } from '../utils/uploadLeadsToSupabase';

export default function LeadForm({ navigation }) {
  const { profile } = useUser();

  // State for existing and new fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [assignedTo, setAssignedTo] = useState(null);
  const [telecallers, setTelecallers] = useState([]);
  const [loadingTelecallers, setLoadingTelecallers] = useState(false);

  if (!profile) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Loading profile...</Text>
      </View>
    );
  }

  const role = (profile?.role || '').trim().toLowerCase();
  // For managers, their own profile id is the manager id for their team
  // For telecallers, their manager_id is the manager's id
  const managerId = role === 'manager' ? profile.id : profile.manager_id;

  useEffect(() => {
    const fetchTelecallers = async () => {
      if (role !== 'manager' || !managerId) return;

      setLoadingTelecallers(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username')
        .eq('role', 'telecaller')
        .eq('manager_id', managerId);

      if (error) {
        Alert.alert('Error', 'Could not load telecallers.');
      } else {
        const formatted = (data || []).map((tc) => ({
          label: `${tc.name} (${tc.username})`,
          value: tc.id,
        }));
        setTelecallers(formatted);
      }
      setLoadingTelecallers(false);
    };

    fetchTelecallers();
  }, [role, managerId]);

  const handleSubmit = async () => {
    if (!name || !phone || !source) {
      Alert.alert('Name, Phone, and Source are required fields');
      return;
    }

    if (role === 'manager' && !assignedTo) {
      Alert.alert('Please select a telecaller to assign');
      return;
    }

    const lead = {
      name: name.trim(),
      phone: phone.trim(),
      source: source.trim(),
      city: city.trim(),
      state: state.trim(),
      email: email.trim(),
      notes: notes.trim(),
      status: 'New',
      manager_id: managerId,
      // This logic correctly assigns to the selected telecaller for managers,
      // or to the telecaller themselves if they are logged in.
      assigned_to: role === 'manager' ? assignedTo : profile.id,
      // For telecallers, also set the manager_id to their manager's id
      ...(role === 'telecaller' && { manager_id: profile.manager_id }),
    };

    try {
      const { insertedCount, skippedCount, duplicateCount } = await uploadLeadsToSupabase([lead]);

      Alert.alert(
        'Lead Submission',
        `✅ ${insertedCount} added\n❌ ${duplicateCount} duplicate\n⚠️ ${skippedCount} skipped`
      );

      if (insertedCount > 0) {
        // Clear all fields after successful submission
        setName('');
        setPhone('');
        setSource('');
        setCity('');
        setState('');
        setEmail('');
        setNotes('');
        setAssignedTo(null);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to submit lead');
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="🚀 Add New Lead" />
      </Appbar.Header>
      <ScrollView style={styles.scrollContainer}>

      <TextInput
        style={styles.input}
        placeholder="Name*"
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Phone*"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        placeholder="Source* (e.g. Facebook)"
        value={source}
        onChangeText={setSource}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="City"
        value={city}
        onChangeText={setCity}
      />
      <TextInput
        style={styles.input}
        placeholder="State"
        value={state}
        onChangeText={setState}
      />
      <TextInput
        style={[styles.input, styles.notesInput]}
        placeholder="Notes"
        value={notes}
        onChangeText={setNotes}
        multiline={true}
        numberOfLines={4}
      />

      {/* Manager-specific assignment UI */}
      {role === 'manager' && (
        <>
          <Text style={styles.label}>Assign to Telecaller:</Text>
          {loadingTelecallers ? (
            <ActivityIndicator size="small" color="blue" />
          ) : telecallers.length === 0 ? (
            <Text style={{ color: 'red', marginBottom: 12 }}>
              ⚠️ No telecallers found under your team.
            </Text>
          ) : (
            <Dropdown
              style={styles.dropdown}
              placeholderStyle={styles.placeholderStyle}
              selectedTextStyle={styles.selectedTextStyle}
              data={telecallers}
              maxHeight={200}
              labelField="label"
              valueField="value"
              placeholder="Select Telecaller"
              value={assignedTo}
              onChange={(item) => {
                setAssignedTo(item.value);
              }}
            />
          )}
        </>
      )}

        <Button title="Submit Lead" onPress={handleSubmit} />
        <View style={{ height: 50 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  appbar: { backgroundColor: '#6200ee' },
  scrollContainer: { flex: 1, padding: 20, paddingTop: 40 },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    alignSelf: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 12,
    marginBottom: 12,
    borderRadius: 6,
  },
  notesInput: {
    height: 100,
    textAlignVertical: 'top', // Aligns placeholder to the top for multiline
  },
  label: {
    marginTop: 12,
    marginBottom: 6,
    fontSize: 16,
    fontWeight: '500',
  },
  dropdown: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  placeholderStyle: {
    color: '#888',
  },
  selectedTextStyle: {
    fontSize: 16,
    color: '#000',
  },
});
