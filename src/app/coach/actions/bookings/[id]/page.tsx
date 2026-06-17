'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type BookingRecord = {
  id: string;
  client_id: string;
  booking_type: string;
  status: string;
  client_notes: string | null;
  coach_note: string | null;
  requested_starts_at: string | null;
  requested_ends_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  suggested_starts_at: string | null;
  suggested_ends_at: string | null;
  created_at: string;
  clients: { full_name: string } | null;
};

type TimeRange = { starts_at: string; ends_at: string };

const bookingSelect = 'id, client_id, booking_type, status, client_notes, coach_note, requested_starts_at, requested_ends_at, starts_at, ends_at, suggested_starts_at, suggested_ends_at, created_at, clients(full_name)';

const formatDateTime = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
};

const formatLabel = (value: string) => value.replaceAll('_', ' ');

const getBadgeVariant = (status: string) => {
  if (status === 'accepted' || status === 'completed') return 'success';
  if (status === 'declined' || status === 'cancelled') return 'danger';
  if (status === 'reschedule_pending') return 'warning';
  return 'default';
};

const toDateTimeLocal = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const getDefaultDateTimeLocal = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(16, 0, 0, 0);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const getIsoRange = (localStart: string, durationMinutes: number) => {
  const startsAt = new Date(localStart);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  return { starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() };
};

const getDurationMinutes = (start: string | null, end: string | null) => {
  if (!start || !end) return 30;
  return Math.max(15, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
};

export default function CoachBookingReviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const bookingId = params.id;
  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [meetingDateTime, setMeetingDateTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [coachNote, setCoachNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBooking = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error: loadError } = await supabase
        .from('coach_call_bookings')
        .select(bookingSelect)
        .eq('id', bookingId)
        .single();

      if (loadError || !data) {
        setError(loadError?.message || 'Booking not found.');
        setIsLoading(false);
        return;
      }

      const loadedBooking = data as BookingRecord;
      setBooking(loadedBooking);
      setCoachNote(loadedBooking.coach_note ?? '');
      setMeetingDateTime(
        toDateTimeLocal(loadedBooking.suggested_starts_at)
          || toDateTimeLocal(loadedBooking.starts_at)
          || toDateTimeLocal(loadedBooking.requested_starts_at)
          || getDefaultDateTimeLocal()
      );
      setDurationMinutes(getDurationMinutes(loadedBooking.requested_starts_at, loadedBooking.requested_ends_at));
      setIsLoading(false);
    };

    loadBooking();
  }, [bookingId]);

  const getConflictMessage = async (range: TimeRange) => {
    if (!booking) return 'Booking not loaded.';
    const supabase = createClient();
    const [busyResult, callResult] = await Promise.all([
      supabase.from('coach_calendar_blocks').select('id, title').lt('starts_at', range.ends_at).gt('ends_at', range.starts_at).limit(1),
      supabase.from('coach_call_bookings').select('id, clients(full_name)').eq('status', 'accepted').neq('id', booking.id).lt('starts_at', range.ends_at).gt('ends_at', range.starts_at).limit(1),
    ]);
    if (busyResult.error) return busyResult.error.message;
    if (callResult.error) return callResult.error.message;
    if ((busyResult.data ?? []).length > 0) return 'This time overlaps with existing busy time.';
    if ((callResult.data ?? []).length > 0) return 'This time overlaps with another accepted coach call.';
    return null;
  };

  const updateBooking = async (nextStatus: 'accepted' | 'reschedule_pending' | 'declined' | 'completed') => {
    if (!booking || !isSupabaseConfigured) return;

    setIsSaving(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const note = coachNote.trim() || null;
    const updatePayload: Record<string, string | null> = { status: nextStatus, coach_note: note };

    if (nextStatus === 'accepted' || nextStatus === 'reschedule_pending') {
      if (!meetingDateTime) {
        setError('Choose a date and time first.');
        setIsSaving(false);
        return;
      }

      const range = getIsoRange(meetingDateTime, durationMinutes);
      const conflictMessage = await getConflictMessage(range);
      if (conflictMessage) {
        setError(conflictMessage);
        setIsSaving(false);
        return;
      }

      if (nextStatus === 'accepted') {
        updatePayload.starts_at = range.starts_at;
        updatePayload.ends_at = range.ends_at;
        updatePayload.suggested_starts_at = null;
        updatePayload.suggested_ends_at = null;
      }

      if (nextStatus === 'reschedule_pending') {
        updatePayload.suggested_starts_at = range.starts_at;
        updatePayload.suggested_ends_at = range.ends_at;
      }
    }

    if (nextStatus === 'declined' || nextStatus === 'completed') {
      updatePayload.suggested_starts_at = null;
      updatePayload.suggested_ends_at = null;
    }

    const { data, error: updateError } = await supabase
      .from('coach_call_bookings')
      .update(updatePayload)
      .eq('id', booking.id)
      .select(bookingSelect)
      .single();

    if (updateError || !data) {
      setError(updateError?.message || 'Could not update booking.');
      setIsSaving(false);
      return;
    }

    setBooking(data as BookingRecord);
    setMessage(nextStatus === 'accepted' ? 'Coach call accepted.' : nextStatus === 'reschedule_pending' ? 'Proposed time sent to client.' : nextStatus === 'completed' ? 'Coach call marked completed.' : 'Coach call declined.');
    setIsSaving(false);
    router.push('/coach/actions');
    router.refresh();
  };

  if (isLoading) {
    return <div className="p-6 md:p-8"><PageHeader title="BOOKING REVIEW" /><Card><p className="text-sm font-semibold text-gray-700">Loading booking...</p></Card></div>;
  }

  if (error && !booking) {
    return (
      <div className="p-6 md:p-8">
        <PageHeader title="BOOKING REVIEW" />
        <Card>
          <p className="font-bold uppercase text-[#000000]">Booking unavailable</p>
          <p className="mt-2 text-sm text-gray-700">{error}</p>
          <Link href="/coach/actions" className="mt-4 inline-block text-sm font-bold uppercase text-[#FA0201]">Back to actions</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="BOOKING REVIEW" subtitle="Accept the client's requested time, reschedule, decline, or complete a coach call." />
      <div className="mt-8 space-y-6">
        <Link href="/coach/actions" className="text-sm font-bold uppercase text-[#FA0201]">← Back to actions</Link>
        {message && <Card><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
        {error && <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

        {booking && (
          <Card className="space-y-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-gray-500">Client</p>
                <h1 className="mt-1 text-3xl font-black uppercase text-[#000000]">{booking.clients?.full_name ?? 'Client'}</h1>
                <p className="mt-2 text-sm text-gray-600">Request created {formatDateTime(booking.created_at)}</p>
              </div>
              <Badge variant={getBadgeVariant(booking.status) as any}>{formatLabel(booking.status)}</Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-lg border border-gray-200 p-4"><p className="text-xs font-bold uppercase text-gray-500">Booking type</p><p className="mt-1 font-semibold uppercase text-[#000000]">{formatLabel(booking.booking_type)}</p></div>
              <div className="rounded-lg border border-gray-200 p-4"><p className="text-xs font-bold uppercase text-gray-500">Client requested</p><p className="mt-1 font-semibold text-[#000000]">{formatDateTime(booking.requested_starts_at)}</p></div>
              <div className="rounded-lg border border-gray-200 p-4"><p className="text-xs font-bold uppercase text-gray-500">Confirmed time</p><p className="mt-1 font-semibold text-[#000000]">{formatDateTime(booking.starts_at)}</p></div>
              <div className="rounded-lg border border-gray-200 p-4"><p className="text-xs font-bold uppercase text-gray-500">Coach proposed</p><p className="mt-1 font-semibold text-[#000000]">{formatDateTime(booking.suggested_starts_at)}</p></div>
            </div>

            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-xs font-bold uppercase text-gray-500">Client notes</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">{booking.client_notes || 'No notes added.'}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
              <div>
                <label className="mb-2 block text-sm font-semibold uppercase">Call date and time</label>
                <input type="datetime-local" value={meetingDateTime} onChange={(event) => setMeetingDateTime(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black focus:border-black focus:outline-none focus:ring-2 focus:ring-black/50" />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold uppercase">Duration</label>
                <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black focus:border-black focus:outline-none focus:ring-2 focus:ring-black/50">
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>
            </div>

            <Textarea label="Coach note" value={coachNote} onChange={(event) => setCoachNote(event.target.value)} placeholder="Optional note for the client." />

            <div className="flex flex-wrap gap-3">
              <Button type="button" disabled={isSaving} onClick={() => updateBooking('accepted')}>Accept requested time</Button>
              <Button type="button" disabled={isSaving} variant="secondary" onClick={() => updateBooking('reschedule_pending')}>Suggest another time</Button>
              <Button type="button" disabled={isSaving} variant="outline" onClick={() => updateBooking('declined')}>Decline</Button>
              {booking.status === 'accepted' && <Button type="button" disabled={isSaving} variant="outline" onClick={() => updateBooking('completed')}>Mark completed</Button>}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
