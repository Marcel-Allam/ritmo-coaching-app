'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type BusySlot = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
};

const toDateTimeLocal = (date: Date) => {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 16);
};

const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

const getTimeRange = (localStart: string, durationMinutes: number) => {
  const startsAt = new Date(localStart);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  return {
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  };
};

export default function CoachBusyTimePage() {
  const [slots, setSlots] = useState<BusySlot[]>([]);
  const [title, setTitle] = useState('Busy time');
  const [startsAt, setStartsAt] = useState(() => toDateTimeLocal(new Date()));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSlots = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error: loadError } = await supabase
      .from('coach_calendar_blocks')
      .select('id, title, starts_at, ends_at')
      .order('starts_at', { ascending: true })
      .limit(100);

    if (loadError) {
      setError(loadError.message);
      setIsLoading(false);
      return;
    }

    setSlots((data ?? []) as BusySlot[]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadSlots();
  }, []);

  const addSlot = async () => {
    if (!isSupabaseConfigured) return;

    setIsSaving(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { data: userResult, error: userError } = await supabase.auth.getUser();

    if (userError || !userResult.user) {
      setError(userError?.message || 'Could not identify the logged-in coach.');
      setIsSaving(false);
      return;
    }

    const range = getTimeRange(startsAt, durationMinutes);
    const { error: insertError } = await supabase
      .from('coach_calendar_blocks')
      .insert({
        coach_id: userResult.user.id,
        block_type: 'blocked',
        title: title.trim() || 'Busy time',
        starts_at: range.starts_at,
        ends_at: range.ends_at,
      });

    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }

    setMessage('Busy time added.');
    setIsSaving(false);
    await loadSlots();
  };

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="BUSY TIME" subtitle="Add times when the coach is not available for calls." />

      <div className="mt-8 space-y-8">
        <Link href="/coach/calendar" className="text-sm font-bold uppercase text-[#FA0201]">← Back to calendar</Link>
        {message && <Card><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
        {error && <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1.3fr_1fr_0.7fr_auto] md:items-end">
            <div>
              <label className="mb-2 block text-sm font-semibold uppercase">Title</label>
              <input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold uppercase">Start</label>
              <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold uppercase">Duration</label>
              <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black">
                <option value={30}>30 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={120}>120 min</option>
              </select>
            </div>
            <Button type="button" disabled={isSaving} onClick={addSlot}>{isSaving ? 'Adding...' : 'Add'}</Button>
          </div>
        </Card>

        <div className="space-y-3">
          {isLoading ? (
            <Card><p className="text-sm font-semibold text-gray-700">Loading busy time...</p></Card>
          ) : slots.length === 0 ? (
            <Card><p className="text-sm text-gray-600">No busy time added yet.</p></Card>
          ) : slots.map((slot) => (
            <Card key={slot.id} className="bg-gray-50">
              <p className="font-bold uppercase text-[#000000]">{slot.title || 'Busy time'}</p>
              <p className="mt-1 text-xs text-gray-500">{formatDateTime(slot.starts_at)} – {formatDateTime(slot.ends_at)}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
