import { createBrowserClient } from '@supabase/ssr';

// Supabase browser configuration.
// These values must be provided by the hosting/build environment, not hardcoded in source files.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// This flag lets the app render a safe preview state if Bolt/Vercel has not injected env vars yet.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const createClient = () => {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the project environment variables.'
    );
  }

  return createBrowserClient(supabaseUrl!, supabaseAnonKey!);
};
