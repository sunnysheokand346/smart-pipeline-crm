import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from "react-native";
import { Card } from "react-native-paper";
import { supabase } from "../supabaseClient";
import { useUser } from "../context/UserContext";

const LeadList = () => {
  const { profile } = useUser();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const role = (profile?.role || "").trim().toLowerCase();
  const isManager = role === "manager";
  // ✅ Correct ID to use is the UUID from Supabase Auth
  const currentUserId = profile?.id; 

  const fetchLeads = async () => {
    if (!currentUserId) return;
    setLoading(true);
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
      const finalLeads = leadData.map(lead => ({
        ...lead,
        assigned_to_name: telecallerMap[lead.assigned_to] || (lead.assigned_to ? 'Unknown' : 'Unassigned'),
      }));

      setLeads(finalLeads);

    } catch (err) {
      console.error("❌ Error fetching leads:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.id) {
        fetchLeads();
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
      <Text style={styles.title}>📋 All Leads</Text>
      <FlatList
        data={leads}
        keyExtractor={(item) => item.id?.toString()}
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Card.Title title={item.name} subtitle={`📞 ${item.phone}`} />
            <Card.Content>
              <Text>📍 Source: {item.source || "N/A"}</Text>
              <Text>📌 Status: {String(item.status).replace(/"/g, "")}</Text>
              {isManager && (
                <Text>👤 Assigned To: {item.assigned_to_name || "Unassigned"}</Text>
              )}
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <Text style={{ textAlign: "center" }}>No leads found</Text>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 16 },
  card: { marginBottom: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
});

export default LeadList;