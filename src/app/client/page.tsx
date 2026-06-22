'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { BodyweightTrendCard } from '@/components/client/bodyweight-trend-card';
import { CoachingStatusCard } from '@/components/client/coaching-status-card';
import { ClientDirectionMetricCards } from '@/components/client/client-direction-metric-cards';
import { NextWorkoutCard } from '@/components/client/next-workout-card';
import { ClientHubTargetSettings, TdeeSummaryCard } from '@/components/client/tdee-summary-card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = {
  id: string;
  full_name: string;
  tdee_gender: string | null;
  date_of_birth: string | null;
  height_cm: number | null;
};

type BodyweightRecord = { id: string; bodyweight_kg: number; entry_date: string };

type HubSettings = ClientHubTargetSettings & {
  show_bodyweight_card: boolean;
  show_next_workout_card: boolean;
  show_coaching_status_card: boolean;
  show_progress_cards: boolean;
};

const defaultSettings: HubSettings = {
  show_calorie_target: false,
  calorie_target: null,
  show_protein_target: false,
  protein_target_g: null,
  show_carb_target: false,
  carb_target_g: null,
  show_fat_target: false,
  fat_target_g: null,
  show_submit_bodyweight: true,
  target_notes: null,
  show_bodyweight_card: true,
  show_next_workout_card: true,
  show_coaching_status_card: true,
  show_progress_cards: true,
};

const SetupCard = ({ client, latestBodyweight }: { client: ClientRecord; latestBodyweight: BodyweightRecord | null }) => {
  const missingItems = [
    !client.tdee_gender ? 'BMR equation profile' : null,
    !client.date_of_birth ? 'date of birth' : null,
    !client.height_cm ? 'height' : null,
    !latestBodyweight ? 'starting bodyweight' : null,
  ].filter((item): item is string => Boolean(item));

  if (missingItems.length === 0) return null;

  return (
    <Card className="border-2 border-dashed border-[#FA0201] bg-red-50">
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Starting setup needed</p>
          <h2 className="mt-2 text-2xl font-black uppercase text-[#000000]">Complete your coaching baseline</h2>
          <p className="mt-2 text-sm text-gray-700">This is a one-time setup so your coach can estimate calorie and protein targets accurately.</p>
          <p className="mt-3 text-xs font-bold uppercase text-gray-600">Missing: {missingItems.join(', ')}</p>
        </div>
        <Link href="/client/configure" className="w-fit rounded-lg bg-[#FA0201] px-5 py-3 text-xs font-black uppercase text-white hover:bg-red-700">
          Complete setup
        </Link>
      </div>
    </Card>
  );
};

export default function ClientHub() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [latestBodyweight, setLatestBodyweight] = useState<BodyweightRecord | null>(null);
  const [settings, setSettings] = useState<HubSettings>(defaultSettings);
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
        .select('id, full_name, tdee_gender, date_of_birth, height_cm')
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        setMessage('This account is not linked to a client record yet.');
        setLoading(false);
        return;
      }

      const linkedClient = data as ClientRecord;
      setClient(linkedClient);

      const [settingsResult, bodyweightResult] = await Promise.all([
        supabase
          .from('client_hub_settings')
          .select('*')
          .eq('client_id', linkedClient.id)
          .maybeSingle(),
        supabase
          .from('bodyweight_entries')
          .select('id, bodyweight_kg, entry_date')
          .eq('client_id', linkedClient.id)
          .order('entry_date', { ascending: false })
          .limit(1),
      ]);

      if (settingsResult.error || bodyweightResult.error) {
        setMessage(settingsResult.error?.message || bodyweightResult.error?.message || 'Could not load hub setup.');
        setLoading(false);
        return;
      }

      setLatestBodyweight(((bodyweightResult.data ?? []) as BodyweightRecord[])[0] ?? null);

      const settingsData = settingsResult.data as any;
      if (settingsData) {
        setSettings({
          show_calorie_target: Boolean(settingsData.show_calorie_target),
          calorie_target: settingsData.calorie_target ?? null,
          show_protein_target: Boolean(settingsData.show_protein_target),
          protein_target_g: settingsData.protein_target_g ?? null,
          show_carb_target: Boolean(settingsData.show_carb_target),
          carb_target_g: settingsData.carb_target_g ?? null,
          show_fat_target: Boolean(settingsData.show_fat_target),
          fat_target_g: settingsData.fat_target_g ?? null,
          show_submit_bodyweight: Boolean(settingsData.show_submit_bodyweight),
          target_notes: settingsData.target_notes ?? null,
          show_bodyweight_card: Boolean(settingsData.show_bodyweight_card),
          show_next_workout_card: Boolean(settingsData.show_next_workout_card),
          show_coaching_status_card: Boolean(settingsData.show_coaching_status_card),
          show_progress_cards: Boolean(settingsData.show_progress_cards),
        });
      }

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

  const showSecondRow = settings.show_next_workout_card || settings.show_coaching_status_card;

  return (
    <div>
      <PageHeader title="YOUR HUB" subtitle={`Welcome, ${client.full_name}`} />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-8">
        <SetupCard client={client} latestBodyweight={latestBodyweight} />

        <section className={settings.show_bodyweight_card ? 'grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]' : 'grid grid-cols-1 gap-6'}>
          <TdeeSummaryCard settings={settings} />
          {settings.show_bodyweight_card && <BodyweightTrendCard clientId={client.id} showSubmitBodyweight={settings.show_submit_bodyweight} />}
        </section>

        {showSecondRow && (
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
            {settings.show_next_workout_card && <NextWorkoutCard clientId={client.id} />}
            {settings.show_coaching_status_card && <CoachingStatusCard clientId={client.id} />}
          </section>
        )}

        {settings.show_progress_cards && (
          <section>
            <SectionHeader title="YOUR PROGRESS" accent />
            <ClientDirectionMetricCards clientId={client.id} />
          </section>
        )}
      </div>
    </div>
  );
}
