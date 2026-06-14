'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function GenerateClientInvitePage() {
  const params = useParams();
  const clientId = params.id as string;

  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateInvite = async () => {
    if (!isSupabaseConfigured) {
      setMessage('Supabase environment variables are not configured.');
      return;
    }

    setIsGenerating(true);
    setMessage(null);
    setInviteLink(null);

    const supabase = createClient();

    // Calls the secure Supabase RPC created in the invite migration.
    // The raw token is returned only once, then stored in the database as a hash.
    const { data, error } = await supabase.rpc('generate_client_invite', {
      p_client_id: clientId,
      p_expires_hours: 168,
    });

    if (error || !data) {
      setMessage(error?.message || 'Could not generate invite.');
      setIsGenerating(false);
      return;
    }

    const link = `${window.location.origin}/invite/${data as string}`;
    setInviteLink(link);

    try {
      await navigator.clipboard.writeText(link);
      setMessage('Invite link generated and copied. It expires in 7 days.');
    } catch {
      setMessage('Invite link generated. Copy it manually below. It expires in 7 days.');
    }

    setIsGenerating(false);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <Link
          href={`/coach/clients/${clientId}`}
          className="text-sm font-semibold uppercase text-[#FA0201] hover:underline"
        >
          Back to client profile
        </Link>
      </div>

      <Card>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold uppercase text-[#000000]">
              Generate Client Invite
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Create a secure one-time invite link so this client can connect their login
              to this RITMO profile.
            </p>
          </div>

          <Button variant="primary" onClick={generateInvite} disabled={isGenerating}>
            {isGenerating ? 'Generating...' : 'Generate Invite Link'}
          </Button>

          {message && <p className="text-sm font-semibold text-gray-800">{message}</p>}

          {inviteLink && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs break-all text-gray-700">
              {inviteLink}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
