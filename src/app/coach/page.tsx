'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = {
  id: string;
  full_name: string;
  email: string | null;
  user_id: string | null;
  status: string;
  current_focus: string | null;
  next_review_date: string | null;
};

type WorkoutReviewRecord = {
  id: string;
  client_id: string;
  submission_type: string;
  submitted_at: string;
  answer_text: string | null;
  review_status: string;
  followup_required: boolean;
};

type CalendarActionRecord = {
  id: string;
  client_id: string;
  status: string;
  created_at: string;
  clients: { full_name: string } | null;
};

type UpcomingMeetingRecord = {
  id: string;
  client_id: string;
  status: string;
  starts_at: string | null;
  clients: { full_name: string } | null;
};

type SessionIdRecord = { id: string };

const workoutReviewTypes = ['workout_session'];

const formatMeetingTime = (value: string | null) => {
  if (!value) return 'Time not set';

  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  if (isToday) return `Today ${time}`;

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year} ${time}`;
};

const getReviewHref = (review: WorkoutReviewRecord) => {
  if (review.submission_type === 'workout_session' && review.answer_text) return `/coach/clients/${review.client_id}/workout-review/${review.answer_text}`;
  return `/coach/actions/submissions/${review.id}`;
};

const ActionRow = ({ title, count, href }: { title: string; count: number; href: string }) => (
  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <p className="text-lg font-black uppercase text-[#000000]">{title}</p>
        <Badge variant={count > 0 ? 'warning' : 'success'}>{count}</Badge>
      </div>
      <Link href={href} className="w-fit rounded-lg bg-[#FA0201] px-4 py-2 text-xs font-black uppercase text-white hover:bg-red-700">
        Review
      </Link>
    </div>
  </div>
);

export default function CoachDashboard() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [workoutReviews, setWorkoutReviews] = useState<WorkoutReviewRecord[]>([]);
  const [calendarActions, setCalendarActions] = useState<CalendarActionRecord[]>([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState<UpcomingMeetingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const now = new Date().toISOString();

      const [clientsResult, workoutReviewsResult, calendarActionsResult, upcomingMeetingsResult] = await Promise.all([
        supabase
          .from('clients')
          .select('id, full_name, email, user_id, status, current_focus, next_review_date')
          .eq('status', 'active')
          .order('full_name', { ascending: true })
          .limit(100),
        supabase
          .from('task_submissions')
          .select('id, client_id, submission_type, submitted_at, answer_text, review_status, followup_required')
          .in('submission_type', workoutReviewTypes)
          .neq('review_status', 'reviewed')
          .neq('review_status', 'resolved')
          .order('submitted_at', { ascending: false })
          .limit(25),
        supabase
          .from('coach_call_bookings')
          .select('id, client_id, status, created_at, clients(full_name)')
          .in('status', ['requested', 'reschedule_pending'])
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('coach_call_bookings')
          .select('id, client_id, status, starts_at, clients(full_name)')
          .eq('status', 'accepted')
          .not('starts_at', 'is', null)
          .gte('starts_at', now)
          .order('starts_at', { ascending: true })
          .limit(8),
      ]);

      const firstError = clientsResult.error || workoutReviewsResult.error || calendarActionsResult.error || upcomingMeetingsResult.error;
      if (firstError) {
        setError(firstError.message);
        setIsLoading(false);
        return;
      }

      const loadedWorkoutReviews = (workoutReviewsResult.data ?? []) as WorkoutReviewRecord[];
      const workoutSessionIds = loadedWorkoutReviews
        .filter((review) => review.submission_type === 'workout_session' && review.answer_text)
        .map((review) => review.answer_text as string);

      let visibleWorkoutReviews = loadedWorkoutReviews;
      if (workoutSessionIds.length > 0) {
        const { data: sessionData, error: sessionError } = await supabase
          .from('workout_sessions')
          .select('id')
          .in('id', workoutSessionIds);

        if (sessionError) {
          setError(sessionError.message);
          setIsLoading(false);
          return;
        }

        const validSessionIds = new Set(((sessionData ?? []) as SessionIdRecord[]).map((session) => session.id));
        visibleWorkoutReviews = loadedWorkoutReviews.filter((review) => {
          if (review.submission_type !== 'workout_session') return true;
          if (!review.answer_text) return false;
          return validSessionIds.has(review.answer_text);
        });
      }

      setClients((clientsResult.data ?? []) as ClientRecord[]);
      setWorkoutReviews(visibleWorkoutReviews);
      setCalendarActions((calendarActionsResult.data ?? []) as CalendarActionRecord[]);
      setUpcomingMeetings((upcomingMeetingsResult.data ?? []) as UpcomingMeetingRecord[]);
      setIsLoading(false);
    };

    loadDashboard();
  }, []);

  const clientNameById = useMemo(() => {
    return clients.reduce<Record<string, string>>((current, client) => {
      current[client.id] = client.full_name;
      return current;
    }, {});
  }, [clients]);

  const firstReview = workoutReviews[0];
  const firstReviewHref = firstReview ? getReviewHref(firstReview) : '/coach/actions';

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="COACH HUB" subtitle="Review actions, clients, and upcoming meetings." />

      <div className="mt-8 space-y-8">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        )}

        {isLoading ? (
          <Card><p className="font-semibold text-gray-700">Loading coach hub...</p></Card>
        ) : !error && (
          <>
            <section>
              <SectionHeader title="ACTIONS" accent />
              <Card className="space-y-3">
                <ActionRow title="Workout reviews" count={workoutReviews.length} href={firstReviewHref} />
                <ActionRow title="Calendar actions" count={calendarActions.length} href="/coach/calendar" />
              </Card>
            </section>

            <section>
              <SectionHeader title="CLIENTS" accent />
              <Card>
                {clients.length === 0 ? (
                  <p className="text-sm text-gray-600">No active clients yet.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {clients.map((client) => (
                      <Link key={client.id} href={`/coach/clients/${client.id}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4 hover:bg-white">
                        <p className="text-lg font-black uppercase text-[#000000]">{client.full_name}</p>
                        <p className="mt-1 text-xs font-semibold uppercase text-gray-500">{client.current_focus || 'No focus set'}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            <section>
              <SectionHeader title="UPCOMING MEETINGS" accent />
              <Card>
                {upcomingMeetings.length === 0 ? (
                  <p className="text-sm text-gray-600">No upcoming meetings scheduled.</p>
                ) : (
                  <div className="space-y-3">
                    {upcomingMeetings.map((meeting) => (
                      <Link key={meeting.id} href="/coach/calendar" className="block rounded-xl border border-gray-200 bg-gray-50 p-4 hover:bg-white">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <p className="text-lg font-black uppercase text-[#000000]">{meeting.clients?.full_name ?? clientNameById[meeting.client_id] ?? 'Client'}</p>
                          <p className="text-sm font-black uppercase text-[#FA0201]">{formatMeetingTime(meeting.starts_at)}</p>
                        </div>
                      </Link>
                    ))}
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
