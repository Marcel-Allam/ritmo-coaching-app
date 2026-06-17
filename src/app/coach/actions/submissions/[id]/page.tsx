'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import LegacySubmissionReviewPage from '../../../submissions/[id]/page';

type SubmissionRouteRecord = {
  client_id: string;
  submission_type: string;
  answer_text: string | null;
};

type CoachCallRequestRecord = {
  id: string;
  client_id: string;
  submitted_at: string;
  answer_text: string | null;
  review_status: string;
  clients: { full_name: string } | null;
};

type CalendarCall = {
  id: string;
  clientName: string;
  dateKey: string;
  dayLabel: string;
  timeLabel: string;
  status: string;
  isCurrent: boolean;
};

const calendarHours = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];

const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

const formatDayLabel = (date: Date) => new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
}).format(date);

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + days);
  return nextDate;
};

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

const getProposedCallDate = (submittedAt: string) => {
  const proposedDate = addDays(new Date(submittedAt), 1);
  proposedDate.setHours(16, 0, 0, 0);
  return proposedDate;
};

const getWeekStart = (date: Date) => {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

const parseNotes = (text: string | null) => {
  if (!text) return 'No notes provided.';
  const notesLine = text.split('\n').find((line) => line.startsWith('Notes:'));
  return notesLine?.replace('Notes:', '').trim() || text;
};

const formatStatus = (status: string) => {
  if (status === 'reviewed') return 'Confirmed';
  if (status === 'resolved') return 'Closed';
  if (status === 'needs_feedback') return 'Reschedule needed';
  return 'Requested';
};

const statusBadgeVariant = (status: string) => {
  if (status === 'reviewed') return 'success';
  if (status === 'needs_feedback') return 'warning';
  return 'default';
};

export default function CoachActionSubmissionRouterPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params.id as string;
  const [shouldUseLegacyReview, setShouldUseLegacyReview] = useState(false);
  const [callRequest, setCallRequest] = useState<CoachCallRequestRecord | null>(null);
  const [calendarCalls, setCalendarCalls] = useState<CalendarCall[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const routeSubmission = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        return;
      }

      const supabase = createClient();
      const { data, error: submissionError } = await supabase
        .from('task_submissions')
        .select('client_id, submission_type, answer_text')
        .eq('id', submissionId)
        .single();

      if (submissionError || !data) {
        setError(submissionError?.message || 'Submission not found.');
        return;
      }

      const submission = data as SubmissionRouteRecord;
      if (submission.submission_type === 'workout_session' && submission.answer_text) {
        router.replace(`/coach/clients/${submission.client_id}/workout-review/${submission.answer_text}`);
        return;
      }

      if (submission.submission_type === 'weekly_checkin') {
        router.replace(`/coach/clients/${submission.client_id}/weekly-review/${submissionId}`);
        return;
      }

      if (submission.submission_type !== 'coach_call_request') {
        setShouldUseLegacyReview(true);
        return;
      }

      const { data: callData, error: callError } = await supabase
        .from('task_submissions')
        .select('id, client_id, submitted_at, answer_text, review_status, clients(full_name)')
        .eq('id', submissionId)
        .single();

      if (callError || !callData) {
        setError(callError?.message || 'Coach call request not found.');
        return;
      }

      const loadedCall = callData as CoachCallRequestRecord;
      setCallRequest(loadedCall);

      const proposedDate = getProposedCallDate(loadedCall.submitted_at);
      const weekStart = getWeekStart(proposedDate);
      const weekEnd = addDays(weekStart, 6);
      weekEnd.setHours(23, 59, 59, 999);

      const { data: weekCallData, error: weekCallError } = await supabase
        .from('task_submissions')
        .select('id, client_id, submitted_at, answer_text, review_status, clients(full_name)')
        .eq('submission_type', 'coach_call_request')
        .neq('review_status', 'resolved')
        .gte('submitted_at', weekStart.toISOString())
        .lte('submitted_at', weekEnd.toISOString())
        .order('submitted_at', { ascending: true });

      if (weekCallError) {
        setError(weekCallError.message);
        return;
      }

      const mappedCalls = ((weekCallData ?? []) as CoachCallRequestRecord[]).map((item) => {
        const itemProposedDate = getProposedCallDate(item.submitted_at);
        return {
          id: item.id,
          clientName: item.clients?.full_name || 'Client',
          dateKey: toDateKey(itemProposedDate),
          dayLabel: formatDayLabel(itemProposedDate),
          timeLabel: '16:00',
          status: item.review_status,
          isCurrent: item.id === submissionId,
        };
      });

      setCalendarCalls(mappedCalls);
    };

    routeSubmission();
  }, [router, submissionId]);

  const weekDays = useMemo(() => {
    const baseDate = callRequest ? getProposedCallDate(callRequest.submitted_at) : new Date();
    const weekStart = getWeekStart(baseDate);
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      return {
        dateKey: toDateKey(date),
        label: formatDayLabel(date),
      };
    });
  }, [callRequest]);

  const updateCallStatus = async (status: string) => {
    if (!isSupabaseConfigured || !callRequest) return;
    setIsUpdating(true);
    setMessage(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('task_submissions')
      .update({ review_status: status })
      .eq('id', callRequest.id);

    if (updateError) {
      setError(updateError.message);
      setIsUpdating(false);
      return;
    }

    if (status === 'resolved') {
      router.push('/coach/actions');
      return;
    }

    setCallRequest((current) => current ? { ...current, review_status: status } : current);
    setCalendarCalls((current) => current.map((item) => item.id === callRequest.id ? { ...item, status } : item));
    setMessage(status === 'reviewed' ? 'Call request accepted.' : 'Marked for reschedule.');
    setIsUpdating(false);
  };

  if (error) {
    return (
      <div className="p-6 md:p-8">
        <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>
      </div>
    );
  }

  if (shouldUseLegacyReview) return <LegacySubmissionReviewPage />;

  if (!callRequest) {
    return (
      <div className="p-6 md:p-8">
        <Card>Opening review...</Card>
      </div>
    );
  }

  const requestDate = getProposedCallDate(callRequest.submitted_at);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-[#000000]">Coach Call Request</h1>
          <p className="mt-1 text-sm text-gray-600">
            {callRequest.clients?.full_name || 'Client'} • Requested {formatDateTime(callRequest.submitted_at)}
          </p>
        </div>
        <Badge variant={statusBadgeVariant(callRequest.review_status) as any}>{formatStatus(callRequest.review_status)}</Badge>
      </div>

      {message && (
        <Card className="mb-6">
          <p className="text-sm font-semibold text-gray-800">{message}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <section>
          <SectionHeader title="CALENDAR PREVIEW" accent />
          <Card>
            <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] overflow-hidden rounded-lg border border-gray-200 text-xs">
              <div className="bg-black p-3 font-bold uppercase text-white">Time</div>
              {weekDays.map((day) => (
                <div key={day.dateKey} className="border-l border-gray-200 bg-black p-3 text-center font-bold uppercase text-white">
                  {day.label}
                </div>
              ))}

              {calendarHours.map((hour) => (
                <div key={hour} className="contents">
                  <div className="border-t border-gray-200 bg-gray-100 p-3 font-bold text-[#000000]">{hour}</div>
                  {weekDays.map((day) => {
                    const call = calendarCalls.find((item) => item.dateKey === day.dateKey && item.timeLabel === hour);
                    return (
                      <div key={`${day.dateKey}-${hour}`} className="min-h-20 border-l border-t border-gray-200 bg-white p-2">
                        {call && (
                          <div className={`rounded-lg p-2 text-xs font-bold uppercase ${call.isCurrent ? 'bg-[#FA0201] text-white' : 'bg-gray-900 text-white'}`}>
                            <p>{call.clientName}</p>
                            <p className="mt-1 opacity-80">{formatStatus(call.status)}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section>
          <SectionHeader title="REQUEST" accent />
          <Card className="space-y-5">
            <div>
              <p className="text-xs font-bold uppercase text-gray-500">Proposed slot</p>
              <p className="mt-1 text-2xl font-black text-[#000000]">{formatDateTime(requestDate)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-gray-500">Client notes</p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{parseNotes(callRequest.answer_text)}</p>
            </div>
            <div className="grid grid-cols-1 gap-3">
              <Button type="button" disabled={isUpdating} onClick={() => updateCallStatus('reviewed')} className="bg-[#FA0201] hover:bg-red-700">
                Accept
              </Button>
              <Button type="button" disabled={isUpdating} onClick={() => updateCallStatus('needs_feedback')} variant="outline">
                Reschedule
              </Button>
              <Button type="button" disabled={isUpdating} onClick={() => updateCallStatus('resolved')} className="bg-black hover:bg-gray-900">
                Decline
              </Button>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
