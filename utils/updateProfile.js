import { supabase } from '../supabaseClient';

export const updateProfile = async ({
  name,
  username,
  role,
  manager_id,
  email,
  manager_id_created_at = null,
}) => {
  console.log('🔄 updateProfile called with:', {
    name,
    username,
    role,
    manager_id,
    email,
    manager_id_created_at,
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('❌ Cannot get user:', userError?.message);
    return { error: userError || new Error('No user found') };
  }

  console.log('👤 Authenticated user:', user.id);

  if (!username || !email || !name) {
    console.warn('⚠️ Missing required profile fields');
    return { error: { message: 'Missing required profile fields' } };
  }

  const normalizedRole = role?.trim().toLowerCase();
  console.log('🔍 Normalized role:', normalizedRole);

  const { data: existingUser, error: checkError } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .neq('id', user.id)
    .maybeSingle();

  if (checkError) {
    console.error('❌ Error checking username uniqueness:', checkError.message);
    return { error: checkError };
  }

  if (existingUser) {
    console.warn('⚠️ Username already taken by another user:', username);
    return { error: { message: 'Username already taken by another user' } };
  }

  const profile = {
    id: user.id,
    name,
    username,
    email,
    role: normalizedRole,
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  if (normalizedRole === 'telecaller') {
    profile.manager_id = manager_id;
  } else if (normalizedRole === 'manager') {
    profile.manager_id = manager_id;
    profile.manager_id_created_at = manager_id_created_at;
  } else {
    profile.manager_id = null;
    profile.manager_id_created_at = null;
  }

  console.log('📦 Final profile object to upsert:', profile);

  const { error } = await supabase.from('profiles').upsert(profile, { onConflict: 'id' });

  if (error) {
    console.error('❌ Failed to upsert profile:', error.message);
    return { error };
  }

  console.log('✅ Profile upserted successfully');
  return { success: true };
};
