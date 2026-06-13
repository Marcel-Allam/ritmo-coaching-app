import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createClient();

  // Get the current session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // If not logged in, redirect to login
  if (!session?.user) {
    redirect('/login');
  }

  // Get the user's profile to determine role-based redirect
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (error || !profile) {
      console.error('Error fetching profile:', error);
      redirect('/login');
    }

    // Redirect based on role
    if (profile.role === 'coach') {
      redirect('/coach');
    } else {
      redirect('/client');
    }
  } catch (error) {
    console.error('Error in Home redirect:', error);
    redirect('/login');
  }
}
