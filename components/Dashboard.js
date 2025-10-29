import { supabase } from '../supabaseClient';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useUser } from '../context/UserContext';
import * as Clipboard from 'expo-clipboard';

export default function Dashboard() {
  const { profile, loading } = useUser();
  // Debug logging to help track down ReferenceError for 'teamMembers'
  try {
    console.log('Dashboard: render', { profile: !!profile, loading });
  } catch (e) {
    console.log('Dashboard: render log failed', e);
  }
  const [leads, setLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [todayLeadsCount, setTodayLeadsCount] = useState(0);
  const [duplicateLeadsCount, setDuplicateLeadsCount] = useState(0);
  

  const normalizedRole = (profile?.role || '').trim().toLowerCase();

  // ✅ Fetch leads
  const fetchLeads = async () => {
    if (!profile || !profile.id) return;

    // For managers → fetch leads where manager_id = their own id
    // For telecallers → fetch leads where manager_id = their manager’s id
    const managerUuid =
      normalizedRole === 'manager' ? profile.id : profile.manager_id;

    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('manager_id', managerUuid);

    if (error) {
      console.error('❌ Error fetching leads:', error.message);
      return;
    }

    setLeads(data || []);

    const today = new Date().toISOString().split('T')[0];
    setTodayLeadsCount(
      (data || []).filter((l) => l.created_at?.startsWith(today)).length
    );

    const phoneSet = new Set();
    let duplicates = 0;
    (data || []).forEach((l) => {
      const phone = l.phone?.trim();
      if (phone && phoneSet.has(phone)) duplicates++;
      else phoneSet.add(phone);
    });
    setDuplicateLeadsCount(duplicates);
    setLoadingLeads(false);
  };

  // ✅ Initial fetch
  useEffect(() => {
    if (!loading && profile) {
      fetchLeads();
    }
  }, [loading, profile]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLeads();
    setRefreshing(false);
  };

  const normalizeStatus = (status) =>
    (status || '').replace(/"/g, '').toLowerCase().trim();
  const countByStatus = (status) =>
    leads.filter((l) => normalizeStatus(l.status) === normalizeStatus(status))
      .length;

  const copyManagerId = () => {
    Clipboard.setString(profile?.id?.toString() || '');
    Alert.alert(
      'Manager ID Copied',
      'The Manager UUID has been copied to your clipboard.'
    );
  };

  if (loading || loadingLeads)
    return <Text style={{ padding: 20 }}>Loading...</Text>;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.heading}>📊 Dashboard</Text>

      {normalizedRole === 'manager' && profile?.id && (
        <TouchableOpacity
          activeOpacity={0.7}
          onLongPress={copyManagerId}
          delayLongPress={3000}
        >
          <View style={styles.card}>
            <Text style={styles.metricLabel}>🆔 Your Manager UUID</Text>
            <Text style={styles.metricValue}>{profile.id}</Text>
            <Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              Long press for 3 seconds to copy
            </Text>
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.card}>
        <Text style={styles.metricLabel}>📌 Total Leads</Text>
        <Text style={styles.metricValue}>{leads.length}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.metricLabel}>📅 Today's New Leads</Text>
        <Text style={styles.metricValue}>{todayLeadsCount}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.metricLabel}>♻️ Duplicate Leads</Text>
        <Text style={styles.metricValue}>{duplicateLeadsCount}</Text>
      </View>

      {normalizedRole === 'manager' && (
        <>
          <Text style={styles.subheading}>🧩 Leads by Status</Text>
          <View style={styles.cardGroup}>
            <Text>🆕 New: {countByStatus('new')}</Text>
            <Text>🚫 Not Connected: {countByStatus('not_connected')}</Text>
            <Text>📞 Contacted: {countByStatus('contacted')}</Text>
            <Text>📨 Purposed: {countByStatus('purposed')}</Text>
            <Text>🤝 Interested: {countByStatus('interested')}</Text>
            <Text>🗣 Discuss: {countByStatus('discuss')}</Text>
            <Text>📍 Visit Soon: {countByStatus('visit_soon')}</Text>
            <Text>🏠 Visited: {countByStatus('visited')}</Text>
            <Text>✅ Closed: {countByStatus('closed')}</Text>
            <Text>❌ Not Interested: {countByStatus('not_interested')}</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#fff', flex: 1 },
  heading: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  subheading: { fontSize: 18, fontWeight: 'bold', marginTop: 20, marginBottom: 10 },
  card: { backgroundColor: '#f1f1f1', padding: 16, borderRadius: 10, marginBottom: 12 },
  cardGroup: { backgroundColor: '#f9f9f9', padding: 16, borderRadius: 10, gap: 6 },
  metricLabel: { fontSize: 16, color: '#555' },
  metricValue: { fontSize: 25, fontWeight: 'bold', color: '#333' },
});
