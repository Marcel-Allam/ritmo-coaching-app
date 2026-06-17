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

type CallRequestRecord = {
  id: string;
  submitted_at: string;
  answer_text: string | null;
  review_status: string;
};

type MeetingStatus = 'none' | 'requested' | 'confirmed' | 'reschedule_pending';

type MeetingDraft = {
  id?: string;
  status: MeetingStatus;
  dateLabel: string;
  notes: string;
  submittedAt?: string;
};

const defaultMeetingDraft: MeetingDraft = {
  status: 'none',
  dateLabel: 'Awaiting booking',
  notes: '',
};

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

const extractNotes = (text: string | null) => {
  if (!text) return '';
  const notesLine = text.split('\n').find((line) => line.startsWith('Notes:'));
  return notesLine?.replace('Notes:', '').trim() || '';
};

const getSuggestedTimeIso = (text: string | null) => {
  if (!text) return null;
  const suggestedLine = text.split('\n').find((line) => line.startsWith('Suggested time:'));
  return suggestedLine?.replace('Suggested time:', '').trim() || null;
};

const getMeetingStatus = (reviewStatus: string): MeetingStatus => {
  if (reviewStatus === 'reviewed') return 'confirmed';
  if (reviewStatus === 'needs_feedback') return 'reschedule_pending';
  return 'requested';
};

const getMeetingDateLabel = (request: CallRequestRecord) => {
  const suggestedTime = getSuggestedTimeIso(request.answer_text);
  if (suggestedTime) return formatDateTime(suggestedTime);
  if (request.review_status === 'reviewed') return 'Confirmed by coach';
  return 'Awaiting coach confirmation';
};

const getStatusLabel = (status: MeetingStatus) => {
  if (status === 'confirmed') return 'Confirmed';
  if (status === 'reschedule_pending') return 'Reschedule pending';
  if (status === 'requested') return 'Requested';
  return 'No meeting booked';
};

const getStatusColour = (status: MeetingStatus) => {
  if (status === 'confirmed') return 'text-green-400';
  if (status === 'reschedule_pending') return 'text-yellow-300';
  return 'text-green-400';
};

export default function ClientCoachPage() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [meeting, setMeeting] = useState<MeetingDraft>(defaultMeetingDraft);
  const [quickNote, setQuickNote] = useState('');
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

      const [taskResult, callRequestResult] = await Promise.all([
        supabase
          .from('assigned_tasks')
          .select('id, task_type, task_name, instructions')
          .eq('client_id', linkedClient.id)
          .eq('active', true)
          .in('task_type', ['key_lift', 'workout_checkin'])
          .order('created_at', { ascending: false }),
        supabase
          .from('task_submissions')
          .select('id, submitted_at, answer_text, review_status')
          .eq('client_id', linkedClient.id)
          .eq('submission_type', 'coach_call_request')
          .neq('review_status', 'resolved')
          .order('submitted_at', { ascending: false })
          .limit(1),
      ]);

      if (taskResult.error) {
        setMessage(taskResult.error.message);
        setLoading(false);
        return;
      }

      if (callRequestResult.error) {
        setMessage(callRequestResult.error.message);
        setLoading(false);
        return;
      }

      const latestCallRequest = (callRequestResult.data?.[0] ?? null) as CallRequestRecord | null;
      if (latestCallRequest) {
        setMeeting({
          id: latestCallRequest.id,
          status: getMeetingStatus(latestCallRequest.review_status),
          dateLabel: getMeetingDateLabel(latestCallRequest),
          notes: extractNotes(latestCallRequest.answer_text),
          submittedAt: latestCallRequest.submitted_at,
        });
      }

      setTasks((taskResult.data ?? []) as AssignedTaskRecord[]);
      setLoading(false);
    };

    loadCoachPage();
  }, [user]);

  const coachRequestedTasks = useMemo(() => tasks, [tasks]);

  const requestWeeklyCall = async () => {
    if (!client || !isSupabaseConfigured) {
      setMessage('Client profile is not ready.');
      return;
    }

    setSavingRequest(true);
    setMessage(null);

    const supabase = createClient();
    const notes = quickNote.trim();
    const answerText = ['Request type: Weekly coach call', notes ? `Notes: ${notes}` : 'Notes: None provided'].join('\n');

    const { data, error } = await supabase
      .from('task_submissions')
      .insert({
        client_id: client.id,
        assigned_task_id: null,
        submission_type: 'coach_call_request',
        answer_text: answerText,
        review_status: 'needs_action',
        followup_required: true,
      })
      .select('id, submitted_at, answer_text, review_status')
      .single();

    if (error || !data) {
      setMessage(error?.message || 'Could not request coach call.');
      setSavingRequest(false);
      return;
    }

    const request = data as CallRequestRecord;
    setMeeting({
      id: request.id,
      status: 'requested',
      dateLabel: getMeetingDateLabel(request),
      notes: extractNotes(request.answer_text),
      submittedAt: request.submitted_at,
    });
    setMessage('Coach call requested. Your coach will see it in their action queue.');
    setSavingRequest(false);
  };

  const respondToReschedule = async (accepted: boolean) => {
    if (!meeting.id || !isSupabaseConfigured) return;
    setUpdatingMeeting(true);
    setMessage(null);

    const supabase = createClient();
    const nextStatus = accepted ? 'reviewed' : 'resolved';
    const { error } = await supabase
      .from('task_submissions')
      .update({ review_status: nextStatus })
      .eq('id', meeting.id);

    if (error) {
      setMessage(error.message);
      setUpdatingMeeting(false);
      return;
    }

    if (accepted) {
      setMeeting((current) => ({ ...current, status: 'confirmed' }));
      setMessage('Rescheduled coach call accepted.');
    } else {
      setMeeting(defaultMeetingDraft);
      setMessage('Rescheduled coach call declined.');
    }
    setUpdatingMeeting(false);
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <PageHeader title="COACH" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
            <Card><p className="font-semibold text-gray-700">Loading coach hub...</p></Card>
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
              {meeting.status === 'none' ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-bold uppercase text-[#FA0201]">No meeting booked</p>
                    <h1 className="mt-2 text-4xl font-black uppercase tracking-tight text-white md:text-6xl">Book your next coach call</h1>
                    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">Request your weekly coach call and add any notes you want to discuss.</p>
                  </div>
                  <Textarea
                    label="Notes for your coach"
                    value={quickNote}
                    onChange={(event) => setQuickNote(event.target.value)}
                    placeholder="Example: Talk through next week, adjust a session, or review an exercise."
                  />
                  <Button type="button" onClick={requestWeeklyCall} disabled={savingRequest} className="w-fit bg-[#FA0201] hover:bg-red-700">{savingRequest ? 'Requesting...' : 'Book weekly call'}</Button>
                </div>
              ) : (
                <div>
                  <h1 className="text-5xl font-black uppercase tracking-tight text-white md:text-7xl">Coach Meeting</h1>
                  <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
                    <div className="rounded-xl border-2 border-white p-5 text-white">
                      <p className="text-2xl font-bold">Date:</p>
                      <p className="mt-2 text-3xl">{meeting.dateLabel}</p>
                      {meeting.submittedAt && <p className="mt-3 text-sm text-white/60">Requested {formatDateTime(meeting.submittedAt)}</p>}
                      <div className="mt-12 border-t border-white/40 pt-5">
                        <p className="text-2xl font-bold">Status:</p>
                        <p className={`mt-2 text-3xl font-bold ${getStatusColour(meeting.status)}`}>{getStatusLabel(meeting.status)}</p>
                      </div>
                    </div>
                    <div className="rounded-xl border-2 border-white p-5 text-white">
                      <p className="text-2xl font-bold">Notes</p>
                      {meeting.notes ? (
                        <ul className="mt-3 list-disc space-y-3 pl-5 text-2xl leading-snug">
                          {meeting.notes.split('\n').filter(Boolean).map((note) => <li key={note}>{note}</li>)}
                        </ul>
                      ) : (
                        <p className="mt-3 text-lg text-white/70">No notes added yet.</p>
                      )}
                    </div>
                  </div>

                  {meeting.status === 'reschedule_pending' && (
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Button type="button" disabled={updatingMeeting} onClick={() => respondToReschedule(true)} className="bg-[#FA0201] hover:bg-red-700">Accept proposed time</Button>
                      <Button type="button" disabled={updatingMeeting} onClick={() => respondToReschedule(false)} variant="outline">Decline proposed time</Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          </section>

          {coachRequestedTasks.length > 0 && (
            <section>
              <SectionHeader title="COACH REQUESTS" accent />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {coachRequestedTasks.map((task) => (
                  <Link key={task.id} href={coachRequestRoutes[task.task_type] ?? '/client/coach'}>
                    <Card className="h-full cursor-pointer p-6 hover:shadow-lg">
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
