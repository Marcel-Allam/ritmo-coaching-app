'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = { id: string; full_name: string };

type HubSettings = {
  show_calorie_target: boolean;
  calorie_target: string;
  show_protein_target: boolean;
  protein_target_g: string;
  show_carb_target: boolean;
  carb_target_g: string;
  show_fat_target: boolean;
  fat_target_g: string;
  show_bodyweight_card: boolean;
  show_submit_bodyweight: boolean;
  show_next_workout_card: boolean;
  show_coaching_status_card: boolean;
  show_progress_cards: boolean;
  target_notes: string;
};

const defaults: HubSettings = {
  show_calorie_target: false,
  calorie_target: '',
  show_protein_target: false,
  protein_target_g: '',
  show_carb_target: false,
  carb_target_g: '',
  show_fat_target: false,
  fat_target_g: '',
  show_bodyweight_card: true,
  show_submit_bodyweight: true,
  show_next_workout_card: true,
  show_coaching_status_card: true,
  show_progress_cards: true,
  target_notes: '',
};

const numberOrNull = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) => (
  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-[#FA0201]" />
    <span className="text-sm font-black uppercase text-[#000000]">{label}</span>
  </label>
);

const TargetRow = ({ label, checked, value, placeholder, onChecked, onValue }: { label: string; checked: boolean; value: string; placeholder: string; onChecked: (checked: boolean) => void; onValue: (value: string) => void }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <label className="flex cursor-pointer items-center gap-3">
        <input type="checkbox" checked={checked} onChange={(event) => onChecked(event.target.checked)} className="h-5 w-5 accent-[#FA0201]" />
        <span className="text-sm font-black uppercase text-[#000000]">Show {label}</span>
      </label>
      <input type="number" value={value} onChange={(event) => onValue(event.target.value)} placeholder={placeholder} className="w-full rounded-lg border-2 border-gray-300 px-3 py-2 text-sm font-bold text-black md:w-44" />
    </div>
  </div>
);

export default function CoachClientHubSettingsPage() {
  const params = useParams();
  const clientId = params.id as string;
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [settings, setSettings] = useState<HubSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const [clientResult, settingsResult] = await Promise.all([
        supabase.from('clients').select('id, full_name').eq('id', clientId).single(),
        supabase.from('client_hub_settings').select('*').eq('client_id', clientId).maybeSingle(),
      ]);

      if (clientResult.error || !clientResult.data) {
        setError(clientResult.error?.message || 'Client not found.');
        setLoading(false);
        return;
      }

      if (settingsResult.error) {
        setError(settingsResult.error.message);
        setLoading(false);
        return;
      }

      setClient(clientResult.data as ClientRecord);
      const row = settingsResult.data as any;
      if (row) {
        setSettings({
          show_calorie_target: Boolean(row.show_calorie_target),
          calorie_target: row.calorie_target?.toString() || '',
          show_protein_target: Boolean(row.show_protein_target),
          protein_target_g: row.protein_target_g?.toString() || '',
          show_carb_target: Boolean(row.show_carb_target),
          carb_target_g: row.carb_target_g?.toString() || '',
          show_fat_target: Boolean(row.show_fat_target),
          fat_target_g: row.fat_target_g?.toString() || '',
          show_bodyweight_card: Boolean(row.show_bodyweight_card),
          show_submit_bodyweight: Boolean(row.show_submit_bodyweight),
          show_next_workout_card: Boolean(row.show_next_workout_card),
          show_coaching_status_card: Boolean(row.show_coaching_status_card),
          show_progress_cards: Boolean(row.show_progress_cards),
          target_notes: row.target_notes || '',
        });
      }
      setLoading(false);
    };

    load();
  }, [clientId]);

  const patch = <K extends keyof HubSettings>(key: K, value: HubSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSupabaseConfigured) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: saveError } = await supabase.from('client_hub_settings').upsert({
      client_id: clientId,
      show_calorie_target: settings.show_calorie_target,
      calorie_target: numberOrNull(settings.calorie_target),
      show_protein_target: settings.show_protein_target,
      protein_target_g: numberOrNull(settings.protein_target_g),
      show_carb_target: settings.show_carb_target,
      carb_target_g: numberOrNull(settings.carb_target_g),
      show_fat_target: settings.show_fat_target,
      fat_target_g: numberOrNull(settings.fat_target_g),
      show_bodyweight_card: settings.show_bodyweight_card,
      show_submit_bodyweight: settings.show_submit_bodyweight,
      show_next_workout_card: settings.show_next_workout_card,
      show_coaching_status_card: settings.show_coaching_status_card,
      show_progress_cards: settings.show_progress_cards,
      target_notes: settings.target_notes.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' });

    if (saveError) setError(saveError.message);
    else setMessage('Client hub settings saved.');
    setSaving(false);
  };

  if (loading) return <div className="p-6 md:p-8"><Card><p className="font-semibold text-gray-700">Loading hub settings...</p></Card></div>;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Client hub settings</p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-[#000000]">{client?.full_name || 'Client'}</h1>
          <p className="mt-2 text-sm text-gray-600">Set targets and toggle which hub cards this client sees.</p>
        </div>
        <Link href={`/coach/clients/${clientId}`} className="w-fit rounded-lg border border-gray-300 bg-white px-4 py-3 text-xs font-black uppercase text-[#000000] hover:bg-gray-100">Back to client</Link>
      </div>

      {error && <Card className="mb-6 border-2 border-red-200 bg-red-50"><p className="text-sm font-bold text-red-700">{error}</p></Card>}
      {message && <Card className="mb-6 border-2 border-green-200 bg-green-50"><p className="text-sm font-bold text-green-800">{message}</p></Card>}

      <form onSubmit={save} className="space-y-8">
        <section>
          <SectionHeader title="TODAY'S TARGETS" accent />
          <Card className="space-y-4">
            <TargetRow label="calorie target" checked={settings.show_calorie_target} value={settings.calorie_target} placeholder="2020" onChecked={(checked) => patch('show_calorie_target', checked)} onValue={(value) => patch('calorie_target', value)} />
            <TargetRow label="protein target" checked={settings.show_protein_target} value={settings.protein_target_g} placeholder="156" onChecked={(checked) => patch('show_protein_target', checked)} onValue={(value) => patch('protein_target_g', value)} />
            <TargetRow label="carbohydrate target" checked={settings.show_carb_target} value={settings.carb_target_g} placeholder="200" onChecked={(checked) => patch('show_carb_target', checked)} onValue={(value) => patch('carb_target_g', value)} />
            <TargetRow label="fat target" checked={settings.show_fat_target} value={settings.fat_target_g} placeholder="55" onChecked={(checked) => patch('show_fat_target', checked)} onValue={(value) => patch('fat_target_g', value)} />
            <label className="block">
              <span className="mb-2 block text-sm font-black uppercase text-[#000000]">Target notes</span>
              <textarea value={settings.target_notes} onChange={(event) => patch('target_notes', event.target.value)} rows={3} className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-sm text-black" placeholder="Optional note shown under targets." />
            </label>
          </Card>
        </section>

        <section>
          <SectionHeader title="CLIENT HUB CARDS" accent />
          <Card className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Toggle label="Show submit bodyweight button" checked={settings.show_submit_bodyweight} onChange={(checked) => patch('show_submit_bodyweight', checked)} />
            <Toggle label="Show bodyweight card" checked={settings.show_bodyweight_card} onChange={(checked) => patch('show_bodyweight_card', checked)} />
            <Toggle label="Show next workout card" checked={settings.show_next_workout_card} onChange={(checked) => patch('show_next_workout_card', checked)} />
            <Toggle label="Show coaching status card" checked={settings.show_coaching_status_card} onChange={(checked) => patch('show_coaching_status_card', checked)} />
            <Toggle label="Show progress cards" checked={settings.show_progress_cards} onChange={(checked) => patch('show_progress_cards', checked)} />
          </Card>
        </section>

        <button type="submit" disabled={saving} className="w-full rounded-lg bg-[#FA0201] px-5 py-4 text-sm font-black uppercase text-white hover:bg-red-700 disabled:opacity-60 md:w-fit">
          {saving ? 'Saving...' : 'Save client hub settings'}
        </button>
      </form>
    </div>
  );
}
