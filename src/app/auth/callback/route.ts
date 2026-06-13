import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/coach';

  if (code) {
    const supabase = await createClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // Get the user's profile to determine redirect path
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

          const redirectPath = profile?.role === 'coach' ? '/coach' : '/client';
          return NextResponse.redirect(new URL(redirectPath, request.url));
        } catch (error) {
          console.error('Error fetching profile:', error);
          return NextResponse.redirect(new URL(next, request.url));
        }
      }

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Return error response
  return NextResponse.redirect(
    new URL(`/login?error=auth_code_error`, request.url)
  );
}
