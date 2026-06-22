'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type BodyweightEntry = {
  id: string;
  entry_date: string;
  bodyweight_kg: number;
};

const formatDate = (value: string) => {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
};

const formatWeight = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return '—';
  return `${Math.round(value * 10) / 10}kg`;
};

const formatChange = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return '—';
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return 'No change';
  return `${rounded > 0 ? '+' : ''}${rounded}kg`;
};

const SubmitBodyweightLink = () => (
  <Link href="/client/submit/nutrition-bodyweight" className="w-fit rounded-lg bg-[#FA0201] px-4 py-3 text-xs font-black uppercase text-white hover:bg-red-700">
    Submit bodyweight
  </Link>
);

const BodyweightSparkline = ({ entries }: { entries: BodyweightEntry[] }) => {
  if (entries.length < 2) {
    return (
      <div className="mt-5 flex h-28 items-center justify-center rounded-xl bg-gray-100 text-xs font-black uppercase text-gray-500">
        More data needed
      </div>
    );
  }

  const weights = entries.map((entry) => Number(entry.bodyweight_kg));
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;
  const points = entries
    .map((entry, index) => {
      const x = (index / Math.max(entries.length - 1, 1)) * 100;
      const y = 82 - ((Number(entry.bodyweight_kg) - min) / range) * 62;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="mt-5 rounded-xl bg-gray-100 p-3">
      <svg className="h-28 w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1="0" y1="82" x2="100" y2="82" stroke="currentColor" strokeWidth="1" className="text-gray-300" />
        <polyline points={points} fill="none" stroke="currentColor" strokeWidth="4" className="text-[#FA0201]" />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] font-bold uppercase text-gray-500">
        <span>{formatDate(entries[0].entry_date)}</span>
        <span>{formatDate(entries[entries.length - 1].entry_date)}</span>
      </div>
    </div>
  );
};

export function BodyweightTrendCard({ clientId, showSubmitBodyweight = true }: { clientId: string; showSubmitBodyweight?: boolean }) {
  const [entries, setEntries] = useState<BodyweightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBodyweight = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error: bodyweightError } = await supabase
        .from('bodyweight_entries')
        .select('id, entry_date, bodyweight_kg')
        .eq('client_id', clientId)
        .order('entry_date', { ascending: false })
        .limit(12);

      if (bodyweightError) {
        setError(bodyweightError.message);
        setLoading(false);
        return;
      }

      setEntries(((data ?? []) as BodyweightEntry[]).reverse());
      setLoading(false);
    };

    loadBodyweight();
  }, [clientId]);

  const latest = entries[entries.length - 1] || null;
  const previous = entries[entries.length - 2] || null;
  const first = entries[0] || null;

  const previousChange = useMemo(() => {
    if (!latest || !previous) return null;
    return Number(latest.bodyweight_kg) - Number(previous.bodyweight_kg);
  }, [latest, previous]);

  const rangeChange = useMemo(() => {
    if (!latest || !first || latest.id === first.id) return null;
    return Number(latest.bodyweight_kg) - Number(first.bodyweight_kg);
  }, [latest, first]);

  if (loading) return <Card><p className="text-sm font-semibold text-gray-700">Loading bodyweight...</p></Card>;
  if (error) return <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>;

  if (!latest) {
    return (
      <Card className="flex h-full flex-col justify-between border-2 border-dashed border-gray-300 bg-gray-50">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Bodyweight</p>
          <h2 className="mt-2 text-2xl font-black uppercase text-[#000000]">No bodyweight logged</h2>
          <p className="mt-3 text-sm text-gray-700">Submit your first bodyweight entry to unlock the trend chart.</p>
        </div>
        {showSubmitBodyweight && <div className="mt-5"><SubmitBodyweightLink /></div>}
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Bodyweight</p>
          <h2 className="mt-2 text-4xl font-black uppercase tracking-tight text-[#000000]">{formatWeight(Number(latest.bodyweight_kg))}</h2>
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">Last logged: {formatDate(latest.entry_date)}</p>
        </div>
        {showSubmitBodyweight && <SubmitBodyweightLink />}
      </div>

      <BodyweightSparkline entries={entries} />

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-gray-100 p-3">
          <p className="text-[10px] font-bold uppercase text-gray-500">Last entry</p>
          <p className="mt-1 text-lg font-black text-[#000000]">{formatChange(previousChange)}</p>
        </div>
        <div className="rounded-lg bg-gray-100 p-3">
          <p className="text-[10px] font-bold uppercase text-gray-500">Chart range</p>
          <p className="mt-1 text-lg font-black text-[#000000]">{formatChange(rangeChange)}</p>
        </div>
      </div>
    </Card>
  );
}
