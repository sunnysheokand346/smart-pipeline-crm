import React, { useState } from 'react';
import { View, Alert, Platform, StyleSheet } from 'react-native';
import { Button, Card, Title, Paragraph } from 'react-native-paper';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system';
import { shareAsync } from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { supabase } from '../supabaseClient';
import { useUser } from '../context/UserContext';

export default function UploadExcel() {
  const { profile } = useUser();
  const [sampleFileUri, setSampleFileUri] = useState(null);

  if (!profile?.manager_id) {
    return (
      <View style={styles.centered}>
        <Paragraph style={{ marginBottom: 20, textAlign: 'center', color: 'red' }}>
          Manager ID missing from your profile. Please contact support.
        </Paragraph>
        <Button disabled mode="contained">
          Upload Excel
        </Button>
      </View>
    );
  }

  // Pick and process Excel file
  const pickExcel = async () => {
    console.log("🟡 Navigating to Upload Excel");
    let result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel'
      ],
    });

    if (result.type === 'cancel') {
      console.log("❌ User cancelled document picker");
      return;
    }

    const fileUri = result.uri ?? (result.assets && result.assets[0]?.uri);
    if (!fileUri) {
      Alert.alert("Error", "Could not get the file URI.");
      return;
    }

    try {
      const bstr = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
      const workbook = XLSX.read(bstr, { type: 'base64' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet);
      console.log(`✅ Parsed ${jsonData.length} leads from file`);
      await processLeads(jsonData);
    } catch (err) {
      console.error("❌ Error reading Excel:", err);
      Alert.alert("Error", "Failed to read Excel file.");
    }
  };

  // Process and upload leads with manager_id, duplicate check, and custom fields support
  const processLeads = async (leads) => {
    console.log('🧾 Total incoming leads:', leads.length);

    // Deduplicate incoming leads by phone within uploaded data
    const seenPhones = new Set();
    const freshLeadsInternal = [];

    leads.forEach((lead) => {
      if (!lead.phone) {
        console.log('⏭️ Skipping (no phone):', lead);
        return;
      }
      const phoneTrimmed = lead.phone.toString().trim();
      if (seenPhones.has(phoneTrimmed)) {
        console.log(`⏭️ Duplicate in upload skipped: ${phoneTrimmed}`);
      } else {
        seenPhones.add(phoneTrimmed);
        freshLeadsInternal.push({ ...lead, phone: phoneTrimmed });
      }
    });

    console.log(`📊 Deduplication inside upload → Fresh: ${freshLeadsInternal.length}, Duplicates: ${leads.length - freshLeadsInternal.length}`);

    // Fetch existing leads for this manager from Supabase
    const { data: existingLeads, error: fetchError } = await supabase
      .from('leads')
      .select('phone')
      .eq('manager_id', profile.manager_id);

    if (fetchError) {
      console.error("❌ Error fetching existing leads:", fetchError);
      Alert.alert("Error", "Failed to fetch existing leads from database.");
      return;
    }

    const existingPhones = new Set((existingLeads || []).map(l => l.phone.toString().trim()));

    // Filter out leads that already exist for this manager
    const freshLeads = freshLeadsInternal.filter(lead => !existingPhones.has(lead.phone));

    console.log(`📊 Deduplication against DB → Fresh: ${freshLeads.length}, Already exists: ${freshLeadsInternal.length - freshLeads.length}`);

    if (freshLeads.length > 0) {
      // Allowed standard columns
      const allowedColumns = ['name', 'phone', 'email', 'city', 'state'];

      // Split into fixed and custom fields
      const leadsToInsert = freshLeads.map(lead => {
        const fixed = {};
        const custom = {};

        Object.keys(lead).forEach(key => {
          if (allowedColumns.includes(key)) {
            fixed[key] = lead[key];
          } else {
            custom[key] = lead[key];
          }
        });

        return {
          ...fixed,
          custom_fields: Object.keys(custom).length > 0 ? custom : null,
          manager_id: profile.manager_id,
          assigned_to: null
        };
      });

      const { error: insertError } = await supabase
        .from('leads')
        .insert(leadsToInsert);

      if (insertError) {
        console.error("❌ Error inserting leads:", insertError);
        Alert.alert("Error", "Failed to save leads to database.");
        return;
      }

      console.log("✅ Leads saved successfully to Supabase");
    }

    Alert.alert(
      'Upload Complete',
      `Fresh leads: ${freshLeads.length}\nDuplicates in upload: ${leads.length - freshLeadsInternal.length}\nDuplicates in DB: ${freshLeadsInternal.length - freshLeads.length}`
    );
  };

  // Download sample Excel
  const downloadSample = async () => {
    console.log("🛠 Creating sample Excel file...");
    const sampleData = [
      {
        name: 'John Doe',
        phone: '1234567890',
        email: 'john@example.com',
        city: 'New York',
        state: 'NY',
        'Custom Question 1': 'Answer 1',
        'Custom Question 2': 'Answer 2',
        'Custom Question 3': 'Answer 3',
      },
      {
        name: 'Jane Smith',
        phone: '9876543210',
        email: 'jane@example.com',
        city: 'Los Angeles',
        state: 'CA',
        'Custom Question 1': 'Answer A',
        'Custom Question 2': '',
        'Custom Question 3': 'Answer C',
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");

    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileName = 'sample_leads.xlsx';

    try {
      const fileUri = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 });
      setSampleFileUri(fileUri);
      console.log(`✅ Sample file saved locally in cache: ${fileUri}`);

      if (Platform.OS === 'android') {
        const permission = await MediaLibrary.requestPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Permission denied', 'Permission to access media library is required to save the file.');
          return;
        }

        const asset = await MediaLibrary.createAssetAsync(fileUri);
        const album = await MediaLibrary.getAlbumAsync('Download');
        if (album == null) {
          await MediaLibrary.createAlbumAsync('Download', asset, false);
        } else {
          await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        }
        console.log('✅ File saved to Downloads folder');
        Alert.alert('Download Complete', 'Sample Excel file has been saved to your Downloads folder.');
      } else {
        Alert.alert('Download Complete', 'Sample Excel file has been saved locally.');
      }
    } catch (err) {
      console.error("❌ Error creating sample Excel:", err);
      Alert.alert("Error", "Failed to create or save sample Excel.");
    }
  };

  // Share sample Excel
  const shareSampleFile = async () => {
    if (!sampleFileUri) {
      Alert.alert('No file to share', 'Please download the sample file first.');
      return;
    }
    try {
      await shareAsync(sampleFileUri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    } catch (err) {
      console.error('❌ Error sharing file:', err);
      Alert.alert('Error', 'Failed to share the sample Excel file.');
    }
  };

  return (
    <View style={styles.container}>
      <Title style={styles.title}>Upload Leads via Excel</Title>
      <Paragraph style={styles.instructions}>
        Select an Excel file (.xlsx or .xls) with your leads to upload. Duplicates within upload and existing leads will be ignored.
      </Paragraph>

      <Card style={styles.card}>
        <Card.Content>
          <Button
            mode="contained"
            icon="file-upload"
            onPress={pickExcel}
            contentStyle={{ paddingVertical: 8 }}
            style={{ marginBottom: 16 }}
          >
            Select Excel File to Upload
          </Button>

          <Button
            mode="outlined"
            icon="file-download"
            onPress={downloadSample}
            contentStyle={{ paddingVertical: 8 }}
            style={{ marginBottom: 10 }}
          >
            Download Sample Excel File
          </Button>

          <Button
            mode="outlined"
            icon="share"
            onPress={shareSampleFile}
            contentStyle={{ paddingVertical: 8 }}
          >
            Share Sample Excel File
          </Button>
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    fontSize: 22,
  },
  instructions: {
    textAlign: 'center',
    color: '#555',
    marginBottom: 24,
    fontSize: 16,
  },
  card: {
    padding: 16,
    borderRadius: 8,
  },
});
