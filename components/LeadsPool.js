import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, FlatList, StyleSheet, Pressable, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text, Card, Button, Menu, Divider, Modal, Portal, Checkbox, ActivityIndicator, Chip, Searchbar, IconButton } from 'react-native-paper';
import { useUser } from '../context/UserContext';
import { supabase } from '../supabaseClient';
import { MaterialIcons, FontAwesome5 } from '@expo/vector-icons';

export default function LeadsPool() {
  const { profile } = useUser();
  const [leads, setLeads] = useState([]);
  const [telecallers, setTelecallers] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [menuVisible, setMenuVisible] = useState({});

  const [selectedLeads, setSelectedLeads] = useState(new Set());
  
  const [assignmentRule, setAssignmentRule] = useState('Round-Robin');
  const [ruleMenuVisible, setRuleMenuVisible] = useState(false);

  const [availableTelecallers, setAvailableTelecallers] = useState(new Set());
  const [isTelecallerModalVisible, setTelecallerModalVisible] = useState(false);

  const [filters, setFilters] = useState({
    city: null,
    source: null,
    status: null,
  });
  const [filterOptions, setFilterOptions] = useState({ cities: [], sources: [], statuses: [] });

  const [isFilterModalVisible, setFilterModalVisible] = useState(false);
  const [currentFilterType, setCurrentFilterType] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchFilterOptions = useCallback(async () => {
    if (!profile?.manager_id) return;
    const { data, error } = await supabase
      .from('leads')
      .select('city, source, status')
      .eq('manager_id', profile.manager_id);
    
    if (!error && data) {
      const cities = [...new Set(data.map(item => item.city).filter(Boolean))].sort();
      const sources = [...new Set(data.map(item => item.source).filter(Boolean))].sort();
      const statuses = [...new Set(data.map(item => item.status).filter(Boolean))].sort();
      setFilterOptions({ cities, sources, statuses });
    }
  }, [profile]);


  const fetchUnassignedLeads = useCallback(async () => {
    setLoading(true);
    if (!profile?.manager_id) {
        setLoading(false);
        return;
    }

    let query = supabase
      .from('leads')
      .select('*')
      .eq('manager_id', profile.manager_id)
      .is('assigned_to', null);

    if (filters.city) query = query.eq('city', filters.city);
    if (filters.source) query = query.eq('source', filters.source);
    if (filters.status) query = query.eq('status', filters.status);

    const { data, error } = await query;

    if (!error) setLeads(data || []);
    setLoading(false);
  }, [profile, filters]);


  const fetchTelecallers = useCallback(async () => {
    if (!profile?.manager_id) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('role', 'telecaller')
      .eq('manager_id', profile.manager_id);
    if (!error && data) {
      setTelecallers(data || []);
      setAvailableTelecallers(new Set((data || []).map(tc => tc.id)));
    }
  }, [profile]);

  useEffect(() => {
    fetchUnassignedLeads();
    fetchTelecallers();
    fetchFilterOptions();

    const channel = supabase.channel('public:leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
        fetchUnassignedLeads();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, fetchUnassignedLeads, fetchTelecallers, fetchFilterOptions]);

  const handleSelectLead = (leadId) => {
    const newSelection = new Set(selectedLeads);
    if (newSelection.has(leadId)) {
      newSelection.delete(leadId);
    } else {
      newSelection.add(leadId);
    }
    setSelectedLeads(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedLeads.size === leads.length) {
      setSelectedLeads(new Set());
    } else {
      const allLeadIds = leads.map(lead => lead.id);
      setSelectedLeads(new Set(allLeadIds));
    }
  };

  const clearSelection = () => {
    setSelectedLeads(new Set());
  };

  const assignLead = async (leadId, telecallerId) => {
    await supabase.from('leads').update({ assigned_to: telecallerId }).eq('id', leadId);
  };
  
  // --- New: Direct bulk assignment based on the selected rule ---
  const handleDirectBulkAssign = async () => {
    if (filteredTelecallers.length === 0) {
      Alert.alert('No Available Telecallers', 'Please select at least one available telecaller before assigning leads.');
      return;
    }

    setLoading(true);
    const leadsToAssign = Array.from(selectedLeads);
    let updates = [];

    if (assignmentRule === 'Round-Robin') {
      let telecallerIndex = 0;
      updates = leadsToAssign.map(leadId => {
        const assignedTelecallerId = filteredTelecallers[telecallerIndex].id;
        telecallerIndex = (telecallerIndex + 1) % filteredTelecallers.length;
        return supabase.from('leads').update({ assigned_to: assignedTelecallerId }).eq('id', leadId);
      });
    } else {
      Alert.alert('Not Implemented', `Assignment rule "${assignmentRule}" is not available yet.`);
      setLoading(false);
      return;
    }

    await Promise.all(updates);
    
    setSelectedLeads(new Set());
    setLoading(false);
  };

  const handleToggleTelecaller = (telecallerId) => {
    const newAvailability = new Set(availableTelecallers);
    if (newAvailability.has(telecallerId)) {
      newAvailability.delete(telecallerId);
    } else {
      newAvailability.add(telecallerId);
    }
    setAvailableTelecallers(newAvailability);
  };

  const openFilterModal = (filterType) => {
    setCurrentFilterType(filterType);
    setFilterModalVisible(true);
  };

  const handleSelectFilter = (value) => {
    setFilters(prev => ({ ...prev, [currentFilterType]: value }));
    setFilterModalVisible(false);
    setSearchQuery('');
  };

  const clearFilters = () => {
    setFilters({ city: null, source: null, status: null });
  };

  const filteredTelecallers = useMemo(() => {
    return telecallers.filter(tc => availableTelecallers.has(tc.id));
  }, [telecallers, availableTelecallers]);

  if ((profile?.role || '').trim().toLowerCase() !== 'manager') {
    return <Text style={{ margin: 20 }}>Access denied. Managers only.</Text>;
  }

  const openMenu = (leadId) => setMenuVisible({ ...menuVisible, [leadId]: true });
  const closeMenu = (leadId) => setMenuVisible({ ...menuVisible, [leadId]: false });

  const renderLeadItem = ({ item }) => {
    const isSelected = selectedLeads.has(item.id);
    return (
      <Pressable onPress={() => selectedLeads.size > 0 && handleSelectLead(item.id)}>
        <Card style={[styles.card, isSelected && styles.cardSelected]}>
          <Card.Title 
            title={item.name} 
            titleStyle={styles.leadName}
            right={() => (
              <Checkbox.Android
                status={isSelected ? 'checked' : 'unchecked'}
                onPress={() => handleSelectLead(item.id)}
                color="#00346a"
              />
            )}
          />
          <Card.Content>
            <View style={styles.row}><MaterialIcons name="phone" size={18} color="#555" /><Text style={styles.infoText}>{item.phone || 'N/A'}</Text></View>
            <View style={styles.row}><FontAwesome5 name="globe" size={16} color="#555" /><Text style={styles.infoText}>Source: {item.source || 'N/A'}</Text></View>
            <View style={styles.row}><MaterialIcons name="flag" size={18} color="#555" /><Text style={styles.infoText}>Status: {item.status || 'N/A'}</Text></View>
            <View style={styles.row}><MaterialIcons name="location-city" size={18} color="#555" /><Text style={styles.infoText}>City: {item.city || 'N/A'}</Text></View>
            <View style={styles.row}><FontAwesome5 name="map-marker-alt" size={16} color="#555" /><Text style={styles.infoText}>State: {item.state || 'N/A'}</Text></View>
            <Divider style={{ marginVertical: 12 }} />
            {item.custom_fields && Object.entries(item.custom_fields).map(([question, answer], idx) => (
              <View key={idx} style={{ marginBottom: 8 }}>
                <Text style={styles.questionText}>{question}</Text>
                <View style={styles.answerBox}>
                  <Text style={styles.answerText}>{answer || 'N/A'}</Text>
                </View>
              </View>
            ))}
            <Divider style={{ marginVertical: 12 }} />
            <Menu
              visible={!!menuVisible[item.id]}
              onDismiss={() => closeMenu(item.id)}
              anchor={
                <Button mode="outlined" onPress={() => openMenu(item.id)} style={{ marginTop: 8 }}>
                  Assign To...
                </Button>
              }
            >
              {filteredTelecallers.map((tc) => (
                <Menu.Item key={tc.id} onPress={() => { assignLead(item.id, tc.id); closeMenu(item.id); }} title={tc.name} />
              ))}
            </Menu>
          </Card.Content>
        </Card>
      </Pressable>
    );
  };

  const FilterChips = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
      <Chip icon="close-circle" onPress={clearFilters} style={styles.chip} disabled={!filters.city && !filters.source && !filters.status}>
        Clear All
      </Chip>
      <Chip style={styles.chip} icon="map-marker" onPress={() => openFilterModal('city')}>{filters.city || 'City'}</Chip>
      <Chip style={styles.chip} icon="lightbulb-on" onPress={() => openFilterModal('source')}>{filters.source || 'Source'}</Chip>
    </ScrollView>
  );

  const getFilterModalData = () => {
    const data = filterOptions[currentFilterType + 's'] || [];
    if (searchQuery) {
        return data.filter(item => item.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    return data;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Leads Pool</Text>
        {leads.length > 0 && (
          <Button mode="text" onPress={handleSelectAll}>
            {selectedLeads.size === leads.length ? 'Deselect All' : 'Select All'}
          </Button>
        )}
      </View>

      <View style={styles.ruleContainer}>
        <Text style={styles.ruleLabel}>Auto-Assignment Rule:</Text>
        <Menu
          visible={ruleMenuVisible}
          onDismiss={() => setRuleMenuVisible(false)}
          anchor={
            <Button mode="outlined" onPress={() => setRuleMenuVisible(true)}>{assignmentRule}</Button>
          }
        >
          <Menu.Item onPress={() => { setAssignmentRule('Round-Robin'); setRuleMenuVisible(false); }} title="Round-Robin" />
          <Menu.Item onPress={() => { setAssignmentRule('By Availability'); setRuleMenuVisible(false); }} title="By Availability" disabled/>
        </Menu>
      </View>

      <View style={styles.ruleContainer}>
        <Text style={styles.ruleLabel}>Available Telecallers:</Text>
        <Button mode="outlined" onPress={() => setTelecallerModalVisible(true)}>
          {availableTelecallers.size} / {telecallers.length} Selected
        </Button>
      </View>
      
      <FlatList
        data={leads}
        keyExtractor={(item) => item.id?.toString()}
        renderItem={renderLeadItem}
        refreshing={loading}
        onRefresh={fetchUnassignedLeads}
        ListHeaderComponent={<FilterChips />}
        ListEmptyComponent={
          <View style={{alignItems: 'center', marginTop: 40}}>
            <Text>No unassigned leads found.</Text>
            <Text style={{color: '#666', marginTop: 4}}>Try clearing your filters.</Text>
          </View>
        }
      />

      {selectedLeads.size > 0 && (
        <View style={styles.bulkActionsContainer}>
          <Button mode="text" onPress={clearSelection} color="white">Clear</Button>
          <Text style={styles.bulkActionsText}>{selectedLeads.size} leads selected</Text>
          {/* --- This button now assigns directly --- */}
          <Button mode="contained" onPress={handleDirectBulkAssign} loading={loading}>
            Assign
          </Button>
        </View>
      )}

      <Portal>
        {/* Filter Selection Modal */}
        <Modal visible={isFilterModalVisible} onDismiss={() => setFilterModalVisible(false)} contentContainerStyle={styles.filterModalContainer}>
            <View>
                <Text style={styles.modalTitle}>Select {currentFilterType}</Text>
                <Searchbar placeholder="Search..." onChangeText={setSearchQuery} value={searchQuery} style={styles.searchBar} />
                <FlatList
                    data={getFilterModalData()}
                    keyExtractor={item => item}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.filterOption} onPress={() => handleSelectFilter(item)}>
                            <Text>{item}</Text>
                        </TouchableOpacity>
                    )}
                    ListEmptyComponent={<Text style={{textAlign: 'center', padding: 20}}>No options found.</Text>}
                />
            </View>
        </Modal>

        {/* Modal for Selecting Available Telecallers */}
        <Modal visible={isTelecallerModalVisible} onDismiss={() => setTelecallerModalVisible(false)} contentContainerStyle={styles.filterModalContainer}>
            <View style={{flex: 1}}>
                <Text style={styles.modalTitle}>Set Available Telecallers</Text>
                <FlatList
                    data={telecallers}
                    keyExtractor={item => item.id}
                    renderItem={({item}) => (
                        <TouchableOpacity style={styles.telecallerOption} onPress={() => handleToggleTelecaller(item.id)}>
                            <Checkbox.Android status={availableTelecallers.has(item.id) ? 'checked' : 'unchecked'} color="#00346a" />
                            <Text style={{fontSize: 16}}>{item.name}</Text>
                        </TouchableOpacity>
                    )}
                />
                <Button mode="contained" onPress={() => setTelecallerModalVisible(false)} style={{marginTop: 10}}>Done</Button>
            </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: { fontSize: 22, fontWeight: 'bold' },
  ruleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  ruleLabel: {
    fontSize: 16,
    color: '#333'
  },
  card: { 
    marginHorizontal: 16,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  cardSelected: {
    borderColor: '#00346a',
    borderWidth: 2,
    backgroundColor: '#eef5ff',
  },
  leadName: { fontSize: 18, fontWeight: 'bold' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  infoText: { marginLeft: 8, fontSize: 14, color: '#333', flexShrink: 1 },
  questionText: { fontWeight: 'bold', fontSize: 14, marginBottom: 4, color: '#444' },
  answerBox: {
    backgroundColor: '#f4f4f4',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0'
  },
  answerText: { fontSize: 14, color: '#333' },
  bulkActionsContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#333',
    borderRadius: 8,
    elevation: 4,
  },
  bulkActionsText: {
    color: 'white',
    fontWeight: 'bold',
  },
  modalContainer: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  modalButton: {
    marginVertical: 4,
  },
  chipContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    marginRight: 8,
  },
  filterModalContainer: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 8,
    height: '70%',
  },
  searchBar: {
    marginBottom: 12,
  },
  filterOption: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  telecallerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
});
