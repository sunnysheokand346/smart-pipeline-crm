import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert } from 'react-native';
import { Text, Card, Button, ActivityIndicator, Title, Divider, Menu, Chip } from 'react-native-paper';
import { useUser } from '../context/UserContext';
import { supabase } from '../supabaseClient';

export default function DuplicateLeadsScreen() {
  const { profile } = useUser();
  const [duplicates, setDuplicates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [telecallers, setTelecallers] = useState([]);
  const [menuVisible, setMenuVisible] = useState({});

  const isManager = (profile?.role || '').trim().toLowerCase() === 'manager';

  const fetchDuplicateLeads = useCallback(async () => {
    if (!profile?.manager_id) return;
    setLoading(true);
    
    // ✅ UPDATED: This query now joins with the 'profiles' table to get the owner's name.
    const { data, error } = await supabase
      .from('duplicates')
      .select(`
        *,
        original_owner:profiles!duplicates_original_owner_id_fkey ( name )
      `)
      .eq('manager_id', profile.manager_id);

    if (error) {
      Alert.alert('Error', 'Could not fetch duplicate leads. Make sure you have set up the foreign key relationship between duplicates(original_owner_id) and profiles(id).');
      console.error(error.message);
    } else {
      const grouped = (data || []).reduce((acc, lead) => {
        const key = lead.phone;
        if (!acc[key]) acc[key] = [];
        acc[key].push(lead);
        return acc;
      }, {});
      setDuplicates(Object.values(grouped));
    }
    setLoading(false);
  }, [profile]);

  const fetchTelecallers = useCallback(async () => {
    if (!profile?.manager_id) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('role', 'telecaller')
      .eq('manager_id', profile.manager_id);
    if (!error) setTelecallers(data || []);
  }, [profile]);

  useEffect(() => {
    if (isManager) {
      fetchDuplicateLeads();
      fetchTelecallers();
    }
  }, [isManager, fetchDuplicateLeads, fetchTelecallers]);

  const openMenu = (id) => setMenuVisible(prev => ({ ...prev, [id]: true }));
  const closeMenu = (id) => setMenuVisible(prev => ({ ...prev, [id]: false }));

  const handleIgnore = async (leadId) => {
    const { error } = await supabase.from('duplicates').delete().eq('id', leadId);
    if (error) Alert.alert('Error', 'Failed to ignore duplicate.');
    else {
      Alert.alert('Success', 'Duplicate lead ignored.');
      fetchDuplicateLeads();
    }
  };

  const handleAssign = async (lead, telecallerId) => {
    // Remove all extra fields before inserting into the main leads table
    const { id, reason, original_lead_id, original_owner_id, original_status, original_owner, ...newLead } = lead;
    const { error } = await supabase.from('leads').insert({ ...newLead, assigned_to: telecallerId });
    if (error) Alert.alert('Error', 'Failed to assign lead.');
    else await handleIgnore(lead.id);
  };

  const handleMerge = (leadId) => {
    Alert.alert("Merge Action", "For now, merging will ignore the duplicate. A full merge feature can be added later.");
    handleIgnore(leadId);
  }

  const renderDuplicateGroup = ({ item: leadGroup }) => (
    <Card style={styles.card}>
      <Card.Content>
        <Title>Duplicates for: {leadGroup[0]?.phone}</Title>
        {leadGroup.map((lead) => (
          <View key={lead.id}>
            <Divider style={styles.divider} />
            <Text style={styles.leadName}>{lead.name} (from {lead.source})</Text>
            
            {/* ✅ ADDED: Display original owner and status */}
            {lead.original_owner && (
              <View style={styles.infoRow}>
                <Chip icon="account-circle" style={styles.chip}>
                  Owner: {lead.original_owner.name}
                </Chip>
                <Chip icon="flag" style={styles.chip}>
                  Status: {lead.original_status}
                </Chip>
              </View>
            )}

            <Card.Actions style={styles.actions}>
              <Button onPress={() => handleIgnore(lead.id)}>Ignore</Button>
              <Button onPress={() => handleMerge(lead.id)}>Merge</Button>
              <Menu
                visible={!!menuVisible[lead.id]}
                onDismiss={() => closeMenu(lead.id)}
                anchor={<Button onPress={() => openMenu(lead.id)}>Assign</Button>}
              >
                {telecallers.map(tc => (
                  <Menu.Item
                    key={tc.id}
                    title={tc.name}
                    onPress={() => { handleAssign(lead, tc.id); closeMenu(lead.id); }}
                  />
                ))}
              </Menu>
            </Card.Actions>
          </View>
        ))}
      </Card.Content>
    </Card>
  );

  if (!isManager) return <View style={styles.container}><Text>Permission denied.</Text></View>;
  if (loading) return <View style={styles.container}><ActivityIndicator size="large" /></View>;

  return (
    <FlatList
      contentContainerStyle={styles.container}
      data={duplicates}
      keyExtractor={(item) => item[0]?.phone}
      renderItem={renderDuplicateGroup}
      onRefresh={fetchDuplicateLeads}
      refreshing={loading}
      ListHeaderComponent={<Text style={styles.heading}>♻️ Duplicate Leads</Text>}
      ListEmptyComponent={<View style={styles.container}><Text>No duplicate leads found ✅</Text></View>}
    />
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', flexGrow: 1 },
  heading: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  card: { marginBottom: 16, backgroundColor: '#f9f9f9' },
  divider: { marginVertical: 12 },
  leadName: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  chip: { marginRight: 8, marginBottom: 8 },
  actions: { justifyContent: 'space-between', paddingHorizontal: 0, marginTop: 8 },
});
