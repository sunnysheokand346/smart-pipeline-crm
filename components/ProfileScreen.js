import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, Button, Card, Title, Avatar, TextInput, ActivityIndicator, IconButton } from 'react-native-paper';
import { useUser } from '../context/UserContext';
import { supabase } from '../supabaseClient';

export default function ProfileScreen() {
  const { profile, setProfile } = useUser();
  
  const [isEditing, setIsEditing] = useState(false);
  
  // State for editable fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setUsername(profile.username || '');
    }
  }, [profile]);

  const handleUpdateProfile = async () => {
    if (!name.trim() || !username.trim()) {
      Alert.alert("Name and Username are required");
      return;
    }

    setLoading(true);
    const updates = {
        name: name.trim(),
        username: username.trim(),
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id)
      .select()
      .single();

    if (error) {
      Alert.alert('Error', 'Failed to update profile details.');
    } else {
      Alert.alert('Success', 'Profile updated successfully!');
      setProfile(data);
      setIsEditing(false);
    }
    setLoading(false);
  };

  const hasChanges = profile && (
    name !== (profile.name || '') ||
    username !== (profile.username || '')
  );

  if (!profile) return <View style={styles.container}><ActivityIndicator /></View>;

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content style={styles.content}>
          <Avatar.Text 
            size={80} 
            label={name ? name.charAt(0).toUpperCase() : 'U'} 
            style={styles.avatar} 
          />
          <Title style={styles.name}>{profile.name || 'User'}</Title>
          <Text style={styles.info}>Role: {profile.role}</Text>
          <Text style={styles.info}>Email: {profile.email}</Text>
        </Card.Content>
      </Card>

      <Card style={styles.editCard}>
        <Card.Content>
            <View style={styles.editHeader}>
                <Title style={styles.editTitle}>Your Information</Title>
                {!isEditing && (
                    <IconButton icon="pencil" size={22} onPress={() => setIsEditing(true)} />
                )}
            </View>

            <TextInput label="Full Name" value={name} onChangeText={setName} style={styles.input} mode="outlined" disabled={!isEditing} />
            <TextInput label="Username" value={username} onChangeText={setUsername} style={styles.input} mode="outlined" disabled={!isEditing} autoCapitalize="none" />
        </Card.Content>
        {isEditing && (
          <Card.Actions>
            <Button onPress={() => setIsEditing(false)} style={styles.button} disabled={loading}>Cancel</Button>
            <Button mode="contained" onPress={handleUpdateProfile} style={styles.button} loading={loading} disabled={loading || !hasChanges}>Save Changes</Button>
          </Card.Actions>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  card: {
    borderRadius: 12,
    elevation: 4,
    marginBottom: 20,
  },
  editCard: {
    borderRadius: 12,
    elevation: 4,
  },
  content: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  avatar: {
    marginBottom: 16,
    backgroundColor: '#00346a',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  info: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  editHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  editTitle: {},
  input: {
    marginBottom: 16,
  },
  button: {
    flex: 1,
    margin: 8,
  }
});
