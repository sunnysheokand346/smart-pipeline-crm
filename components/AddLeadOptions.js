import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, Card } from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';

console.log('🟢 Entered AddLeadOptions.js');

export default function AddLeadOptions() {
  const navigation = useNavigation();
  console.log('🔵 Rendering AddLeadOptions component');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add New Leads</Text>

      <Card style={styles.card}>
        <Button
          mode="contained"
          icon="form-select"
          onPress={() => {
            console.log('🟡 Navigating to Add Lead Form');
            navigation.navigate('Add Lead Form');
          }}
        >
          Add via Form
        </Button>
      </Card>

      <Card style={styles.card}>
        <Button
          mode="contained"
          icon="file-upload"
          onPress={() => {
            console.log('🟡 Navigating to Upload Excel');
            navigation.navigate('Upload Excel');
          }}
        >
          Upload Excel
        </Button>
      </Card>

      <Card style={styles.card}>
        <Button
          mode="contained"
          icon="cloud-download"
          onPress={() => {
            console.log('🟡 Meta Ads Integration button clicked');
            alert('Meta Ads Integration Coming Soon');
          }}
        >
          Fetch from Meta Ads
        </Button>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    marginBottom: 16,
    padding: 12,
  },
});
