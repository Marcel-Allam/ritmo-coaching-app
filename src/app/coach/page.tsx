'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/ui/stat-card';
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

type DashboardStats = {
  activeClients: number;
  workoutReviews: number;
  calendarActions: number;
  setupGaps: number;
};

const workoutReviewTypes = ['workout_session', 'workout_checkin'];

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

const getStatusBadgeVariant = (status: string) => (status === 'active' ? 'success' : 'warning');

const getReviewHref = (review: WorkoutReviewRecord) => {
  if (review.submission_type === 'workout_session' && review.answer_text) return `/coach/clients/${review.client_id}/workout-review/${review.answer_text}`;
  return `/coach/actions/submissions/${review.id}`;
};

const DashboardActionButton = ({ href, children, tone = 'red' }: { href: string; children: React.ReactNode; tone?: 'red' | 'black' }) => (
  <Link
    href={href}
    className={tone === 'red'
      ? 'w-fit rounded-lg bg-[#FA0201] px-5 py-3 text-xs font-black uppercase text-white hover:bg-red-700'
      : 'w-fit rounded-lg bg-black px-5 py-3 text-xs font-black uppercase text-white hover:bg-gray-900'}
  >
    {children}
  </Link>
);

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
          .limit(10),
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
      const programmeClientIds = new Set(loadedProgrammes.map((programme) => programme.client_id));
      const setupGapCount = loadedClients.filter((client) => client.status === 'active' && (!client.user_id || !programmeClientIds.has(client.id))).length;

      setClients(loadedClients);
      setProgrammes(loadedProgrammes);
      setWorkoutReviews((workoutReviewsResult.data ?? []) as WorkoutReviewRecord[]);
      setCalendarActions((calendarActionsResult.data ?? []) as CalendarActionRecord[]);
      setStats({
        activeClients: activeClientsResult.count ?? 0,
        workoutReviews: (workoutReviewsResult.data ?? []).length,
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
  const activeClients = clients.filter((client) => client.status === 'active').slice(0, 6);

  const nextAction = stats.workoutReviews > 0
    ? { title: 'Review workout submissions', helper: `${stats.workoutReviews} workout review${stats.workoutReviews === 1 ? '' : 's'} waiting.`, href: '/coach/actions', cta: 'Open actions' }
    : stats.calendarActions > 0
      ? { title: 'Handle calendar requests', helper: `${stats.calendarActions} call scheduling action${stats.calendarActions === 1 ? '' : 's'} waiting.`, href: '/coach/calendar', cta: 'Open calendar' }
      : stats.setupGaps > 0
        ? { title: 'Complete client setup', helper: `${stats.setupGaps} active client${stats.setupGaps === 1 ? '' : 's'} missing account or programme setup.`, href: '/coach/clients', cta: 'Open clients' }
        : { title: 'No urgent coach actions', helper: 'Your delivery queue is clear. Monitor clients and update plans when needed.', href: '/coach/clients', cta: 'View clients' };

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="DASHBOARD" subtitle="Coach command centre for RITMO delivery." />

      <div className="mt-8 space-y-8">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        )}

        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Active Clients" value={isLoading ? '...' : stats.activeClients} dark />
          <StatCard label="Workout Reviews" value={isLoading ? '...' : stats.workoutReviews} />
          <StatCard label="Calendar Actions" value={isLoading ? '...' : stats.calendarActions} dark />
          <StatCard label="Setup Gaps" value={isLoading ? '...' : stats.setupGaps} />
        </section>

        {!isLoading && !error && (
          <>
            <Card className="border-2 border-black bg-black text-white">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-gray-400">Next action</p>
                  <h2 className="mt-2 text-2xl font-black uppercase tracking-tight">{nextAction.title}</h2>
                  <p className="mt-2 text-sm font-semibold text-gray-300">{nextAction.helper}</p>
                </div>
                <DashboardActionButton href={nextAction.href}>{nextAction.cta}</DashboardActionButton>
              </div>
            </Card>

            <section>
              <SectionHeader title="WORKOUT REVIEW QUEUE" accent />
              <Card>
                {workoutReviews.length === 0 ? (
                  <p className="text-sm text-gray-600">No workout reviews waiting.</p>
                ) : (
                  <div className="space-y-3">
                    {workoutReviews.map((review) => (
                      <Link key={review.id} href={getReviewHref(review)} className="block rounded-xl border border-gray-200 bg-gray-50 p-4 hover:bg-white">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-sm font-black uppercase text-[#000000]">{clientNameById[review.client_id] || 'Client'}</p>
                            <p className="mt-1 text-xs font-semibold uppercase text-gray-500">{review.submission_type.replaceAll('_', ' ')} · {formatDateTime(review.submitted_at)}</p>
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

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
              <section>
                <SectionHeader title="CALENDAR SUMMARY" accent />
                <Card className="border-2 border-dashed border-gray-300 bg-gray-50">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-lg font-black uppercase text-[#000000]">{stats.calendarActions} calendar action{stats.calendarActions === 1 ? '' : 's'}</p>
                      <p className="mt-1 text-sm text-gray-600">Call requests and reschedule responses live in Calendar.</p>
                    </div>
                    <DashboardActionButton href="/coach/calendar" tone="black">Go to calendar</DashboardActionButton>
                  </div>
                  {calendarActions.length > 0 && (
                    <div className="mt-5 space-y-2 border-t border-gray-200 pt-4">
                      {calendarActions.slice(0, 3).map((action) => (
                        <p key={action.id} className="text-xs font-semibold uppercase text-gray-600">
                          {action.clients?.full_name ?? clientNameById[action.client_id] ?? 'Client'} · {action.status.replaceAll('_', ' ')} · {formatDate(action.created_at)}
                        </p>
                      ))}
                    </div>
                  )}
                </Card>
              </section>

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
                            <p className="text-xs font-bold uppercase text-gray-500">Review: {formatDate(client.next_review_date)}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </Card>
              </section>
            </div>

            <section>
              <SectionHeader title="SETUP GAPS" accent />
              <Card>
                {setupGapClients.length === 0 ? (
                  <p className="text-sm text-gray-600">No active client setup gaps.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
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
          </>
        )}
      </div>
    </div>
  );
}
