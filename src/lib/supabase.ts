import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  || 'https://jwwlnjcickeignkemvrj.supabase.co';

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3d2xuamNpY2tlaWdua2VtdnJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyODk1OTAsImV4cCI6MjA4ODg2NTU5MH0.8l6kn6dh_Ki-ecQ78PsL9ma1R5XlhPN6-KmoE9cuYYo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});

export async function logActivity(userId: string, action: string, details: any = {}) {
  try {
    await supabase.from('activity_logs').insert({ user_id: userId, action, details });
  } catch { /* non-critical */ }
}
