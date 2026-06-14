'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ClientInvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { user, profile, loading } = useAuth();
  const [message, setMessage] = useState('Checking invite...');
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    const claimInvite = async () => {
      if (loading) return;

      if (!isSupabaseConfigured) {
        setMessage('RITMO is not connected to Supabase yet.');
        return;
      }

      if (!user || !profile) {
        setMessage('Sign in as the invited client, then return to this invite link.');
        return;
      }

      if (profile.role !== 'client') {
        setMessage('This invite must be claimed from a client account.');
        return;
      }

      setIsClaiming(true);
      const supabase = createClient();
      const { error } = await supabase.rpc('claim_client_invite', {
        p_token: token,
      });

      if (error) {
        setMessage(error.message);
        setIsClaiming(false);
        return;
      }

      setMessage('Invite claimed. Taking you to your client hub...');
      setTimeout(() => router.push('/client'), 1000);
    };

    claimInvite();
  }, [loading, profile, router, token, user]);

  return (
    <main className="min-h-screen bg-black flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-lg border border-gray-700 bg-black text-white">
        <div className="space-y-6 text-center">
          <div>
            <h1 className="text-4xl font-bold text-[#FA0201]">RITMO</h1>
            <p className="mt-2 text-sm text-gray-400">Client Invite</p>
          </div>

          <p className="text-sm text-gray-200">{isClaiming ? 'Claiming your invite...' : message}</p>

          {!user && !loading && (
            <div className="space-y-3">
              <Link href="/login" className="block">
                <Button variant="primary" fullWidth>
                  SIGN IN OR CREATE ACCOUNT
                </Button>
              </Link>
              <p className="text-xs text-gray-500">
                After signing in, open this invite link again to connect your account.
              </p>
            </div>
          )}

          {user && profile?.role === 'coach' && (
            <Link href="/coach" className="text-sm font-semibold text-[#FA0201] hover:underline">
              Return to coach dashboard
            </Link>
          )}
        </div>
      </Card>
    </main>
  );
}
