// Vercel serverless function (Node 18+)
// Endpoint: POST /api/transfer-leads
// Body JSON: { managerId, managerEmail, managerPassword, telecallerId }
// Env required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE env vars');
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { managerId, managerEmail, managerPassword, telecallerId } = req.body || {};
  if (!managerId || !managerEmail || !managerPassword || !telecallerId) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // 1) Verify manager credentials by hitting Supabase auth token endpoint (grant_type=password)
    const tokenResp = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email: managerEmail, password: managerPassword }),
    });

    const tokenPayload = await tokenResp.json();
    if (!tokenResp.ok || !tokenPayload.access_token) {
      return res.status(401).json({ message: 'Invalid manager credentials' });
    }

    // 2) Verify the token user matches managerId
    const managerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${tokenPayload.access_token}` } },
    });

    const { data: managerUser, error: getUserError } = await managerClient.auth.getUser();
    if (getUserError) {
      console.warn('Unable to fetch manager user from token', getUserError);
      return res.status(401).json({ message: 'Invalid manager token' });
    }

    const actualManager = managerUser?.data?.user || managerUser?.user || managerUser;
    if (!actualManager || actualManager.id !== managerId) {
      return res.status(403).json({ message: 'Manager identity mismatch' });
    }

    // 3) Verify manager owns the telecaller
    const { data: telecallerProfile, error: teleError } = await supabaseAdmin
      .from('profiles')
      .select('id, manager_id')
      .eq('id', telecallerId)
      .single();

    if (teleError || !telecallerProfile) {
      return res.status(404).json({ message: 'Telecaller not found' });
    }

    if (telecallerProfile.manager_id !== managerId) {
      return res.status(403).json({ message: 'Manager does not own this telecaller' });
    }

    // 4) Transfer all leads assigned to telecaller -> set telecaller_id = NULL (lead pool)
    const { data: moved, error: updErr } = await supabaseAdmin
      .from('leads')
      .update({ telecaller_id: null })
      .eq('telecaller_id', telecallerId);

    if (updErr) {
      console.error('transfer-leads update error', updErr);
      return res.status(500).json({ message: 'Failed to transfer leads', details: updErr });
    }

    return res.status(200).json({ ok: true, moved_count: Array.isArray(moved) ? moved.length : null });
  } catch (e) {
    console.error('transfer-leads unexpected error', e);
    return res.status(500).json({ message: 'Unexpected server error', details: String(e) });
  }
}
