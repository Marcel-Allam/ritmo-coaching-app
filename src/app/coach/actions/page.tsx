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
  booking_type: string;
  status: string;
  client_notes: string | null;
  coach_note: string | null;
  starts_at: string | null;
  suggested_starts_at: string | null;
  created_at: string;
  clients: {
    full_name: string;
  } | null;
}

interface ClientRecord {
  id: string;
  full_name: string;
}

interface WorkoutRecord {
  id: string;
  client_id: string;
  title: string;
  scheduled_date: string | null;
  status: string;
}

interface CompletedWorkoutRecord {
  program_workout_id: string;
}

const formatDate = (value: string | null) => {
  if (!value) return 'No due date';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

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

const getSubmissionBadgeLabel = (submission: SubmissionRecord) => {
  if (submission.submission_type === 'weekly_checkin') return 'Review check-in';
  if (submission.submission_type === 'training_availability') return 'Use to schedule';
  if (submission.submission_type === 'workout_session' || submission.submission_type === 'workout_checkin') return 'Review workout';
  if (submission.submission_type === 'nutrition') return 'Review nutrition';
  if (submission.submission_type === 'bodyweight') return 'Review bodyweight';
  if (submission.submission_type === 'key_lift') return 'Review lift';
  return 'Review';
};

const getBookingTitle = (booking: CoachCallBookingRecord) => {
  if (booking.status === 'requested') return 'Coach call request';
  if (booking.status === 'reschedule_pending') return 'Awaiting client reschedule response';
  if (booking.status === 'accepted') return 'Confirmed coach call';
  if (booking.status === 'declined') return 'Declined coach call';
  if (booking.status === 'cancelled') return 'Cancelled coach call';
  if (booking.status === 'completed') return 'Completed coach call';
  return 'Coach call booking';
};

const getBookingTimeLabel = (booking: CoachCallBookingRecord) => {
  if (booking.status === 'reschedule_pending' && booking.suggested_starts_at) return `Proposed ${formatDateTime(booking.suggested_starts_at)}`;
  if (booking.starts_at) return formatDateTime(booking.starts_at);
  return `Requested ${formatDateTime(booking.created_at)}`;
};

const completedBookingStatuses = ['accepted', 'declined', 'cancelled', 'completed'];

export default function CoachActionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [callBookings, setCallBookings] = useState<CoachCallBookingRecord[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [unscheduledWorkouts, setUnscheduledWorkouts] = useState<WorkoutRecord[]>([]);
  const [upcomingWorkouts, setUpcomingWorkouts] = useState<WorkoutRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActions = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const [submissionResult, bookingResult, workoutResult, completedWorkoutResult] = await Promise.all([
      supabase
        .from('task_submissions')
        .select('id, client_id, submission_type, submitted_at, answer_value, answer_text, review_status, followup_required')
        .neq('submission_type', 'coach_call_request')
        .order('submitted_at', { ascending: false })
        .limit(75),
      supabase
        .from('coach_call_bookings')
        .select('id, client_id, booking_type, status, client_notes, coach_note, starts_at, suggested_starts_at, created_at, clients(full_name)')
        .in('status', ['requested', 'reschedule_pending', 'accepted', 'declined', 'cancelled', 'completed'])
        .order('created_at', { ascending: false })
        .limit(75),
      supabase
        .from('program_workouts')
        .select('id, client_id, title, scheduled_date, status')
        .eq('status', 'active')
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .limit(100),
      supabase
        .from('workout_sessions')
        .select('program_workout_id')
        .eq('status', 'completed'),
    ]);

    if (submissionResult.error) {
      setError(submissionResult.error.message);
      setIsLoading(false);
      return;
    }

    if (bookingResult.error) {
      setError(bookingResult.error.message);
      setIsLoading(false);
      return;
    }

    if (workoutResult.error) {
      setError(workoutResult.error.message);
      setIsLoading(false);
      return;
    }

    if (completedWorkoutResult.error) {
      setError(completedWorkoutResult.error.message);
      setIsLoading(false);
      return;
    }

    const loadedSubmissions = (submissionResult.data ?? []) as SubmissionRecord[];
    const loadedBookings = (bookingResult.data ?? []) as CoachCallBookingRecord[];
    const loadedWorkouts = (workoutResult.data ?? []) as WorkoutRecord[];
    const completedWorkoutIds = new Set(
      ((completedWorkoutResult.data ?? []) as CompletedWorkoutRecord[]).map((session) => session.program_workout_id)
    );
    const activeIncompleteWorkouts = loadedWorkouts.filter((workout) => !completedWorkoutIds.has(workout.id));

    const clientIds = Array.from(new Set([
      ...loadedSubmissions.map((submission) => submission.client_id),
      ...loadedBookings.map((booking) => booking.client_id),
      ...activeIncompleteWorkouts.map((workout) => workout.client_id),
    ]));

    if (clientIds.length > 0) {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name')
        .in('id', clientIds);

      if (clientError) {
        setError(clientError.message);
        setIsLoading(false);
        return;
      }

      const clientMap = ((clientData ?? []) as ClientRecord[]).reduce<Record<string, string>>((current, client) => {
        current[client.id] = client.full_name;
        return current;
      }, {});

      setClients(clientMap);
    }

    setSubmissions(loadedSubmissions);
    setCallBookings(loadedBookings);
    setUnscheduledWorkouts(activeIncompleteWorkouts.filter((workout) => !workout.scheduled_date));
    setUpcomingWorkouts(activeIncompleteWorkouts.filter((workout) => workout.scheduled_date).slice(0, 8));
    setIsLoading(false);
  };

  useEffect(() => {
    loadActions();
  }, []);

  const newSubmissions = submissions.filter((submission) => submission.review_status !== 'reviewed' && submission.review_status !== 'resolved');
  const highAttentionSubmissions = newSubmissions.filter((submission) => submission.followup_required || submission.review_status === 'flagged' || submission.review_status === 'needs_action');
  const normalReviewSubmissions = newSubmissions.filter((submission) => !highAttentionSubmissions.some((item) => item.id === submission.id));
  const openCallBookings = callBookings.filter((booking) => booking.status === 'requested' || booking.status === 'reschedule_pending');
  const completedCallBookings = callBookings.filter((booking) => completedBookingStatuses.includes(booking.status));
  const completedSubmissions = submissions.filter((submission) => submission.review_status === 'reviewed' || submission.review_status === 'resolved').slice(0, 6);
  const trainingAvailabilityToSchedule = newSubmissions.filter((submission) => submission.submission_type === 'training_availability');

  const queueCounts = {
    needsReview: newSubmissions.length,
    callRequests: openCallBookings.length,
    scheduling: trainingAvailabilityToSchedule.length + unscheduledWorkouts.length,
    completedActions: completedSubmissions.length + completedCallBookings.length,
  };

  const getSubmissionHref = (submission: SubmissionRecord) => {
    if (submission.submission_type === 'workout_session' && submission.answer_text) {
      return `/coach/clients/${submission.client_id}/workout-history?session=${submission.answer_text}`;
    }

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
          <Badge variant={getStatusBadgeVariant(submission.review_status) as any}>{getSubmissionBadgeLabel(submission)}</Badge>
        </div>
      </div>
    </Link>
  );

  const renderBooking = (booking: CoachCallBookingRecord) => (
    <Link key={booking.id} href={`/coach/actions/bookings/${booking.id}`} className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-sm uppercase text-[#000000]">{getBookingTitle(booking)}</p>
          <p className="mt-1 text-xs text-gray-500">{booking.clients?.full_name ?? clients[booking.client_id] ?? 'Client'} • {getBookingTimeLabel(booking)}</p>
          {booking.client_notes && <p className="mt-2 line-clamp-2 text-sm text-gray-700">{booking.client_notes}</p>}
        </div>
        <Badge variant={getStatusBadgeVariant(booking.status) as any}>{formatLabel(booking.status)}</Badge>
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

  const renderCompletedBooking = (booking: CoachCallBookingRecord) => (
    <div key={booking.id} className="rounded-lg border border-gray-200 bg-gray-100 p-4 opacity-80">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-bold text-sm uppercase text-[#000000]">{getBookingTitle(booking)}</p>
          <p className="mt-1 text-xs text-gray-500">{booking.clients?.full_name ?? clients[booking.client_id] ?? 'Client'} • {getBookingTimeLabel(booking)}</p>
          {booking.client_notes && <p className="mt-2 line-clamp-2 text-sm text-gray-700">{booking.client_notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Badge variant={getStatusBadgeVariant(booking.status) as any}>{formatLabel(booking.status)}</Badge>
          <Link href={`/coach/actions/bookings/${booking.id}`} className="rounded-lg border border-black px-3 py-1 text-xs font-bold uppercase text-black hover:bg-black hover:text-white">Edit</Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="ACTION QUEUE" subtitle="Submissions, call requests, scheduling work, and completed coach decisions." />

      <div className="mt-8 space-y-8">
        {isLoading && <div className="bg-white rounded-lg border border-gray-200 p-8 text-center"><p className="font-semibold text-gray-700">Loading actions...</p></div>}
        {error && <div className="bg-red-50 border border-red-200 rounded-lg p-4"><p className="font-semibold text-red-700">{error}</p></div>}

        {!isLoading && !error && (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <Card><p className="text-xs font-bold uppercase text-gray-500">Needs Review</p><p className="mt-2 text-3xl font-black text-[#000000]">{queueCounts.needsReview}</p></Card>
              <Card><p className="text-xs font-bold uppercase text-gray-500">Call Requests</p><p className="mt-2 text-3xl font-black text-[#FA0201]">{queueCounts.callRequests}</p></Card>
              <Card><p className="text-xs font-bold uppercase text-gray-500">Needs Scheduling</p><p className="mt-2 text-3xl font-black text-[#000000]">{queueCounts.scheduling}</p></Card>
              <Card><p className="text-xs font-bold uppercase text-gray-500">Completed Actions</p><p className="mt-2 text-3xl font-black text-gray-600">{queueCounts.completedActions}</p></Card>
            </section>

            <section>
              <SectionHeader title="COACH CALL REQUESTS" accent />
              <Card>{openCallBookings.length === 0 ? <p className="text-sm text-gray-600">No coach call requests right now.</p> : <div className="space-y-3">{openCallBookings.map(renderBooking)}</div>}</Card>
            </section>

            <section>
              <SectionHeader title="REVIEW & SCHEDULING" accent />
              <Card>
                <div className="space-y-6">
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <h3 className="text-sm font-black uppercase text-[#000000]">High Attention</h3>
                      <Badge variant={highAttentionSubmissions.length > 0 ? 'danger' : 'default'}>{highAttentionSubmissions.length}</Badge>
                    </div>
                    {highAttentionSubmissions.length === 0 ? <p className="text-sm text-gray-600">No high-attention submissions right now.</p> : <div className="space-y-3">{highAttentionSubmissions.map(renderSubmission)}</div>}
                  </div>

                  <div className="border-t border-gray-200 pt-6">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <h3 className="text-sm font-black uppercase text-[#000000]">Needs Review</h3>
                      <Badge>{normalReviewSubmissions.length}</Badge>
                    </div>
                    {normalReviewSubmissions.length === 0 ? <p className="text-sm text-gray-600">No standard submissions need review.</p> : <div className="space-y-3">{normalReviewSubmissions.map(renderSubmission)}</div>}
                  </div>

                  <div className="border-t border-gray-200 pt-6">
                    <div className="mb-3 flex items-center justify-between gap-4">
                      <h3 className="text-sm font-black uppercase text-[#000000]">Needs Scheduling</h3>
                      <Badge>{trainingAvailabilityToSchedule.length + unscheduledWorkouts.length}</Badge>
                    </div>
                    {trainingAvailabilityToSchedule.length === 0 && unscheduledWorkouts.length === 0 ? <p className="text-sm text-gray-600">No scheduling actions needed.</p> : (
                      <div className="space-y-4">
                        {trainingAvailabilityToSchedule.map((submission) => (
                          <Link key={submission.id} href={`/coach/clients/${submission.client_id}/schedule-workouts`} className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
                            <p className="font-bold uppercase text-[#000000]">Schedule workouts from availability</p>
                            <p className="mt-1 text-xs text-gray-500">{clients[submission.client_id] || 'Client'} • Availability submitted {formatDateTime(submission.submitted_at)}</p>
                          </Link>
                        ))}
                        {unscheduledWorkouts.map((workout) => (
                          <Link key={workout.id} href={`/coach/clients/${workout.client_id}/schedule-workouts`} className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
                            <p className="font-bold uppercase text-[#000000]">Unscheduled workout: {workout.title}</p>
                            <p className="mt-1 text-xs text-gray-500">{clients[workout.client_id] || 'Client'} • Needs a training date</p>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </section>

            <section>
              <SectionHeader title="UPCOMING SCHEDULED WORKOUTS" accent />
              <Card>{upcomingWorkouts.length === 0 ? <p className="text-sm text-gray-600">No upcoming scheduled workouts.</p> : <div className="space-y-3">{upcomingWorkouts.map((workout) => <Link key={workout.id} href={`/coach/clients/${workout.client_id}/current-workouts`} className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50"><p className="font-bold uppercase text-[#000000]">{workout.title}</p><p className="mt-1 text-xs text-gray-500">{clients[workout.client_id] || 'Client'} • {formatDate(workout.scheduled_date)}</p></Link>)}</div>}</Card>
            </section>

            <section>
              <SectionHeader title="COMPLETED ACTIONS" accent />
              <Card>
                {completedSubmissions.length === 0 && completedCallBookings.length === 0 ? (
                  <p className="text-sm text-gray-600">No completed actions yet.</p>
                ) : (
                  <div className="space-y-3">
                    {completedCallBookings.map(renderCompletedBooking)}
                    {completedSubmissions.map(renderCompletedSubmission)}
                  </div>
                )}
              </Card>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
