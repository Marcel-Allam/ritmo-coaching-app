'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = { id: string; full_name: string };

type AssignedTaskRecord = {
  id: string;
  task_type: string;
  task_name: string;
  instructions: string | null;
};

type CoachCallBookingStatus = 'requested' | 'accepted' | 'declined' | 'reschedule_pending' | 'cancelled' | 'completed';

type CoachCallBookingRecord = {
  id: string;
  booking_type: 'weekly_call' | 'extra_support';
  requested_starts_at: string | null;
  requested_ends_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: CoachCallBookingStatus;
  client_notes: string | null;
  coach_note: string | null;
  suggested_starts_at: string | null;
  suggested_ends_at: string | null;
  created_at: string;
};

const bookingSelect = 'id, booking_type, requested_starts_at, requested_ends_at, starts_at, ends_at, status, client_notes, coach_note, suggested_starts_at, suggested_ends_at, created_at';

const coachRequestRoutes: Record<string, string> = {
  key_lift: '/client/submit/key-lift',
  workout_checkin: '/client/submit/workout-checkin',
};

const formatTaskType = (taskType: string) => taskType.replaceAll('_', ' ');

const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

const toDateTimeLocal = (value: Date) => {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const getDefaultRequestedDateTime = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(18, 0, 0, 0);
  return toDateTimeLocal(date);
};

const getIsoRange = (localStart: string, durationMinutes: number) => {
  const startsAt = new Date(localStart);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  return {
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
  };
};

const getBookingFromRpc = (data: unknown) => {
  if (Array.isArray(data)) return (data[0] ?? null) as CoachCallBookingRecord | null;
  return (data ?? null) as CoachCallBookingRecord | null;
};

const isClosedBooking = (status: CoachCallBookingStatus) => {
  return ['declined', 'cancelled', 'completed'].includes(status);
};

const getMeetingDateLabel = (booking: CoachCallBookingRecord) => {
  if (booking.status === 'reschedule_pending' && booking.suggested_starts_at) {
    return `Coach proposed ${formatDateTime(booking.suggested_starts_at)}`;
  }

  if ((booking.status === 'accepted' || booking.status === 'completed') && booking.starts_at) {
    return formatDateTime(booking.starts_at);
  }

  if (booking.status === 'requested' && booking.requested_starts_at) {
    return `You requested ${formatDateTime(booking.requested_starts_at)}`;
  }

  if (booking.status === 'declined') return 'Declined by coach';
  if (booking.status === 'cancelled') return 'Request closed';
  return 'Awaiting booking';
};

const getStatusLabel = (status: CoachCallBookingStatus | 'none') => {
  if (status === 'accepted') return 'Confirmed';
  if (status === 'reschedule_pending') return 'Coach proposed a different time';
  if (status === 'requested') return 'Requested';
  if (status === 'declined') return 'Declined';
  if (status === 'cancelled') return 'Closed';
  if (status === 'completed') return 'Completed';
  return 'No meeting requested';
};

const getStatusColour = (status: CoachCallBookingStatus | 'none') => {
  if (status === 'accepted' || status === 'completed') return 'text-green-400';
  if (status === 'reschedule_pending') return 'text-yellow-300';
  if (status === 'declined' || status === 'cancelled') return 'text-red-300';
  return 'text-green-400';
};

export default function ClientCoachPage() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [booking, setBooking] = useState<CoachCallBookingRecord | null>(null);
  const [quickNote, setQuickNote] = useState('');
  const [requestedDateTime, setRequestedDateTime] = useState(getDefaultRequestedDateTime);
  const [requestedDurationMinutes, setRequestedDurationMinutes] = useState(30);
  const [loading, setLoading] = useState(true);
  const [savingRequest, setSavingRequest] = useState(false);
  const [updatingMeeting, setUpdatingMeeting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadCoachPage = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Client login is not ready.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        setMessage('This login is not linked to a client profile yet.');
        setLoading(false);
        return;
      }

      const linkedClient = clientData as ClientRecord;
      setClient(linkedClient);

      const [taskResult, bookingResult] = await Promise.all([
        supabase
          .from('assigned_tasks')
          .select('id, task_type, task_name, instructions')
          .eq('client_id', linkedClient.id)
          .eq('active', true)
          .in('task_type', ['key_lift', 'workout_checkin'])
          .order('created_at', { ascending: false }),
        supabase
          .from('coach_call_bookings')
          .select(bookingSelect)
          .eq('client_id', linkedClient.id)
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (taskResult.error) {
        setMessage(taskResult.error.message);
        setLoading(false);
        return;
      }

      if (bookingResult.error) {
        setMessage(bookingResult.error.message);
        setLoading(false);
        return;
      }

      setTasks((taskResult.data ?? []) as AssignedTaskRecord[]);
      setBooking((bookingResult.data?.[0] ?? null) as CoachCallBookingRecord | null);
      setLoading(false);
    };

    loadCoachPage();
  }, [user]);

  const coachRequestedTasks = useMemo(() => tasks, [tasks]);
  const canRequestCall = !booking || isClosedBooking(booking.status);
  const canCancelMeeting = Boolean(booking && !isClosedBooking(booking.status));

  const requestWeeklyCall = async () => {
    if (!client || !isSupabaseConfigured) {
      setMessage('Client profile is not ready.');
      return;
    }

    if (!requestedDateTime) {
      setMessage('Choose a time you are available for the call.');
      return;
    }

    setSavingRequest(true);
    setMessage(null);

    const supabase = createClient();
    const notes = quickNote.trim();
    const range = getIsoRange(requestedDateTime, requestedDurationMinutes);

    const { data, error } = await supabase.rpc('request_coach_call_booking', {
      p_client_id: client.id,
      p_requested_starts_at: range.starts_at,
      p_requested_ends_at: range.ends_at,
      p_client_notes: notes || null,
    });

    if (error || !data) {
      setMessage(error?.message || 'Could not request coach call.');
      setSavingRequest(false);
      return;
    }

    const newBooking = getBookingFromRpc(data);
    setBooking(newBooking);
    setQuickNote('');
    setRequestedDateTime(getDefaultRequestedDateTime());
    setRequestedDurationMinutes(30);
    setMessage('Coach call availability sent. Your coach will confirm or suggest another time.');
    setSavingRequest(false);
  };

  const respondToReschedule = async (accepted: boolean) => {
    if (!booking || !isSupabaseConfigured) return;
    setUpdatingMeeting(true);
    setMessage(null);

    const supabase = createClient();
    const { data, error } = await supabase.rpc('respond_to_coach_call_reschedule', {
      p_booking_id: booking.id,
      p_accept: accepted,
    });

    if (error || !data) {
      setMessage(error?.message || 'Could not update coach call.');
      setUpdatingMeeting(false);
      return;
    }

    const updatedBooking = getBookingFromRpc(data);
    setBooking(updatedBooking);
    setMessage(accepted ? 'Proposed coach call time accepted.' : 'Proposed time declined. You can request a new call when ready.');
    setUpdatingMeeting(false);
  };

  const cancelMeeting = async () => {
    if (!booking || !isSupabaseConfigured) return;

    setUpdatingMeeting(true);
    setMessage(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from('coach_call_bookings')
      .update({
        status: 'cancelled',
        suggested_starts_at: null,
        suggested_ends_at: null,
      })
      .eq('id', booking.id)
      .select(bookingSelect)
      .single();

    if (error || !data) {
      setMessage(error?.message || 'Could not cancel coach call.');
      setUpdatingMeeting(false);
      return;
    }

    setBooking(data as CoachCallBookingRecord);
    setMessage('Coach call cancelled. You can request a new call when ready.');
    setUpdatingMeeting(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <PageHeader title="COACH" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
            <Card><p className="text-sm font-semibold text-gray-700">Loading coach hub...</p></Card>
          </div>
        </main>
      </div>
    );
  }

  if (message && !client) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <PageHeader title="COACH" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
            <Card>
              <p className="font-bold uppercase text-[#000000]">Coach hub unavailable</p>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader title="COACH" subtitle={client ? `Your coaching hub, ${client.full_name}` : 'Your coaching hub'} />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-8">
          {message && <Card><p className="text-sm font-semibold text-gray-800">{message}</p></Card>}

          <section>
            <SectionHeader title="COACH MEETING" accent />
            <Card variant="dark" className="p-8">
              {canRequestCall ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-bold uppercase text-[#FA0201]">{booking ? `Last request ${getStatusLabel(booking.status)}` : 'No meeting requested'}</p>
                    <h1 className="mt-2 text-4xl font-black uppercase tracking-tight text-white md:text-6xl">Request a coach call</h1>
                    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">Choose a time you are available. Your coach will confirm it or suggest another time.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-[2fr_1fr]">
                    <div>
                      <label className="mb-2 block text-sm font-semibold uppercase text-white">Available time</label>
                      <input
                        type="datetime-local"
                        value={requestedDateTime}
                        onChange={(event) => setRequestedDateTime(event.target.value)}
                        className="w-full rounded-lg border-2 border-white/40 bg-white px-4 py-2 text-black focus:border-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold uppercase text-white">Duration</label>
                      <select
                        value={requestedDurationMinutes}
                        onChange={(event) => setRequestedDurationMinutes(Number(event.target.value))}
                        className="w-full rounded-lg border-2 border-white/40 bg-white px-4 py-2 text-black focus:border-white focus:outline-none"
                      >
                        <option value={15}>15 minutes</option>
                        <option value={30}>30 minutes</option>
                        <option value={45}>45 minutes</option>
                        <option value={60}>60 minutes</option>
                      </select>
                    </div>
                  </div>
                  <Textarea
                    label="Notes for your coach"
                    value={quickNote}
                    onChange={(event) => setQuickNote(event.target.value)}
                    placeholder="Example: I am free after work, want to review next week, or need help with a session."
                  />
                  <Button type="button" onClick={requestWeeklyCall} disabled={savingRequest} className="w-fit bg-[#FA0201] hover:bg-red-700">{savingRequest ? 'Sending...' : 'Send availability'}</Button>
                </div>
              ) : booking ? (
                <div>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <h1 className="text-5xl font-black uppercase tracking-tight text-white md:text-7xl">Coach Meeting</h1>
                    {canCancelMeeting && (
                      <button
                        type="button"
                        disabled={updatingMeeting}
                        onClick={cancelMeeting}
                        className="w-full rounded-lg bg-[#FA0201] px-5 py-3 text-sm font-black uppercase tracking-wide text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60 md:w-fit"
                      >
                        {updatingMeeting ? 'Cancelling...' : 'Cancel meeting'}
                      </button>
                    )}
                  </div>
                  <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
                    <div className="rounded-xl border-2 border-white p-5 text-white">
                      <p className="text-2xl font-bold">Date:</p>
                      <p className="mt-2 text-3xl">{getMeetingDateLabel(booking)}</p>
                      {booking.requested_starts_at && <p className="mt-3 text-sm text-white/60">Your requested time: {formatDateTime(booking.requested_starts_at)}</p>}
                      <p className="mt-3 text-sm text-white/60">Requested {formatDateTime(booking.created_at)}</p>
                      <div className="mt-12 border-t border-white/40 pt-5">
                        <p className="text-2xl font-bold">Status:</p>
                        <p className={`mt-2 text-3xl font-bold ${getStatusColour(booking.status)}`}>{getStatusLabel(booking.status)}</p>
                      </div>
                    </div>
                    <div className="rounded-xl border-2 border-white p-5 text-white">
                      <p className="text-2xl font-bold">Notes</p>
                      {booking.client_notes ? (
                        <ul className="mt-3 list-disc space-y-3 pl-5 text-2xl leading-snug">
                          {booking.client_notes.split('\n').filter(Boolean).map((note) => <li key={note}>{note}</li>)}
                        </ul>
                      ) : (
                        <p className="mt-3 text-lg text-white/70">No notes added yet.</p>
                      )}
                      {booking.coach_note && <p className="mt-6 border-t border-white/40 pt-4 text-sm text-white/70">Coach note: {booking.coach_note}</p>}
                    </div>
                  </div>

                  {booking.status === 'reschedule_pending' && (
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Button type="button" disabled={updatingMeeting} onClick={() => respondToReschedule(true)} className="bg-[#FA0201] hover:bg-red-700">Accept proposed time</Button>
                      <Button type="button" disabled={updatingMeeting} onClick={() => respondToReschedule(false)} variant="outline">Decline proposed time</Button>
                    </div>
                  )}
                </div>
              ) : null}
            </Card>
          </section>

          {coachRequestedTasks.length > 0 && (
            <section>
              <SectionHeader title="COACH REQUESTS" accent />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {coachRequestedTasks.map((task) => (
                  <Link key={task.id} href={coachRequestRoutes[task.task_type] || '/client/coach'}>
                    <Card className="h-full hover:bg-gray-50">
                      <p className="text-xs font-bold uppercase text-[#FA0201]">Coach requested</p>
                      <h2 className="mt-2 text-xl font-black uppercase text-[#000000]">{task.task_name || formatTaskType(task.task_type)}</h2>
                      <p className="mt-3 text-sm leading-relaxed text-gray-700">{task.instructions || `Complete this ${formatTaskType(task.task_type)} update for your coach.`}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeader title="LIVE CHAT" accent />
            <Card className="p-8">
              <p className="text-xs font-bold uppercase text-gray-500">Always available</p>
              <h2 className="mt-1 text-3xl font-black uppercase text-[#000000]">Message your coach</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-700">This will become the live chat area. For now, it marks where quick coach communication will live.</p>
              <div className="mt-6"><Button type="button" variant="outline">Open live chat</Button></div>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
