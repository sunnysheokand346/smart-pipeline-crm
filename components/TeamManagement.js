import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Text, Card, Button, Title, Divider, Modal, Portal, TextInput, Chip } from 'react-native-paper';
import { useUser } from '../context/UserContext';
import { supabase } from '../supabaseClient';

// Replace with your deployed serverless URL that performs the privileged removal/transfer.
const SERVERLESS_REMOVE_URL = 'https://your-server.example.com/api/remove-telecaller';
const SERVERLESS_TRANSFER_URL = 'https://your-server.example.com/api/transfer-leads';

export default function TeamManagementScreen() {
  const { profile, loading, user } = useUser();
  try {
    console.log('TeamManagement: render start', { profile: !!profile, loading });
  } catch (e) {
    console.log('TeamManagement: render log error', e);
  }

  const [team, setTeam] = useState([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [leadCounts, setLeadCounts] = useState({});

  const [selectedTelecaller, setSelectedTelecaller] = useState(null);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [isPasswordModalVisible, setPasswordModalVisible] = useState(false);
  const [isRemoveModalVisible, setRemoveModalVisible] = useState(false);
  const [managerPassword, setManagerPassword] = useState('');
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const isManager = (profile?.role || '').trim().toLowerCase() === 'manager';

  const fetchLeadCountsForTeam = async (teamMembers) => {
    console.log('TeamManagement: fetchLeadCountsForTeam called', { teamMembersPresent: !!teamMembers });
    if (!teamMembers || teamMembers.length === 0) return;
    try {
      const telecallerIds = teamMembers.map((t) => t.id);
      const { data, error } = await supabase.rpc('get_lead_counts_for_telecallers', { telecaller_ids: telecallerIds });
      if (!error && data) {
        const counts = data.reduce((acc, item) => {
          acc[item.telecaller_id] = item.lead_count;
          return acc;
        }, {});
        setLeadCounts(counts);
      }
    } catch (e) {
      console.error('Error fetching lead counts:', e?.message || e);
    }
  };

  const fetchTeamMembers = useCallback(async () => {
    if (!profile?.id || !isManager) return;
    console.log('TeamManagement: fetchTeamMembers starting', { managerId: profile?.id });
    setLoadingTeam(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name, username, is_paused')
        .eq('manager_id', profile.id)
        .eq('role', 'telecaller');
      if (error) {
        Alert.alert('Error', 'Could not fetch team members.');
        setTeam([]);
      } else {
        setTeam(data || []);
        fetchLeadCountsForTeam(data || []);
        console.log('TeamManagement: fetched team members', { count: (data || []).length });
      }
    } catch (err) {
      console.error('fetchTeamMembers exception', err?.message || err);
      setTeam([]);
    } finally {
      setLoadingTeam(false);
    }
  }, [profile, isManager]);

  useEffect(() => {
    if (isManager && !loading) fetchTeamMembers();
  }, [isManager, loading, fetchTeamMembers]);

  const openEditModal = (telecaller) => {
    setSelectedTelecaller(telecaller);
    setName(telecaller.name || '');
    setUsername(telecaller.username || '');
    setEditModalVisible(true);
  };

  const openPasswordModal = (telecaller) => {
    setSelectedTelecaller(telecaller);
    setNewPassword('');
    setPasswordModalVisible(true);
  };

  const openRemoveModal = (telecaller) => {
    if ((leadCounts[telecaller.id] || 0) > 0) {
      Alert.alert('Cannot Remove', 'This user has active leads. Please transfer their leads before removing them.');
      return;
    }
    setSelectedTelecaller(telecaller);
    setRemoveModalVisible(true);
  };

  const handleUpdateProfile = async () => {
    if (!selectedTelecaller) return;
    const { error } = await supabase.from('profiles').update({ name, username }).eq('id', selectedTelecaller.id);
    if (error) Alert.alert('Error', 'Failed to update profile.');
    else {
      Alert.alert('Success', 'Profile updated.');
      setEditModalVisible(false);
      fetchTeamMembers();
    }
  };

  const handleChangePassword = async () => {
    if (!selectedTelecaller || !newPassword) return;
    const { error } = await supabase.auth.admin.updateUserById(selectedTelecaller.id, { password: newPassword });
    if (error)
      Alert.alert('Error', 'Failed to change password. Ensure you have admin privileges.');
    else {
      Alert.alert('Success', 'Password has been changed.');
      setPasswordModalVisible(false);
    }
  };

  const handleToggleStatus = async (telecaller) => {
    const newPausedStatus = !telecaller.is_paused;
    console.log('TeamManagement: handleToggleStatus start', { telecallerId: telecaller.id, current: telecaller.is_paused, newPausedStatus });

    // 1) Try admin disable (best-effort)
    try {
      const adminRes = await supabase.auth.admin.updateUserById(telecaller.id, { disabled: newPausedStatus });
      console.log('TeamManagement: admin.updateUserById result', adminRes);
      if (adminRes?.error) console.warn('TeamManagement: admin.updateUserById error', adminRes.error.message || adminRes.error);
    } catch (e) {
      console.warn('TeamManagement: admin.updateUserById threw', e?.message || e);
    }

    // 2) Update profiles.is_paused and return the updated row to inspect errors
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ is_paused: newPausedStatus })
        .eq('id', telecaller.id)
        .select()
        .limit(1);

      if (error) {
        console.error('TeamManagement: profiles update error', error);
        Alert.alert('Error', `Failed to ${newPausedStatus ? 'disable' : 'enable'} user: ${error.message || JSON.stringify(error)}`);
        return;
      }

      console.log('TeamManagement: profiles update success', { updated: data });
      // If update returned no rows, that might indicate RLS preventing the update
      if (!data || data.length === 0) {
        console.warn('TeamManagement: profiles update returned no rows — possible RLS or missing id mismatch');
        Alert.alert('Warning', 'Update succeeded but no profile row returned. Check RLS policies or id mapping.');
        fetchTeamMembers();
        return;
      }

      // Success
      if (newPausedStatus) {
        Alert.alert('Success', 'User has been disabled and profile updated.');
      } else {
        Alert.alert('Success', 'User has been enabled and profile updated.');
      }
      fetchTeamMembers();
    } catch (err) {
      console.error('TeamManagement: unexpected error updating profiles', err);
      Alert.alert('Error', `Unexpected error: ${err?.message || JSON.stringify(err)}`);
    }
  };

  const handleRemoveTelecaller = async () => {
    if (!selectedTelecaller) return;
    if ((leadCounts[selectedTelecaller.id] || 0) > 0) {
      Alert.alert('Error', 'Cannot delete user with assigned leads.');
      setRemoveModalVisible(false);
      return;
    }
    const { error } = await supabase.auth.admin.deleteUser(selectedTelecaller.id);
    if (error) Alert.alert('Error', 'Failed to remove user from the system.');
    else {
      Alert.alert('Success', 'User has been permanently removed.');
      setRemoveModalVisible(false);
      fetchTeamMembers();
    }
  };

  const confirmRemove = async () => {
    if (!user?.email) {
      Alert.alert('Error', 'Manager email not available for confirmation.');
      return;
    }
    if (!managerPassword) {
      Alert.alert('Error', 'Please enter your password to confirm.');
      return;
    }

    setConfirmingRemove(true);
    try {
      // Call serverless transfer endpoint which should:
      // - verify the manager's password securely server-side
      // - verify the manager is allowed to act on this telecaller
      // - transfer all leads assigned to telecallerId into the lead pool (telecaller_id = NULL)
      const res = await fetch(SERVERLESS_TRANSFER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId: user?.id, managerEmail: user?.email, managerPassword, telecallerId: selectedTelecaller?.id }),
      });

      const payload = await res.json();
      if (!res.ok) {
        console.warn('TeamManagement: confirmTransfer server error', payload);
        Alert.alert('Transfer failed', payload?.message || 'Server refused to transfer leads.');
        setConfirmingRemove(false);
        return;
      }

      // success
      Alert.alert('Success', 'Leads transferred to lead pool.');
      setManagerPassword('');
      setConfirmingRemove(false);
      setRemoveModalVisible(false);
      fetchTeamMembers();
    } catch (e) {
      console.error('TeamManagement: confirmTransfer unexpected error', e);
      Alert.alert('Error', 'Unexpected error during transfer.');
      setConfirmingRemove(false);
    }
  };

  const renderTeamMember = ({ item }) => (
    <Card style={styles.card} key={item.id}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.nameText}>{item.name}</Text>
          <Text style={styles.usernameText}>@{item.username}</Text>
        </View>
        <Chip
          icon={item.is_paused ? 'cancel' : 'check-circle'}
          style={item.is_paused ? styles.disabledChip : styles.enabledChip}
          textStyle={{ color: 'white' }}
        >
          {item.is_paused ? 'Disabled' : 'Enabled'}
        </Chip>
      </View>

      <Divider style={{ marginVertical: 12 }} />

      <View style={styles.statsRow}>
        <Text style={styles.statsText}>Total Leads: {leadCounts[item.id] || 0}</Text>
      </View>

      {/* === Modern Action Button Grid === */}
      <View style={styles.actionGrid}>
        <View style={styles.actionRow}>
          <Button
            mode="contained-tonal"
            icon="pencil"
            onPress={() => openEditModal(item)}
            style={[styles.actionBtnBox, styles.primaryBtn]}
            labelStyle={styles.actionLabel}
          >
            Edit Profile
          </Button>

          <Button
            mode="contained-tonal"
            icon="lock-reset"
            onPress={() => openPasswordModal(item)}
            style={[styles.actionBtnBox, styles.primaryBtn]}
            labelStyle={styles.actionLabel}
          >
            Change Password
          </Button>
        </View>

        <View style={styles.actionRow}>
          <Button
            mode="contained-tonal"
            icon={item.is_paused ? 'play-circle' : 'pause-circle'}
            onPress={() => handleToggleStatus(item)}
            style={[styles.actionBtnBox, styles.secondaryBtn]}
            labelStyle={styles.actionLabel}
          >
            {item.is_paused ? 'Enable' : 'Disable'}
          </Button>

          <Button
            mode="contained-tonal"
            icon="swap-horizontal"
            onPress={() => openRemoveModal(item)}
            disabled={(leadCounts[item.id] || 0) === 0}
            style={[(leadCounts[item.id] || 0) === 0 ? styles.disabledRemoveBtn : styles.transferBtn, styles.actionBtnBox]}
            labelStyle={[styles.actionLabel, (leadCounts[item.id] || 0) === 0 ? styles.disabledRemoveLabel : { color: '#fff' }]}
          >
            Transfer Leads
          </Button>
        </View>
      </View>
    </Card>
  );

  if (!isManager)
    return (
      <View style={styles.container}>
        <Text>Permission denied.</Text>
      </View>
    );

  if (loading || loadingTeam)
    return (
      <View style={styles.container}>
        <ActivityIndicator animating={true} size="large" />
      </View>
    );

  return (
    <>
      <FlatList
        contentContainerStyle={styles.container}
        data={team}
        keyExtractor={(item) => item.id}
        renderItem={renderTeamMember}
        onRefresh={fetchTeamMembers}
        refreshing={loadingTeam}
        ListHeaderComponent={<Text style={styles.heading}>👥 Manage Team</Text>}
        ListEmptyComponent={
          <View style={styles.emptyComponent}>
            <Text>No team members found.</Text>
          </View>
        }
      />

      <Portal>
        {/* Edit Modal */}
        <Modal visible={isEditModalVisible} onDismiss={() => setEditModalVisible(false)} contentContainerStyle={styles.modal}>
          <Title>Edit {selectedTelecaller?.name}</Title>
          <TextInput label="Full Name" value={name} onChangeText={setName} style={styles.input} />
          <TextInput label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" style={styles.input} />
          <Button mode="contained" onPress={handleUpdateProfile} style={{ marginTop: 10 }}>Save Changes</Button>
          <Button mode="text" onPress={() => setEditModalVisible(false)}>Cancel</Button>
        </Modal>

        {/* Password Modal */}
        <Modal visible={isPasswordModalVisible} onDismiss={() => setPasswordModalVisible(false)} contentContainerStyle={styles.modal}>
          <Title>Change Password for {selectedTelecaller?.name}</Title>
          <TextInput label="New Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry style={styles.input} />
          <Button mode="contained" onPress={handleChangePassword} style={{ marginTop: 10 }}>Set New Password</Button>
          <Button mode="text" onPress={() => setPasswordModalVisible(false)}>Cancel</Button>
        </Modal>

        {/* Remove Modal with manager password confirmation */}
        <Modal visible={isRemoveModalVisible} onDismiss={() => setRemoveModalVisible(false)} contentContainerStyle={styles.modal}>
          <Title>Remove {selectedTelecaller?.name}?</Title>
          <Text>This action is irreversible. The user's account and profile data will be permanently deleted.</Text>
          <Text style={{ fontWeight: 'bold', marginVertical: 10 }}>All leads must be transferred before removal.</Text>

          <Text style={{ marginTop: 8, marginBottom: 6 }}>Enter your password to confirm:</Text>
          <TextInput label="Your password" value={managerPassword} onChangeText={setManagerPassword} secureTextEntry style={styles.input} />

          <Button mode="contained" onPress={confirmRemove} buttonColor="red" style={{ marginTop: 10 }} loading={confirmingRemove} disabled={confirmingRemove || !managerPassword}>
            Yes, Remove Permanently
          </Button>
          <Button mode="text" onPress={() => { setRemoveModalVisible(false); setManagerPassword(''); }}>{'Cancel'}</Button>
        </Modal>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#f5f5f5', flexGrow: 1 },
  heading: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
  card: {
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    marginHorizontal: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 8 },
  nameText: { fontSize: 18, fontWeight: '600' },
  usernameText: { color: '#666' },
  statsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 8 },
  statsText: { fontSize: 16, fontWeight: '500' },

  // ==== New Button Grid ====
  actionGrid: {
    marginTop: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  actionBtnBox: {
    flex: 1,
    marginHorizontal: 5,
    borderRadius: 10,
    height: 45,
    justifyContent: 'center',
    elevation: 1,
  },
  actionLabel: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  primaryBtn: { backgroundColor: '#007bff20', borderWidth: 0 },
  secondaryBtn: { backgroundColor: '#ffc10720' },
  transferBtn: { backgroundColor: '#17a2b8' },
  dangerBtn: { backgroundColor: '#dc3545' },
  disabledRemoveBtn: { backgroundColor: '#eee', opacity: 0.7 },
  disabledRemoveLabel: { color: '#999' },

  enabledChip: { backgroundColor: '#28a745', marginRight: 10 },
  disabledChip: { backgroundColor: '#dc3545', marginRight: 10 },
  modal: { backgroundColor: 'white', padding: 20, margin: 20, borderRadius: 8 },
  input: { marginBottom: 10 },
  emptyComponent: { flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 50 },
});
