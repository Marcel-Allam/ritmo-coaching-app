'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface SubmissionRecord {
  id: string;
  client_id: string;
  submission_type: string;
  submitted_at: string;
  answer_value: number | null;
  answer_text: string | null;
  review_status: string;
  followup_required: boolean;
}

interface CoachCallBookingRecord {
  id: string;
  client_id: string;
  status: string;
  created_at: string;
  clients: { full_name: string } | null;
}

interface ClientRecord { id: string; full_name: string }
interface SessionIdRecord { id: string }

const workoutReviewTypes = ['workout_session', 'workout_checkin'];

const formatDateTime = (value: string) => {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const formatLabel = (value: string) => value.replaceAll('_', ' ');

const getStatusBadgeVariant = (status: string) => {
  if (status === 'reviewed' || status === 'accepted' || status === 'completed') return 'success';
  if (status === 'resolved' || status === 'flagged' || status === 'declined' || status === 'cancelled') return 'danger';
  if (status === 'needs_feedback' || status === 'needs_action' || status === 'reschedule_pending') return 'warning';
  return 'default';
};

export default function CoachActionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [callBookings, setCallBookings] = useState<CoachCallBookingRecord[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActions = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const [submissionResult, bookingResult] = await Promise.all([
      supabase
        .from('task_submissions')
        .select('id, client_id, submission_type, submitted_at, answer_value, answer_text, review_status, followup_required')
        .in('submission_type', workoutReviewTypes)
        .order('submitted_at', { ascending: false })
        .limit(75),
      supabase
        .from('coach_call_bookings')
        .select('id, client_id, status, created_at, clients(full_name)')
        .in('status', ['requested', 'reschedule_pending'])
        .order('created_at', { ascending: false })
        .limit(75),
    ]);

    if (submissionResult.error) { setError(submissionResult.error.message); setIsLoading(false); return; }
    if (bookingResult.error) { setError(bookingResult.error.message); setIsLoading(false); return; }

    const loadedSubmissions = (submissionResult.data ?? []) as SubmissionRecord[];
    const loadedBookings = (bookingResult.data ?? []) as CoachCallBookingRecord[];

    const workoutSessionSubmissionIds = loadedSubmissions
      .filter((submission) => submission.submission_type === 'workout_session' && submission.answer_text)
      .map((submission) => submission.answer_text as string);

    let validWorkoutSessionIds = new Set<string>();
    if (workoutSessionSubmissionIds.length > 0) {
      const { data: sessionData, error: sessionError } = await supabase
        .from('workout_sessions')
        .select('id')
        .in('id', workoutSessionSubmissionIds);

      if (sessionError) { setError(sessionError.message); setIsLoading(false); return; }
      validWorkoutSessionIds = new Set(((sessionData ?? []) as SessionIdRecord[]).map((session) => session.id));
    }

    const visibleSubmissions = loadedSubmissions.filter((submission) => {
      if (submission.submission_type !== 'workout_session') return true;
      if (!submission.answer_text) return false;
      return validWorkoutSessionIds.has(submission.answer_text);
    });

    const clientIds = Array.from(new Set([
      ...visibleSubmissions.map((submission) => submission.client_id),
      ...loadedBookings.map((booking) => booking.client_id),
    ]));

    if (clientIds.length > 0) {
      const { data: clientData, error: clientError } = await supabase.from('clients').select('id, full_name').in('id', clientIds);
      if (clientError) { setError(clientError.message); setIsLoading(false); return; }
      const clientMap = ((clientData ?? []) as ClientRecord[]).reduce<Record<string, string>>((current, client) => {
        current[client.id] = client.full_name;
        return current;
      }, {});
      setClients(clientMap);
    }

    setSubmissions(visibleSubmissions);
    setCallBookings(loadedBookings);
    setIsLoading(false);
  };

  useEffect(() => { loadActions(); }, []);

  const activeSubmissions = submissions.filter((submission) => submission.review_status !== 'reviewed' && submission.review_status !== 'resolved');
  const workoutReviews = activeSubmissions.filter((submission) => workoutReviewTypes.includes(submission.submission_type));
  const completedSubmissions = submissions
    .filter((submission) => submission.review_status === 'reviewed' || submission.review_status === 'resolved')
    .slice(0, 8);

  const queueCounts = {
    workoutReviews: workoutReviews.length,
    calendarActions: callBookings.length,
    completedActions: completedSubmissions.length,
  };

  const getSubmissionHref = (submission: SubmissionRecord) => {
    if (submission.submission_type === 'workout_session' && submission.answer_text) return `/coach/clients/${submission.client_id}/workout-review/${submission.answer_text}`;
    return `/coach/actions/submissions/${submission.id}`;
  };

  const renderSubmission = (submission: SubmissionRecord) => (
    <Link key={submission.id} href={getSubmissionHref(submission)} className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-sm uppercase text-[#000000]">{formatLabel(submission.submission_type)}</p>
          <p className="mt-1 text-xs text-gray-500">{clients[submission.client_id] || 'Client'} • {formatDateTime(submission.submitted_at)}</p>
          {submission.followup_required && <p className="mt-1 text-xs font-bold uppercase text-[#FA0201]">Follow-up required</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          {submission.answer_value !== null && <span className="text-sm font-bold text-gray-700">{submission.answer_value}/10</span>}
          <Badge variant={getStatusBadgeVariant(submission.review_status) as any}>Review workout</Badge>
        </div>
      </div>
    </Link>
  );

  const renderCompletedSubmission = (submission: SubmissionRecord) => (
    <div key={submission.id} className="rounded-lg border border-gray-200 bg-gray-100 p-4 opacity-80">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-bold text-sm uppercase text-[#000000]">{formatLabel(submission.submission_type)}</p>
          <p className="mt-1 text-xs text-gray-500">{clients[submission.client_id] || 'Client'} • {formatDateTime(submission.submitted_at)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Badge variant={getStatusBadgeVariant(submission.review_status) as any}>{formatLabel(submission.review_status)}</Badge>
          <Link href={getSubmissionHref(submission)} className="rounded-lg border border-black px-3 py-1 text-xs font-bold uppercase text-black hover:bg-black hover:text-white">Edit</Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="ACTION QUEUE" subtitle="Workout reviews only. Call scheduling lives in Calendar." />
      <div className="mt-8 space-y-8">
        {isLoading && <div className="bg-white rounded-lg border border-gray-200 p-8 text-center"><p className="font-semibold text-gray-700">Loading actions...</p></div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4"><p className="font-semibold text-red-700">{error}</p></div>}
        {!isLoading && !error && (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card><p className="text-xs font-bold uppercase text-gray-500">Workout Reviews</p><p className="mt-2 text-3xl font-black text-[#000000]">{queueCounts.workoutReviews}</p></Card>
              <Card><p className="text-xs font-bold uppercase text-gray-500">Calendar Actions</p><p className="mt-2 text-3xl font-black text-[#FA0201]">{queueCounts.calendarActions}</p></Card>
              <Card><p className="text-xs font-bold uppercase text-gray-500">Completed</p><p className="mt-2 text-3xl font-black text-gray-600">{queueCounts.completedActions}</p></Card>
            </section>

            <section>
              <SectionHeader title="COACH CALL REQUESTS" accent />
              <Card className="border-2 border-dashed border-gray-300 bg-gray-50">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-lg font-black uppercase text-[#000000]">{queueCounts.calendarActions} calendar action{queueCounts.calendarActions === 1 ? '' : 's'} need attention</p>
                    <p className="mt-1 text-sm text-gray-600">Call requests and reschedule responses are handled in the Calendar tab.</p>
                  </div>
                  <Link href="/coach/calendar" className="w-fit rounded-lg bg-black px-5 py-3 text-xs font-black uppercase text-white hover:bg-gray-900">
                    Go to calendar
                  </Link>
                </div>
              </Card>
            </section>

            <section>
              <SectionHeader title="WORKOUT REVIEWS" accent />
              <Card>
                {workoutReviews.length === 0 ? <p className="text-sm text-gray-600">No workout reviews right now.</p> : <div className="space-y-3">{workoutReviews.map(renderSubmission)}</div>}
              </Card>
            </section>

            <section>
              <SectionHeader title="COMPLETED ACTIONS" accent />
              <Card>
                {completedSubmissions.length === 0 ? <p className="text-sm text-gray-600">No completed actions yet.</p> : <div className="space-y-3">{completedSubmissions.map(renderCompletedSubmission)}</div>}
              </Card>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
