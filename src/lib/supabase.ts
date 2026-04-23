import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('⚠️ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in your environment! Please add them to your Netlify Site Settings -> Environment Variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});

export async function logActivity(userId: string, action: string, details: any = {}) {
  try {
    // Sanitize details to prevent excessively large objects or malicious nested structures
    const sanitizedDetails = JSON.parse(JSON.stringify(details, (_key, value) => {
      // Limit strings to 500 chars to avoid giant payloads
      if (typeof value === 'string' && value.length > 500) {
        return value.substring(0, 500) + '...';
      }
      return value;
    }));
    await supabase.from('activity_logs').insert({ user_id: userId, action, details: sanitizedDetails });
  } catch { /* non-critical */ }
}
