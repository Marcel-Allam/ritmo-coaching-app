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

const getDurationMinutes = (slot: BusySlot) => {
  const startsAt = new Date(slot.starts_at).getTime();
  const endsAt = new Date(slot.ends_at).getTime();
  return Math.max(30, Math.round((endsAt - startsAt) / 60_000));
};

export default function CoachBusyTimePage() {
  const [slots, setSlots] = useState<BusySlot[]>([]);
  const [title, setTitle] = useState('Busy time');
  const [startsAt, setStartsAt] = useState(() => toDateTimeLocal(new Date()));
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('Busy time');
    setStartsAt(toDateTimeLocal(new Date()));
    setDurationMinutes(60);
    setEditingSlotId(null);
  };

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

  const saveSlot = async () => {
    if (!isSupabaseConfigured) return;

    setIsSaving(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const range = getTimeRange(startsAt, durationMinutes);
    const payload = {
      title: title.trim() || 'Busy time',
      starts_at: range.starts_at,
      ends_at: range.ends_at,
    };

    if (editingSlotId) {
      const { error: updateError } = await supabase
        .from('coach_calendar_blocks')
        .update(payload)
        .eq('id', editingSlotId);

      if (updateError) {
        setError(updateError.message);
        setIsSaving(false);
        return;
      }

      setMessage('Busy time updated.');
      setIsSaving(false);
      resetForm();
      await loadSlots();
      return;
    }

    const { data: userResult, error: userError } = await supabase.auth.getUser();

    if (userError || !userResult.user) {
      setError(userError?.message || 'Could not identify the logged-in coach.');
      setIsSaving(false);
      return;
    }

    const { error: insertError } = await supabase
      .from('coach_calendar_blocks')
      .insert({
        coach_id: userResult.user.id,
        block_type: 'blocked',
        ...payload,
      });

    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }

    setMessage('Busy time added.');
    setIsSaving(false);
    resetForm();
    await loadSlots();
  };

  const editSlot = (slot: BusySlot) => {
    setEditingSlotId(slot.id);
    setTitle(slot.title || 'Busy time');
    setStartsAt(toDateTimeLocal(new Date(slot.starts_at)));
    setDurationMinutes(getDurationMinutes(slot));
    setMessage(null);
    setError(null);
  };

  const deleteSlot = async (slotId: string) => {
    if (!isSupabaseConfigured) return;

    setDeletingSlotId(slotId);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from('coach_calendar_blocks')
      .delete()
      .eq('id', slotId);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingSlotId(null);
      return;
    }

    setSlots((currentSlots) => currentSlots.filter((slot) => slot.id !== slotId));
    setMessage('Busy time deleted.');
    setDeletingSlotId(null);
    if (editingSlotId === slotId) resetForm();
  };

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="BUSY TIME" subtitle="Add times when the coach is not available for calls." />

      <div className="mt-8 space-y-8">
        <Link href="/coach/calendar" className="text-sm font-bold uppercase text-[#FA0201]">← Back to calendar</Link>
        {message && <Card><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
        {error && <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

        <Card>
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="font-bold uppercase text-[#000000]">{editingSlotId ? 'Edit busy time' : 'Add busy time'}</p>
            {editingSlotId && <button type="button" onClick={resetForm} className="text-xs font-bold uppercase text-gray-500 hover:text-black">Cancel edit</button>}
          </div>
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
            <Button type="button" disabled={isSaving} onClick={saveSlot}>{isSaving ? 'Saving...' : editingSlotId ? 'Save' : 'Add'}</Button>
          </div>
        </Card>

        <div className="space-y-3">
          {isLoading ? (
            <Card><p className="text-sm font-semibold text-gray-700">Loading busy time...</p></Card>
          ) : slots.length === 0 ? (
            <Card><p className="text-sm text-gray-600">No busy time added yet.</p></Card>
          ) : slots.map((slot) => (
            <Card key={slot.id} className="flex flex-col gap-4 bg-gray-50 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-bold uppercase text-[#000000]">{slot.title || 'Busy time'}</p>
                <p className="mt-1 text-xs text-gray-500">{formatDateTime(slot.starts_at)} – {formatDateTime(slot.ends_at)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={deletingSlotId === slot.id} onClick={() => editSlot(slot)}>Edit</Button>
                <Button type="button" variant="outline" disabled={deletingSlotId === slot.id} onClick={() => deleteSlot(slot.id)}>
                  {deletingSlotId === slot.id ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
