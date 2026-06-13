import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

// Supabase server configuration.
// These values should be supplied by the environment, never committed directly to GitHub.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// This lets server routes avoid crashing when the preview environment is not configured yet.
export const isSupabaseServerConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const createClient = async () => {
  if (!isSupabaseServerConfigured) {
    throw new Error(
      'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the project environment variables.'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl!, supabaseAnonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Cookies cannot be set in some server-rendering contexts.
        }
      },
    },
  });
};
