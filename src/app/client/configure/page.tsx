'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = {
  id: string;
  full_name: string;
  tdee_gender: string | null;
  date_of_birth: string | null;
  height_cm: number | null;
};

type BodyweightRecord = {
  bodyweight_kg: number;
  entry_date: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function ClientConfigurePage() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [latestBodyweight, setLatestBodyweight] = useState<BodyweightRecord | null>(null);
  const [equationProfile, setEquationProfile] = useState('standard_plus');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [bodyweightKg, setBodyweightKg] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSetup = async () => {
      if (!isSupabaseConfigured || !user) {
        setError('Account is not ready yet.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name, tdee_gender, date_of_birth, height_cm')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        setError('This account is not linked to a client record yet.');
        setLoading(false);
        return;
      }

      const loadedClient = clientData as ClientRecord;
      setClient(loadedClient);
      setEquationProfile(loadedClient.tdee_gender || 'standard_plus');
      setDateOfBirth(loadedClient.date_of_birth || '');
      setHeightCm(loadedClient.height_cm?.toString() || '');

      const { data: bodyweightData, error: bodyweightError } = await supabase
        .from('bodyweight_entries')
        .select('bodyweight_kg, entry_date')
        .eq('client_id', loadedClient.id)
        .order('entry_date', { ascending: false })
        .limit(1);

      if (bodyweightError) {
        setError(bodyweightError.message);
        setLoading(false);
        return;
      }

      const latest = ((bodyweightData ?? []) as BodyweightRecord[])[0] ?? null;
      setLatestBodyweight(latest);
      setLoading(false);
    };

    loadSetup();
  }, [user]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSupabaseConfigured || !client) return;

    const parsedHeight = Number.parseInt(heightCm, 10);
    const parsedWeight = Number.parseFloat(bodyweightKg);

    if (!equationProfile || !dateOfBirth || !Number.isFinite(parsedHeight)) {
      setError('Please complete equation profile, date of birth, and height.');
      return;
    }

    if (!latestBodyweight && !Number.isFinite(parsedWeight)) {
      setError('Please submit your starting bodyweight.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: profileError } = await supabase
      .from('clients')
      .update({
        tdee_gender: equationProfile,
        date_of_birth: dateOfBirth,
        height_cm: parsedHeight,
      })
      .eq('id', client.id);

    if (profileError) {
      setError(profileError.message);
      setSaving(false);
      return;
    }

    if (Number.isFinite(parsedWeight)) {
      const { error: bodyweightError } = await supabase.from('bodyweight_entries').insert({
        client_id: client.id,
        entry_date: todayIso(),
        bodyweight_kg: parsedWeight,
      });

      if (bodyweightError) {
        setError(bodyweightError.message);
        setSaving(false);
        return;
      }
    }

    setMessage('Starting setup saved.');
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <PageHeader title="STARTING SETUP" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-4xl px-4 py-6 md:px-8"><Card><p className="font-semibold text-gray-700">Loading setup...</p></Card></div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader title="STARTING SETUP" subtitle="Complete this once at the start of coaching." />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-8">
          {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-bold text-red-700">{error}</p></Card>}
          {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-bold text-green-800">{message}</p></Card>}

          <Card>
            <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">One-time baseline</p>
            <h1 className="mt-2 text-2xl font-black uppercase text-[#000000]">Coaching target setup</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              This gives your coach the baseline data needed to estimate calorie and protein targets. You usually only complete this once.
            </p>
          </Card>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card className="space-y-5">
              <label className="block">
                <span className="mb-2 block text-sm font-black uppercase text-[#000000]">BMR equation profile</span>
                <select value={equationProfile} onChange={(event) => setEquationProfile(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-sm font-bold text-black">
                  <option value="standard_plus">Standard +5 equation</option>
                  <option value="standard_minus">Standard -161 equation</option>
                </select>
                <p className="mt-2 text-xs font-semibold text-gray-600">Your coach uses this for BMR estimation only.</p>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black uppercase text-[#000000]">Date of birth</span>
                <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-sm font-bold text-black" />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black uppercase text-[#000000]">Height in cm</span>
                <input type="number" value={heightCm} onChange={(event) => setHeightCm(event.target.value)} placeholder="176" className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-sm font-bold text-black" />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black uppercase text-[#000000]">Starting bodyweight in kg</span>
                <input type="number" step="0.1" value={bodyweightKg} onChange={(event) => setBodyweightKg(event.target.value)} placeholder={latestBodyweight ? `${latestBodyweight.bodyweight_kg}` : '80.0'} className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-sm font-bold text-black" />
                {latestBodyweight && <p className="mt-2 text-xs font-semibold text-gray-600">Latest saved bodyweight: {latestBodyweight.bodyweight_kg}kg on {latestBodyweight.entry_date}. Leave blank if this has not changed.</p>}
              </label>
            </Card>

            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <button type="submit" disabled={saving} className="rounded-lg bg-[#FA0201] px-5 py-4 text-sm font-black uppercase text-white hover:bg-red-700 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save starting setup'}
              </button>
              <Link href="/client" className="rounded-lg border border-gray-300 bg-white px-5 py-4 text-center text-sm font-black uppercase text-[#000000] hover:bg-gray-100">
                Back to hub
              </Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
