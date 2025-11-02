import React, { useEffect, useState, useMemo } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Linking, Alert } from "react-native";
import { Card, Button, Modal, Portal, TextInput, Menu, Appbar } from "react-native-paper";
import DateTimePicker from '@react-native-community/datetimepicker';
import { supabase } from "../supabaseClient";
import { useUser } from "../context/UserContext";
import NotificationService from '../utils/NotificationService';

const LeadList = ({ route, navigation }) => {
  const { profile } = useUser();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const filter = route?.params?.filter; // 'today' or undefined
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [isFilterMenuVisible, setFilterMenuVisible] = useState(false);
  const [isNotesModalVisible, setNotesModalVisible] = useState(false);
  const [selectedLeadForNotes, setSelectedLeadForNotes] = useState(null);
  const [newNotes, setNewNotes] = useState('');
  const [isStatusMenuVisible, setStatusMenuVisible] = useState(false);
  const [selectedLeadForStatus, setSelectedLeadForStatus] = useState(null);
  const [isFollowUpModalVisible, setFollowUpModalVisible] = useState(false);
  const [selectedLeadForFollowUp, setSelectedLeadForFollowUp] = useState(null);
  const [followUpDate, setFollowUpDate] = useState(new Date());
  const [followUpTime, setFollowUpTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const role = (profile?.role || "").trim().toLowerCase();
  const isManager = role === "manager";
  // ✅ Correct ID to use is the UUID from Supabase Auth
  const currentUserId = profile?.id; 

  const fetchLeads = async (isRefresh = false) => {
    if (!currentUserId) return;
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      let leadData = [];
      let assignedIds = []; // IDs to lookup names for

      if (isManager) {
        // 1) Fetch subordinate telecallers (profiles where manager_id == currentUserId)
        const { data: subProfiles, error: subError } = await supabase
          .from("profiles")
          .select("id, name")
          .eq("manager_id", currentUserId);

        if (subError) throw subError;

        const subordinateIds = (subProfiles || []).map(p => p.id).filter(Boolean);

        // 2) Fetch leads assigned to any subordinate, leads owned by this manager (manager_id),
        //    and leads assigned directly to the manager. We'll run the sub-queries in parallel and merge.
        const queries = [];
        if (subordinateIds.length > 0) {
          queries.push(
            supabase.from("leads").select("*").in("assigned_to", subordinateIds)
          );
        }
        // leads where manager_id equals manager's id
        queries.push(supabase.from("leads").select("*").eq("manager_id", currentUserId));
        // leads assigned directly to the manager (just in case)
        queries.push(supabase.from("leads").select("*").eq("assigned_to", currentUserId));

        const results = await Promise.all(queries);

        // results are arrays of { data, error }
        results.forEach(res => {
          if (res.error) throw res.error;
          if (res.data) leadData = leadData.concat(res.data);
        });

        // dedupe leads by id
        const seen = new Set();
        leadData = leadData.filter(l => {
          if (!l || !l.id) return false;
          if (seen.has(l.id)) return false;
          seen.add(l.id);
          return true;
        });

        // collect assigned_to ids from the fetched leads (for name resolution)
        assignedIds = [...new Set(leadData.map(l => l.assigned_to).filter(Boolean))];
      } else {
        // Telecaller: fetch leads assigned to them only
        const { data: leadRes, error: leadError } = await supabase
          .from("leads")
          .select("*")
          .eq("assigned_to", currentUserId);

        if (leadError) throw leadError;
        leadData = leadRes || [];

        assignedIds = [...new Set(leadData.map(l => l.assigned_to).filter(Boolean))];
        // ensure telecaller's own id is included so we can show their name
        if (!assignedIds.includes(currentUserId)) assignedIds.push(currentUserId);
      }

      // NAME RESOLUTION: fetch profile names for all assigned IDs (works for both roles)
      let telecallerMap = {};
      if (assignedIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", assignedIds);

        if (profilesError) throw profilesError;

        telecallerMap = (profilesData || []).reduce((acc, p) => {
          if (p && p.id) acc[p.id] = p.name || "Unknown";
          return acc;
        }, {});
      }

      // Attach the name to each lead object and provide sensible defaults
      let finalLeads = leadData.map(lead => ({
        ...lead,
        assigned_to_name: telecallerMap[lead.assigned_to] || (lead.assigned_to ? 'Unknown' : 'Unassigned'),
      }));

      // Apply filter if specified (from navigation params)
      if (filter === 'today') {
        setSelectedFilter('Today');
      } else if (filter === 'all') {
        setSelectedFilter('All');
      } else if (filter === 'pending') {
        setSelectedFilter('Pending Leads');
      } else if (filter === 'pending_follow_up') {
        setSelectedFilter('Pending Follow Up');
      }

      // Schedule notifications for future follow-ups
      finalLeads.forEach(lead => {
        if (lead.follow_up_date) {
          const followUpTime = new Date(lead.follow_up_date);
          if (followUpTime > new Date()) {
            NotificationService.scheduleFollowUpNotification(lead.name, followUpTime);
          }
        }
      });

      // Cancel all existing notifications first to avoid duplicates
      const existingNotifications = await NotificationService.getScheduledNotifications();
      existingNotifications.forEach(notification => {
        NotificationService.cancelNotification(notification.identifier);
      });

      setLeads(finalLeads);
    } catch (err) {
      console.error("❌ Error fetching leads:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Filtered leads based on selected filter and search query
  const filteredLeads = useMemo(() => {
    let filtered = leads;

    // Apply filter
    if (selectedFilter === 'All') {
      // No additional filter
    } else if (selectedFilter === 'Today') {
      const today = new Date().toISOString().split('T')[0];
      filtered = filtered.filter(lead => lead.created_at?.startsWith(today));
    } else if (selectedFilter === 'This Week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      filtered = filtered.filter(lead => new Date(lead.created_at) >= weekAgo);
    } else if (selectedFilter === 'This Month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      filtered = filtered.filter(lead => new Date(lead.created_at) >= monthAgo);
    } else if (selectedFilter === 'Pending Leads') {
      filtered = filtered.filter(lead => lead.status?.toLowerCase() === 'new');
    } else if (selectedFilter === 'Pending Follow Up') {
      filtered = filtered.filter(lead => {
        const status = lead.status?.toLowerCase();
        const hasValidStatus = status !== 'new' && status !== 'closed won' && status !== 'closed lost';
        const hasPastFollowUp = lead.follow_up_date && new Date(lead.follow_up_date) < new Date();
        return hasValidStatus && hasPastFollowUp;
      });
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(lead =>
        (lead.name && lead.name.toLowerCase().includes(query)) ||
        (lead.phone && lead.phone.toLowerCase().includes(query)) ||
        (lead.email && lead.email.toLowerCase().includes(query))
      );
    }

    // Sort leads alphabetically by name (case-insensitive)
    filtered = filtered.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return filtered;
  }, [leads, selectedFilter, searchQuery]);

  const filterOptions = ['All', 'Today', 'This Week', 'This Month', 'Pending Leads', 'Pending Follow Up'];

  const onRefresh = () => {
    fetchLeads(true);
  };

  const openNotesModal = (lead) => {
    setSelectedLeadForNotes(lead);
    setNewNotes('');
    setNotesModalVisible(true);
  };

  const handleUpdateNotes = async () => {
    if (!selectedLeadForNotes) return;

    const existingNotes = selectedLeadForNotes.notes || '';
    const updatedNotes = existingNotes ? `${existingNotes}\n\n${newNotes.trim()}` : newNotes.trim();

    const { error } = await supabase
      .from('leads')
      .update({ notes: updatedNotes })
      .eq('id', selectedLeadForNotes.id);

    if (error) {
      Alert.alert('Error', 'Failed to update notes.');
    } else {
      Alert.alert('Success', 'Notes updated successfully.');
      setNotesModalVisible(false);
      setSelectedLeadForNotes(null);
      setNewNotes('');
      fetchLeads(); // Refresh the list to show updated notes
    }
  };

  const openStatusMenu = (lead) => {
    setSelectedLeadForStatus(lead);
    setStatusMenuVisible(true);
  };

  const handleStatusUpdate = async (newStatus) => {
    if (!selectedLeadForStatus) return;

    const { error } = await supabase
      .from('leads')
      .update({ status: newStatus })
      .eq('id', selectedLeadForStatus.id);

    if (error) {
      Alert.alert('Error', 'Failed to update status.');
    } else {
      Alert.alert('Success', `Status updated to ${newStatus}.`);
      setStatusMenuVisible(false);
      setSelectedLeadForStatus(null);
      fetchLeads(); // Refresh the list to show updated status
    }
  };

  const statusOptions = ['New', 'Not Connected', 'Contacted', 'Purposed', 'Discuss', 'Interested', 'Visit Soon', 'Visited', 'Negotiation', 'Closed Won', 'Closed Lost'];

  const openFollowUpModal = (lead) => {
    setSelectedLeadForFollowUp(lead);
    const now = new Date();
    setFollowUpDate(now);
    setFollowUpTime(now);
    setShowDatePicker(true);
    setFollowUpModalVisible(true);
  };

  const handleScheduleFollowUp = async () => {
    if (!selectedLeadForFollowUp) return;

    // Combine date and time
    const combinedDateTime = new Date(followUpDate);
    combinedDateTime.setHours(followUpTime.getHours(), followUpTime.getMinutes(), 0, 0);

    const { error } = await supabase
      .from('leads')
      .update({ follow_up_date: combinedDateTime.toISOString() })
      .eq('id', selectedLeadForFollowUp.id);

    if (error) {
      Alert.alert('Error', 'Failed to schedule follow-up.');
    } else {
      Alert.alert('Success', 'Follow-up scheduled successfully. You will receive a reminder at the scheduled time.');
      setFollowUpModalVisible(false);
      setSelectedLeadForFollowUp(null);
      setShowDatePicker(false);
      setShowTimePicker(false);
      fetchLeads(); // Refresh the list and schedule notification
    }
  };

  const handleCall = (phoneNumber) => {
    if (!phoneNumber) {
      Alert.alert('Error', 'No phone number available for this lead.');
      return;
    }

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

  const handleWhatsApp = (phoneNumber) => {
    if (!phoneNumber) {
      Alert.alert('Error', 'No phone number available for this lead.');
      return;
    }

    // Format phone number: remove spaces, +, and ensure international format
    const formattedNumber = phoneNumber.replace(/[\s+\-()]/g, '');
    const whatsappUrl = `whatsapp://send?phone=${formattedNumber}`;

    Linking.canOpenURL(whatsappUrl).then(supported => {
      if (supported) {
        Linking.openURL(whatsappUrl);
      } else {
        Alert.alert('Error', 'WhatsApp is not installed on this device.');
      }
    }).catch(err => {
      console.error('Error opening WhatsApp:', err);
      Alert.alert('Error', 'Failed to open WhatsApp.');
    });
  };

  const handleEmail = (email) => {
    if (!email) {
      Alert.alert('Error', 'No email address available for this lead.');
      return;
    }

    const emailUrl = `mailto:${email}`;

    Linking.canOpenURL(emailUrl).then(supported => {
      if (supported) {
        Linking.openURL(emailUrl);
      } else {
        Alert.alert('Error', 'No email app is configured on this device.');
      }
    }).catch(err => {
      console.error('Error opening email app:', err);
      Alert.alert('Error', 'Failed to open email app.');
    });
  };

  useEffect(() => {
    if (profile?.id) {
        fetchLeads();
        // Initialize notification service
        NotificationService.initialize();
    }
  }, [profile]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00346a" />
        <Text>Loading leads...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ color: "red" }}>❌ Error: {error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={filter === 'today' ? '📅 Today\'s New Leads' : '📋 All Leads'} />
        <Menu
          visible={isFilterMenuVisible}
          onDismiss={() => setFilterMenuVisible(false)}
          anchor={
            <Appbar.Action
              icon="filter-variant"
              onPress={() => setFilterMenuVisible(true)}
            />
          }
        >
          {filterOptions.map((option) => (
            <Menu.Item
              key={option}
              onPress={() => {
                setSelectedFilter(option);
                setFilterMenuVisible(false);
              }}
              title={option}
            />
          ))}
        </Menu>
      </Appbar.Header>
      <TextInput
        placeholder="🔍 Search by name, phone, or email..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchInput}
        left={<TextInput.Icon icon="magnify" />}
      />
      <FlatList
        data={filteredLeads}
        keyExtractor={(item) => item.id?.toString()}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Title title={item.name} subtitle={`📞 ${item.phone}`} />
            <Card.Content>
              <Text>📍 Source: {item.source || "N/A"}</Text>
              <View style={styles.statusContainer}>
                <Text>📌 Status: {String(item.status).replace(/"/g, "")}</Text>
                <Menu
                  visible={isStatusMenuVisible && selectedLeadForStatus?.id === item.id}
                  onDismiss={() => setStatusMenuVisible(false)}
                  anchor={
                    <Button
                      mode="text"
                      onPress={() => openStatusMenu(item)}
                      style={styles.statusButton}
                      labelStyle={styles.statusButtonText}
                    >
                      Update Status
                    </Button>
                  }
                >
                  {statusOptions.map((status) => (
                    <Menu.Item
                      key={status}
                      onPress={() => handleStatusUpdate(status)}
                      title={status}
                    />
                  ))}
                </Menu>
              </View>
              {isManager && (
                <Text>👤 Assigned To: {item.assigned_to_name || "Unassigned"}</Text>
              )}
              {item.notes && (
                <View style={styles.notesBox}>
                  <Text style={styles.notesTitle}>📝 Notes:</Text>
                  <Text style={styles.notesText}>{item.notes}</Text>
                </View>
              )}
              {item.follow_up_date && (
                <Text style={styles.followUpText}>
                  📅 Follow-up: {new Date(item.follow_up_date).toLocaleString()}
                </Text>
              )}
              <View style={styles.buttonContainer}>
                <View style={styles.buttonRow}>
                  <Button
                    mode="contained"
                    icon="phone"
                    onPress={() => handleCall(item.phone)}
                    style={[styles.callButton, styles.button]}
                    disabled={!item.phone}
                  >
                    Call
                  </Button>
                  <Button
                    mode="contained"
                    icon="whatsapp"
                    onPress={() => handleWhatsApp(item.phone)}
                    style={[styles.whatsappButton, styles.button]}
                    disabled={!item.phone}
                  >
                    WhatsApp
                  </Button>
                </View>
                <View style={styles.buttonRow}>
                  <Button
                    mode="contained"
                    icon="email"
                    onPress={() => handleEmail(item.email)}
                    style={[styles.emailButton, styles.button]}
                    disabled={!item.email}
                  >
                    Email
                  </Button>
                  <Button
                    mode="contained"
                    icon="note-plus"
                    onPress={() => openNotesModal(item)}
                    style={[styles.notesButton, styles.button]}
                  >
                    Add Notes
                  </Button>
                </View>
                <View style={styles.buttonRow}>
                  <Button
                    mode="contained"
                    icon="calendar-clock"
                    onPress={() => openFollowUpModal(item)}
                    style={[styles.followUpButton, styles.button]}
                  >
                    Follow Up
                  </Button>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: "center" }}>No leads found</Text>
        }
        refreshing={refreshing}
        onRefresh={onRefresh}
      />

      <Portal>
        <Modal visible={isNotesModalVisible} onDismiss={() => setNotesModalVisible(false)} contentContainerStyle={styles.modal}>
          <Text style={styles.modalTitle}>Add Notes for {selectedLeadForNotes?.name}</Text>
          {selectedLeadForNotes?.notes && (
            <View style={styles.existingNotesBox}>
              <Text style={styles.existingNotesTitle}>Existing Notes:</Text>
              <Text style={styles.existingNotesText}>{selectedLeadForNotes.notes}</Text>
            </View>
          )}
          <TextInput
            label="Add New Notes"
            value={newNotes}
            onChangeText={setNewNotes}
            multiline={true}
            numberOfLines={4}
            style={styles.notesInput}
            placeholder="Enter new conversation notes..."
          />
          <View style={styles.modalButtons}>
            <Button mode="text" onPress={() => { setNotesModalVisible(false); setNewNotes(''); }}>Cancel</Button>
            <Button mode="contained" onPress={handleUpdateNotes} disabled={!newNotes.trim()}>Add Notes</Button>
          </View>
        </Modal>

        <Modal visible={isFollowUpModalVisible} onDismiss={() => setFollowUpModalVisible(false)} contentContainerStyle={styles.modal}>
          <Text style={styles.modalTitle}>Schedule Follow-up for {selectedLeadForFollowUp?.name}</Text>

          <Text>Select Date:</Text>
          {!showDatePicker && !showTimePicker && (
            <Button mode="outlined" onPress={() => setShowDatePicker(true)} style={styles.pickerButton}>
              {followUpDate.toDateString()}
            </Button>
          )}
          {showDatePicker && (
            <DateTimePicker
              value={followUpDate}
              mode="date"
              display="default"
              onChange={(event, selectedDate) => {
                setShowDatePicker(false);
                if (event.type === 'set' && selectedDate) {
                  setFollowUpDate(selectedDate);
                  setShowTimePicker(true);
                }
              }}
            />
          )}

          {showTimePicker && (
            <>
              <Text>Select Time:</Text>
              <DateTimePicker
                value={followUpTime}
                mode="time"
                display="default"
                onChange={(event, selectedTime) => {
                  setShowTimePicker(false);
                  if (event.type === 'set' && selectedTime) {
                    setFollowUpTime(selectedTime);
                  }
                }}
              />
            </>
          )}

          {!showDatePicker && !showTimePicker && followUpTime && (
            <Text style={styles.timeDisplay}>Time: {followUpTime.toLocaleTimeString()}</Text>
          )}

          <View style={styles.modalButtons}>
            <Button mode="text" onPress={() => setFollowUpModalVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleScheduleFollowUp}>Schedule Follow-up</Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  appbar: { backgroundColor: '#5ca8ffff' },
  card: { marginBottom: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  buttonContainer: { marginTop: 10 },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  button: { flex: 1, marginHorizontal: 5 },
  callButton: { backgroundColor: '#007bff' },
  whatsappButton: { backgroundColor: '#25d366' },
  emailButton: { backgroundColor: '#ea4335' },
  notesButton: { backgroundColor: '#ffc107' },
  modal: { backgroundColor: 'white', padding: 20, margin: 20, borderRadius: 8 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  notesInput: { marginBottom: 16 },
  modalButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  existingNotesBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ddd'
  },
  existingNotesTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8
  },
  existingNotesText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20
  },
  notesBox: {
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    padding: 10,
    marginVertical: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#007bff'
  },
  notesTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4
  },
  notesText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 18
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4
  },
  statusButton: {
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusButtonText: {
    fontSize: 12,
    color: '#007bff'
  },
  followUpButton: { backgroundColor: '#17a2b8' },
  datePicker: { marginBottom: 16 },
  timePicker: { marginBottom: 16 },
  followUpText: {
    fontSize: 14,
    color: '#17a2b8',
    fontWeight: 'bold',
    marginVertical: 4
  },
  pickerButton: {
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007bff',
    backgroundColor: '#f8f9fa'
  },
  timeDisplay: {
    fontSize: 16,
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
    fontWeight: '500'
  },
  searchInput: {
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    elevation: 2,
  },
});

export default LeadList;
