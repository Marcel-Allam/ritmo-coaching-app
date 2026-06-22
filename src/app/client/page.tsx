'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { ClientDirectionMetricCards } from '@/components/client/client-direction-metric-cards';
import { TdeeSummaryCard } from '@/components/client/tdee-summary-card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = { id: string; full_name: string };

export default function ClientHub() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadHub = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Account is not ready yet.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        setMessage('This account is not linked to a client record yet.');
        setLoading(false);
        return;
      }

      setClient(data as ClientRecord);
      setLoading(false);
    };

    loadHub();
  }, [user]);

  if (loading) {
    return (
      <div>
        <PageHeader title="YOUR HUB" />
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
          <Card><p className="font-semibold text-gray-700">Loading your hub...</p></Card>
        </div>
      </div>
    );
  }

  if (message || !client) {
    return (
      <div>
        <PageHeader title="YOUR HUB" />
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
          <Card>
            <p className="font-bold uppercase text-[#000000]">Account not linked</p>
            <p className="mt-2 text-sm text-gray-600">{message}</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="YOUR HUB" subtitle={`Welcome, ${client.full_name}`} />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-8">
        <TdeeSummaryCard clientId={client.id} />

        <section>
          <SectionHeader title="YOUR PROGRESS" accent />
          <ClientDirectionMetricCards clientId={client.id} />
        </section>
      </div>
    </div>
  );
}
