import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://eeayjlriibftpmqeyaey.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlYXlqbHJpaWJmdHBtcWV5YWV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1NzExMDMsImV4cCI6MjA2NzE0NzEwM30.38xLIiM6kQ9-nMiK_ESwR863cFUYWXtRuzUJXMcACSc';

console.log('🛠️ Supabase initialized with URL:', process.env.SUPABASE_URL || supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,          // ✅ Persist sessions across app restarts
    storage: AsyncStorage,         // ✅ Use AsyncStorage for React Native
  },
});

// Export the URL and anon key so other modules can call the REST API directly if needed
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;
