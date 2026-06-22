'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientStatusRecord = {
  current_focus: string | null;
  next_review_date: string | null;
  start_date: string | null;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const getWeekNumber = (startDate: string | null) => {
  if (!startDate) return null;
  const start = new Date(startDate);
  const now = new Date();
  const dayDifference = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
  return Math.floor(dayDifference / 7) + 1;
};

export function CoachingStatusCard({ clientId }: { clientId: string }) {
  const [status, setStatus] = useState<ClientStatusRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStatus = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error: statusError } = await supabase
        .from('clients')
        .select('current_focus, next_review_date, start_date')
        .eq('id', clientId)
        .single();

      if (statusError || !data) {
        setError(statusError?.message || 'Could not load coaching status.');
        setLoading(false);
        return;
      }

      setStatus(data as ClientStatusRecord);
      setLoading(false);
    };

    loadStatus();
  }, [clientId]);

  if (loading) {
    return <Card><p className="text-sm font-semibold text-gray-700">Loading coaching status...</p></Card>;
  }

  if (error) {
    return <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>;
  }

  const weekNumber = getWeekNumber(status?.start_date ?? null);

  return (
    <Card variant="dark" className="flex h-full flex-col justify-between p-6">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Coaching status</p>
        <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white">
          {weekNumber ? `Week ${weekNumber}` : 'Active coaching'}
        </h2>
        <div className="mt-5 space-y-3">
          <div className="rounded-lg bg-white/10 p-3">
            <p className="text-[10px] font-bold uppercase text-white/50">Current focus</p>
            <p className="mt-1 text-sm font-black uppercase text-white">{status?.current_focus || 'No focus set yet'}</p>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <p className="text-[10px] font-bold uppercase text-white/50">Next review</p>
            <p className="mt-1 text-sm font-black uppercase text-white">{formatDate(status?.next_review_date ?? null)}</p>
          </div>
          <div className="rounded-lg bg-white/10 p-3">
            <p className="text-[10px] font-bold uppercase text-white/50">Start date</p>
            <p className="mt-1 text-sm font-black uppercase text-white">{formatDate(status?.start_date ?? null)}</p>
          </div>
        </div>
      </div>

      <Link href="/client/feedback" className="mt-6 inline-flex w-fit rounded-lg border border-white/30 px-4 py-3 text-xs font-black uppercase text-white hover:bg-white hover:text-black">
        View feedback
      </Link>
    </Card>
  );
}
