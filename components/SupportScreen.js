import React from 'react';
import { View, StyleSheet, Linking, Alert } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';

export default function SupportScreen() {
  const handleCall = () => {
    const phoneNumber = '+919992199822';
    const url = `tel:${phoneNumber}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert('Error', 'Unable to make a call. Please check your device settings.');
      }
    }).catch(err => {
      console.error('Error opening dialer:', err);
      Alert.alert('Error', 'Failed to initiate call.');
    });
  };

  const handleEmail = () => {
    const email = 'care.smartpipeline@gmail.com';
    const url = `mailto:${email}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert('Error', 'No email app is configured on this device.');
      }
    }).catch(err => {
      console.error('Error opening email app:', err);
      Alert.alert('Error', 'Failed to open email app.');
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Support Team</Text>
      <Text style={styles.subtitle}>Contact the development team for assistance</Text>

      <Card style={styles.card}>
        <Button
          mode="contained"
          icon="phone"
          onPress={handleCall}
          style={styles.button}
        >
          Call Support
        </Button>
      </Card>

      <Card style={styles.card}>
        <Button
          mode="contained"
          icon="email"
          onPress={handleEmail}
          style={styles.button}
        >
          Email Support
        </Button>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#666',
  },
  card: {
    marginBottom: 20,
    padding: 10,
  },
  button: {
    paddingVertical: 10,
  },
});
