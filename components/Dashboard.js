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
import { useNavigation } from '@react-navigation/native';
import { useUser } from '../context/UserContext';
import * as Clipboard from 'expo-clipboard';

export default function Dashboard() {
  const navigation = useNavigation();
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
  const [pendingLeadsCount, setPendingLeadsCount] = useState(0);
  const [pendingFollowUpCount, setPendingFollowUpCount] = useState(0);
  

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

    setPendingLeadsCount(
      (data || []).filter((l) => normalizeStatus(l.status) === 'new').length
    );

    setPendingFollowUpCount(
      (data || []).filter((l) => {
        const status = normalizeStatus(l.status);
        const hasValidStatus = status !== 'new' && status !== 'closed won' && status !== 'closed lost';
        const hasPastFollowUp = l.follow_up_date && new Date(l.follow_up_date) < new Date();
        return hasValidStatus && hasPastFollowUp;
      }).length
    );

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

      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.push('All Leads', { filter: 'all' })}
      >
        <Text style={styles.metricLabel}>📌 Total Leads</Text>
        <Text style={styles.metricValue}>{leads.length}</Text>
        <Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          Tap to view all leads
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.push('All Leads', { filter: 'today' })}
      >
        <Text style={styles.metricLabel}>📅 Today's New Leads</Text>
        <Text style={styles.metricValue}>{todayLeadsCount}</Text>
        <Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          Tap to view today's leads
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.push('All Leads', { filter: 'pending' })}
      >
        <Text style={styles.metricLabel}>⏳ Pending Leads</Text>
        <Text style={styles.metricValue}>{pendingLeadsCount}</Text>
        <Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          Tap to view pending leads
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.push('All Leads', { filter: 'pending_follow_up' })}
      >
        <Text style={styles.metricLabel}>📅 Pending Follow Up</Text>
        <Text style={styles.metricValue}>{pendingFollowUpCount}</Text>
        <Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
          Tap to view leads needing follow-up
        </Text>
      </TouchableOpacity>

      {normalizedRole === 'manager' && (
        <>
          <Text style={styles.subheading}>🧩 Leads by Status</Text>
          <View style={styles.statusList}>
            <Text style={styles.statusItem}>🆕 New: {countByStatus('new')}</Text>
            <Text style={styles.statusItem}>🚫 Not Connected: {countByStatus('not_connected')}</Text>
            <Text style={styles.statusItem}>📞 Contacted: {countByStatus('contacted')}</Text>
            <Text style={styles.statusItem}>📨 Purposed: {countByStatus('purposed')}</Text>
            <Text style={styles.statusItem}>🗣 Discuss: {countByStatus('discuss')}</Text>
            <Text style={styles.statusItem}>🤝 Interested: {countByStatus('interested')}</Text>
            <Text style={styles.statusItem}>📍 Visit Soon: {countByStatus('visit_soon')}</Text>
            <Text style={styles.statusItem}>🏠 Visited: {countByStatus('visited')}</Text>
            <Text style={styles.statusItem}>💼 Negotiation: {countByStatus('negotiation')}</Text>
            <Text style={styles.statusItem}>✅ Closed Won: {countByStatus('closed won')}</Text>
            <Text style={styles.statusItem}>❌ Closed Lost: {countByStatus('closed lost')}</Text>
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
  statusList: { backgroundColor: '#f1f1f1', padding: 16, borderRadius: 10, marginBottom: 12 },
  statusItem: { fontSize: 14, color: '#333', marginBottom: 8 },
});
