import { supabase } from '../supabaseClient';
import 'react-native-get-random-values';
import { v4 as uuidv4 } from 'uuid';

const normalizePhone = (phone) => {
  return phone?.replace(/\s|-/g, '').trim();
};

const normalizeEmail = (email) => {
  return email?.toString().trim().toLowerCase();
};

export const uploadLeadsToSupabase = async (leads = []) => {
  console.log('🔍 Starting deduplication...');
  console.log(`🧾 Total incoming leads: ${leads.length}`);

  const freshLeads = [];
  const duplicateLeads = [];
  const seenInBatch = new Set();

  const normalizedBatch = leads.map((lead) => {
    const phone = normalizePhone(lead.phone);
    const email = normalizeEmail(lead.email);

    // ✅ Keep fixed schema columns separate from custom questions
    const fixedKeys = [
      'name',
      'phone',
      'email',        // ✅ for duplicate check
      'city',
      'state',
      'source',
      'status',
      'manager_id',
      'assigned_to',
      'created_at',
      'times_generated',
      'id'
    ];
    const customFields = {};

    Object.keys(lead).forEach((key) => {
      if (!fixedKeys.includes(key)) {
        customFields[key] = lead[key];
      }
    });

    const result = {
      id: uuidv4(),
      name: lead.name?.trim() || 'Unknown',
      phone,
      email: email || null,
      city: lead.city?.trim() || null,
      state: lead.state?.trim() || null,
      source: lead.source?.trim() || 'Unknown',
      status: lead.status?.trim() || 'New',
      manager_id: lead.manager_id || null,
      assigned_to: lead.assigned_to || null,
      created_at: new Date().toISOString(),
      times_generated: 1,
      custom_fields: Object.keys(customFields).length > 0 ? customFields : null
    };

    console.log('🔹 Normalized Lead:', result);
    return result;
  });

  const phoneList = normalizedBatch.map((lead) => lead.phone);
  const emailList = normalizedBatch.map((lead) => lead.email);
  console.log(`📞 Extracted ${phoneList.length} phones, 📧 ${emailList.length} emails`);

  // 1. Fetch existing leads (only phone + email for duplicate check)
  const { data: existingLeads, error } = await supabase
    .from('leads')
    .select('id, phone, email, assigned_to, manager_id, times_generated');

  if (error) {
    console.error('❌ Error fetching existing leads:', error);
    return { insertedCount: 0, skippedCount: 0, duplicateCount: 0 };
  }

  // Maps for fast lookup
  const phoneMap = new Map();
  const emailMap = new Map();

  (existingLeads || []).forEach((l) => {
    if (l.phone) phoneMap.set(normalizePhone(l.phone), l);
    if (l.email) emailMap.set(normalizeEmail(l.email), l);
  });

  console.log(`🧮 Deduplication started: checking ${normalizedBatch.length} leads...`);

  for (const lead of normalizedBatch) {
    const phone = lead.phone;
    const email = lead.email;
    const uniqueKey = `${phone || ''}_${email || ''}`;

    if (seenInBatch.has(uniqueKey)) {
      console.log(`⏭️ Skipping duplicate in batch: ${uniqueKey}`);
      continue;
    }
    seenInBatch.add(uniqueKey);

    const phoneDuplicate = phone && phoneMap.has(phone);
    const emailDuplicate = email && emailMap.has(email);

    if (phoneDuplicate || emailDuplicate) {
      const existing = phoneDuplicate
        ? phoneMap.get(phone)
        : emailMap.get(email);

      console.log(`📌 Found existing lead: ${phone || email}`);

      duplicateLeads.push({
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        city: lead.city,
        state: lead.state,
        source: lead.source,
        status: 'Duplicate',
        original_lead_id: existing.id,
        manager_id: lead.manager_id,
        assigned_to: existing.assigned_to,
        created_at: new Date().toISOString(),
      });

      continue;
    }

    freshLeads.push(lead);
  }

  // 2. Insert fresh leads
  let insertedCount = 0;
  if (freshLeads.length > 0) {
    const { error: insertError } = await supabase
      .from('leads')
      .insert(freshLeads);

    if (insertError) {
      console.error('❌ Error inserting leads:', insertError);
    } else {
      insertedCount = freshLeads.length;
      console.log(`✅ Inserted ${insertedCount} fresh leads.`);
    }
  }

  // 3. Insert duplicate leads
  let duplicateCount = 0;
  if (duplicateLeads.length > 0) {
    const { error: dupError } = await supabase
      .from('duplicates')
      .insert(duplicateLeads);

    if (dupError) {
      console.error('❌ Error inserting into duplicates:', dupError);
    } else {
      duplicateCount = duplicateLeads.length;
      console.log(`📌 Stored ${duplicateCount} duplicates.`);
    }
  }

  const skippedCount = seenInBatch.size - insertedCount - duplicateCount;
  console.log(`📊 Summary → ✅ Fresh: ${insertedCount}, ❌ Duplicates: ${duplicateCount}, ⏭️ Skipped: ${skippedCount}`);

  return {
    insertedCount,
    duplicateCount,
    skippedCount,
  };
};
