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
const roundedToFive = (value: number) => Math.round(value / 5) * 5;

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
        setError(profileResult.error?.message || weightResult.error?.message || sessionResult.error?.message || 'Could not load target estimate.');
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

  if (loading) return <Card><p className="text-sm font-semibold text-gray-700">Loading targets...</p></Card>;
  if (error) return <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>;

  if (!profile?.tdee_gender || !profile.date_of_birth || !profile.height_cm || !weight) {
    return (
      <Card className="border-2 border-dashed border-gray-300 bg-gray-50">
        <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Today's targets</p>
        <h2 className="mt-2 text-2xl font-black uppercase text-[#000000]">Target setup needed</h2>
        <p className="mt-3 text-sm text-gray-700">Add equation profile, date of birth, height, and at least one bodyweight entry to show daily targets.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/client/configure" className="inline-flex rounded-lg bg-black px-4 py-3 text-xs font-bold uppercase text-white hover:bg-gray-900">Add details</Link>
          <Link href="/client/submit/nutrition-bodyweight" className="inline-flex rounded-lg bg-[#FA0201] px-4 py-3 text-xs font-bold uppercase text-white hover:bg-red-700">Submit bodyweight</Link>
        </div>
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
  const calorieTarget = Math.max(1200, rounded(tdee - 500));
  const proteinTarget = Math.round(Number(weight.bodyweight_kg) * 1.8);
  const estimatedFatTarget = Math.round(Number(weight.bodyweight_kg) * 0.8);
  const carbTarget = Math.max(0, roundedToFive((calorieTarget - proteinTarget * 4 - estimatedFatTarget * 9) / 4));

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px]">
        <div className="bg-white p-6">
          <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Today's targets</p>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-gray-100 p-4">
              <p className="text-[10px] font-bold uppercase text-gray-500">Calorie target</p>
              <p className="mt-2 text-2xl font-black text-[#000000]">{calorieTarget} kcal</p>
            </div>
            <div className="rounded-xl bg-gray-100 p-4">
              <p className="text-[10px] font-bold uppercase text-gray-500">Protein target</p>
              <p className="mt-2 text-2xl font-black text-[#000000]">{proteinTarget}g</p>
            </div>
            <div className="rounded-xl bg-gray-100 p-4">
              <p className="text-[10px] font-bold uppercase text-gray-500">Carbohydrate target</p>
              <p className="mt-2 text-2xl font-black text-[#000000]">{carbTarget}g</p>
            </div>
          </div>
          <p className="mt-4 text-xs font-semibold text-gray-500">
            TDEE estimate: {tdee} kcal • Activity: {activity.label} ({firstWeek ? 'using 3 sessions until 7 days of data exists' : `${sessions.length} sessions in the past 7 days`}) • Bodyweight: {weight.bodyweight_kg}kg
          </p>
        </div>

        <Link href="/client/submit/nutrition-bodyweight" className="flex min-h-40 items-center justify-center bg-[#FA0201] p-6 text-center text-2xl font-black uppercase text-white hover:bg-red-700">
          Submit bodyweight
        </Link>
      </div>
    </Card>
  );
}
