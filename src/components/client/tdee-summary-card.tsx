'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type Profile = { start_date: string | null; tdee_gender: string | null; date_of_birth: string | null; height_cm: number | null };
type Weight = { bodyweight_kg: number };
type Session = { id: string };

const ageFromDob = (dob: string) => {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
};

const daysSince = (value: string | null) => {
  if (!value) return 0;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
};

const activityForSessions = (sessions: number) => {
  if (sessions <= 0) return { factor: 1.2, label: 'Low' };
  if (sessions <= 2) return { factor: 1.375, label: 'Light' };
  if (sessions <= 4) return { factor: 1.55, label: 'Moderate' };
  if (sessions <= 6) return { factor: 1.725, label: 'High' };
  return { factor: 1.9, label: 'Very high' };
};

const rounded = (value: number) => Math.round(value / 10) * 10;

export function TdeeSummaryCard({ clientId }: { clientId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weight, setWeight] = useState<Weight | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [profileResult, weightResult, sessionResult] = await Promise.all([
        supabase.from('clients').select('start_date, tdee_gender, date_of_birth, height_cm').eq('id', clientId).single(),
        supabase.from('bodyweight_entries').select('bodyweight_kg').eq('client_id', clientId).order('entry_date', { ascending: false }).limit(1),
        supabase.from('workout_sessions').select('id').eq('client_id', clientId).eq('status', 'completed').gte('completed_at', sevenDaysAgo.toISOString()),
      ]);

      if (profileResult.error || weightResult.error || sessionResult.error) {
        setError(profileResult.error?.message || weightResult.error?.message || sessionResult.error?.message || 'Could not load energy estimate.');
        setLoading(false);
        return;
      }

      setProfile(profileResult.data as Profile);
      setWeight(((weightResult.data ?? []) as Weight[])[0] ?? null);
      setSessions((sessionResult.data ?? []) as Session[]);
      setLoading(false);
    };

    load();
  }, [clientId]);

  if (loading) return <Card><p className="text-sm font-semibold text-gray-700">Loading energy estimate...</p></Card>;
  if (error) return <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>;

  if (!profile?.tdee_gender || !profile.date_of_birth || !profile.height_cm || !weight) {
    return (
      <Card className="border-2 border-dashed border-gray-300 bg-gray-50">
        <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Energy estimate</p>
        <h2 className="mt-2 text-2xl font-black uppercase text-[#000000]">TDEE setup needed</h2>
        <p className="mt-3 text-sm text-gray-700">Add equation profile, date of birth, height, and at least one bodyweight entry to show daily maintenance calories.</p>
        <Link href="/client/configure" className="mt-5 inline-flex rounded-lg bg-black px-4 py-3 text-xs font-bold uppercase text-white hover:bg-gray-900">Add details</Link>
      </Card>
    );
  }

  const age = ageFromDob(profile.date_of_birth);
  const bmrOffset = profile.tdee_gender === 'standard_minus' ? -161 : 5;
  const bmr = 10 * Number(weight.bodyweight_kg) + 6.25 * Number(profile.height_cm) - 5 * age + bmrOffset;
  const firstWeek = daysSince(profile.start_date) < 7;
  const sessionCount = firstWeek ? 3 : sessions.length;
  const activity = activityForSessions(sessionCount);
  const tdee = rounded(bmr * activity.factor);

  return (
    <Card variant="dark" className="p-6">
      <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Energy estimate</p>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-4xl font-black uppercase tracking-tight text-white">{tdee} kcal</h2>
          <p className="mt-1 text-sm font-semibold uppercase text-white/60">Estimated daily maintenance</p>
        </div>
        <Link href="/client/configure" className="w-fit rounded-lg border border-white/30 px-4 py-3 text-xs font-bold uppercase text-white hover:bg-white hover:text-black">Edit details</Link>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-white/10 p-3"><p className="text-[10px] font-bold uppercase text-white/50">BMR</p><p className="mt-1 text-lg font-black text-white">{rounded(bmr)} kcal</p></div>
        <div className="rounded-lg bg-white/10 p-3"><p className="text-[10px] font-bold uppercase text-white/50">Activity</p><p className="mt-1 text-lg font-black text-white">×{activity.factor}</p></div>
        <div className="rounded-lg bg-white/10 p-3"><p className="text-[10px] font-bold uppercase text-white/50">Bodyweight</p><p className="mt-1 text-lg font-black text-white">{weight.bodyweight_kg}kg</p></div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-white/60">Formula: Mifflin-St Jeor BMR × activity factor. Activity: {activity.label}. {firstWeek ? 'Using 3 sessions/week until 7 days of data exists.' : `${sessions.length} completed sessions in the past 7 days.`}</p>
    </Card>
  );
}
