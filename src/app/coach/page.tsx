'use client';

import type { ReactNode } from 'react';
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

type TrainingProgramRecord = {
  id: string;
  client_id: string;
  status: string;
};

type SessionIdRecord = { id: string };

type DashboardStats = {
  activeClients: number;
  workoutReviews: number;
  calendarActions: number;
  setupGaps: number;
};

const workoutReviewTypes = ['workout_session'];

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
};

const formatDateTime = (value: string) => {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const getStatusBadgeVariant = (status: string) => {
  if (status === 'active') return 'success';
  if (status === 'reviewed' || status === 'resolved') return 'success';
  if (status === 'new' || status === 'needs_feedback' || status === 'needs_action') return 'warning';
  return 'default';
};

const getReviewHref = (review: WorkoutReviewRecord) => {
  if (review.submission_type === 'workout_session' && review.answer_text) return `/coach/clients/${review.client_id}/workout-review/${review.answer_text}`;
  return `/coach/actions/submissions/${review.id}`;
};

const DashboardActionButton = ({ href, children, tone = 'red' }: { href: string; children: ReactNode; tone?: 'red' | 'black' | 'white' }) => {
  const className = tone === 'red'
    ? 'w-fit rounded-lg bg-[#FA0201] px-5 py-3 text-xs font-black uppercase text-white hover:bg-red-700'
    : tone === 'black'
      ? 'w-fit rounded-lg bg-black px-5 py-3 text-xs font-black uppercase text-white hover:bg-gray-900'
      : 'w-fit rounded-lg bg-white px-5 py-3 text-xs font-black uppercase text-[#000000] hover:bg-gray-100';

  return <Link href={href} className={className}>{children}</Link>;
};

const PulseMetric = ({ label, value }: { label: string; value: number | string }) => (
  <div className="rounded-xl border border-white/10 bg-white/10 p-4">
    <p className="text-xs font-black uppercase tracking-wide text-gray-300">{label}</p>
    <p className="mt-2 text-3xl font-black text-white">{value}</p>
  </div>
);

const QuickActionTile = ({ title, helper, href, tone = 'white' }: { title: string; helper: string; href: string; tone?: 'white' | 'red' | 'black' }) => {
  const toneClass = tone === 'red'
    ? 'border-[#FA0201] bg-red-50'
    : tone === 'black'
      ? 'border-black bg-black text-white'
      : 'border-gray-200 bg-white';

  const helperClass = tone === 'black' ? 'text-gray-300' : 'text-gray-600';
  const linkClass = tone === 'black' ? 'text-white' : 'text-[#FA0201]';

  return (
    <Link href={href} className={`block rounded-2xl border-2 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${toneClass}`}>
      <p className="text-lg font-black uppercase tracking-tight">{title}</p>
      <p className={`mt-2 text-sm font-semibold ${helperClass}`}>{helper}</p>
      <p className={`mt-4 text-xs font-black uppercase ${linkClass}`}>Open →</p>
    </Link>
  );
};

export default function CoachDashboard() {
  const [stats, setStats] = useState<DashboardStats>({ activeClients: 0, workoutReviews: 0, calendarActions: 0, setupGaps: 0 });
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [workoutReviews, setWorkoutReviews] = useState<WorkoutReviewRecord[]>([]);
  const [calendarActions, setCalendarActions] = useState<CalendarActionRecord[]>([]);
  const [programmes, setProgrammes] = useState<TrainingProgramRecord[]>([]);
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

      const [activeClientsResult, clientsResult, workoutReviewsResult, calendarActionsResult, programmesResult] = await Promise.all([
        supabase.from('clients').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('clients').select('id, full_name, email, user_id, status, current_focus, next_review_date').order('full_name', { ascending: true }).limit(100),
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
          .limit(10),
        supabase.from('training_programs').select('id, client_id, status').eq('status', 'active').limit(500),
      ]);

      const firstError = activeClientsResult.error || clientsResult.error || workoutReviewsResult.error || calendarActionsResult.error || programmesResult.error;
      if (firstError) {
        setError(firstError.message);
        setIsLoading(false);
        return;
      }

      const loadedClients = (clientsResult.data ?? []) as ClientRecord[];
      const loadedProgrammes = (programmesResult.data ?? []) as TrainingProgramRecord[];
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

      const programmeClientIds = new Set(loadedProgrammes.map((programme) => programme.client_id));
      const setupGapCount = loadedClients.filter((client) => client.status === 'active' && (!client.user_id || !programmeClientIds.has(client.id))).length;

      setClients(loadedClients);
      setProgrammes(loadedProgrammes);
      setWorkoutReviews(visibleWorkoutReviews.slice(0, 10));
      setCalendarActions((calendarActionsResult.data ?? []) as CalendarActionRecord[]);
      setStats({
        activeClients: activeClientsResult.count ?? 0,
        workoutReviews: visibleWorkoutReviews.length,
        calendarActions: (calendarActionsResult.data ?? []).length,
        setupGaps: setupGapCount,
      });
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

  const programmeClientIds = useMemo(() => new Set(programmes.map((programme) => programme.client_id)), [programmes]);
  const setupGapClients = clients.filter((client) => client.status === 'active' && (!client.user_id || !programmeClientIds.has(client.id))).slice(0, 6);
  const activeClients = clients.filter((client) => client.status === 'active').slice(0, 8);

  const nextAction = stats.workoutReviews > 0
    ? { title: 'Review workout submissions', helper: `${stats.workoutReviews} workout review${stats.workoutReviews === 1 ? '' : 's'} waiting.`, href: '/coach/actions', cta: 'Open review queue' }
    : stats.calendarActions > 0
      ? { title: 'Handle calendar requests', helper: `${stats.calendarActions} call scheduling action${stats.calendarActions === 1 ? '' : 's'} waiting.`, href: '/coach/calendar', cta: 'Open calendar' }
      : stats.setupGaps > 0
        ? { title: 'Complete client setup', helper: `${stats.setupGaps} active client${stats.setupGaps === 1 ? '' : 's'} missing account or programme setup.`, href: '/coach/clients', cta: 'Open clients' }
        : { title: 'Delivery queue clear', helper: 'No urgent workout reviews, setup gaps, or calendar requests. Keep monitoring client execution.', href: '/coach/clients', cta: 'View clients' };

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="COACH HUB" subtitle="Delivery command centre for clients, reviews, and programme execution." />

      <div className="mt-8 space-y-8">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        )}

        <Card className="border-2 border-black bg-black text-white">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(380px,0.8fr)] xl:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-gray-400">Today's priority</p>
              <h2 className="mt-3 text-3xl font-black uppercase tracking-tight md:text-4xl">{isLoading ? 'Loading coach hub' : nextAction.title}</h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold text-gray-300">{isLoading ? 'Checking active clients, review queue, calendar requests, and setup gaps.' : nextAction.helper}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <DashboardActionButton href={nextAction.href}>{nextAction.cta}</DashboardActionButton>
                <DashboardActionButton href="/coach/clients" tone="white">View clients</DashboardActionButton>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <PulseMetric label="Active clients" value={isLoading ? '...' : stats.activeClients} />
              <PulseMetric label="Workout reviews" value={isLoading ? '...' : stats.workoutReviews} />
              <PulseMetric label="Calendar" value={isLoading ? '...' : stats.calendarActions} />
              <PulseMetric label="Setup gaps" value={isLoading ? '...' : stats.setupGaps} />
            </div>
          </div>
        </Card>

        {!isLoading && !error && (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <QuickActionTile title="Review queue" helper="Open workout sessions waiting for coach feedback." href="/coach/actions" tone={stats.workoutReviews > 0 ? 'red' : 'white'} />
              <QuickActionTile title="Clients" helper="Open client profiles, plans, graphs, and periodisation." href="/coach/clients" />
              <QuickActionTile title="Calendar" helper="Manage coach call requests and reschedules." href="/coach/calendar" />
              <QuickActionTile title="Library" helper="Edit reusable programme and workout templates." href="/coach/library" tone="black" />
            </section>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
              <section>
                <SectionHeader title="WORKOUT REVIEWS" accent />
                <Card>
                  {workoutReviews.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
                      <p className="text-sm font-black uppercase text-[#000000]">No workout reviews waiting</p>
                      <p className="mt-1 text-sm text-gray-600">Submitted workouts that need review will appear here.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {workoutReviews.slice(0, 5).map((review) => (
                        <Link key={review.id} href={getReviewHref(review)} className="block rounded-xl border border-gray-200 bg-gray-50 p-4 hover:bg-white">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-black uppercase text-[#000000]">{clientNameById[review.client_id] || 'Client'}</p>
                              <p className="mt-1 text-xs font-semibold uppercase text-gray-500">Workout session · {formatDateTime(review.submitted_at)}</p>
                              {review.followup_required && <p className="mt-1 text-xs font-black uppercase text-[#FA0201]">Follow-up required</p>}
                            </div>
                            <Badge variant={getStatusBadgeVariant(review.review_status) as any}>Review workout</Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </Card>
              </section>

              <section>
                <SectionHeader title="DELIVERY STATUS" accent />
                <Card className="space-y-4">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-black uppercase text-[#000000]">Calendar requests</p>
                        <p className="mt-1 text-sm text-gray-600">Call requests and reschedules.</p>
                      </div>
                      <p className="text-3xl font-black text-[#FA0201]">{stats.calendarActions}</p>
                    </div>
                    {calendarActions.length > 0 && (
                      <div className="mt-4 space-y-2 border-t border-gray-200 pt-4">
                        {calendarActions.slice(0, 3).map((action) => (
                          <p key={action.id} className="text-xs font-semibold uppercase text-gray-600">
                            {action.clients?.full_name ?? clientNameById[action.client_id] ?? 'Client'} · {action.status.replaceAll('_', ' ')} · {formatDate(action.created_at)}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-black uppercase text-[#000000]">Setup gaps</p>
                        <p className="mt-1 text-sm text-gray-600">Clients missing account or programme setup.</p>
                      </div>
                      <p className="text-3xl font-black text-[#FA0201]">{stats.setupGaps}</p>
                    </div>
                  </div>
                </Card>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
              <section>
                <SectionHeader title="ACTIVE CLIENTS" accent />
                <Card>
                  {activeClients.length === 0 ? (
                    <p className="text-sm text-gray-600">No active clients yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {activeClients.map((client) => (
                        <Link key={client.id} href={`/coach/clients/${client.id}`} className="block rounded-xl border border-gray-200 bg-gray-50 p-4 hover:bg-white">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-sm font-black uppercase text-[#000000]">{client.full_name}</p>
                              <p className="mt-1 text-xs font-semibold uppercase text-gray-500">{client.current_focus || 'No focus set'}</p>
                            </div>
                            <div className="text-right">
                              <Badge variant={getStatusBadgeVariant(client.status) as any}>{client.status}</Badge>
                              <p className="mt-2 text-xs font-bold uppercase text-gray-500">Review: {formatDate(client.next_review_date)}</p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </Card>
              </section>

              <section>
                <SectionHeader title="SETUP GAPS" accent />
                <Card>
                  {setupGapClients.length === 0 ? (
                    <p className="text-sm text-gray-600">No active client setup gaps.</p>
                  ) : (
                    <div className="space-y-3">
                      {setupGapClients.map((client) => (
                        <div key={client.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-sm font-black uppercase text-[#000000]">{client.full_name}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {!client.user_id && <Badge variant="warning">Account not linked</Badge>}
                                {!programmeClientIds.has(client.id) && <Badge variant="danger">No active programme</Badge>}
                              </div>
                            </div>
                            <Link href={`/coach/clients/${client.id}`} className="text-xs font-black uppercase text-[#FA0201] hover:underline">Open client</Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
