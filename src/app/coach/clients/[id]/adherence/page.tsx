'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = {
  id: string;
  full_name: string;
  email: string | null;
  current_focus: string | null;
};

type ProgramWorkoutRecord = {
  id: string;
  scheduled_date: string | null;
  status: string;
};

type WorkoutSessionRecord = {
  id: string;
  program_workout_id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  review_status: string;
};

type SubmissionRecord = {
  id: string;
  submitted_at: string;
  submission_type: string;
  review_status: string;
  followup_required: boolean;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const getThirtyDayWindow = () => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setDate(end.getDate() - 29);
  start.setHours(0, 0, 0, 0);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    startTimestamp: start.toISOString(),
    endTimestamp: end.toISOString(),
  };
};

const getPercentage = (completed: number, total: number) => {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
};

const getSignal = (percentage: number) => {
  if (percentage >= 85) return { label: 'Strong', className: 'bg-green-100 text-green-800' };
  if (percentage >= 65) return { label: 'Watch', className: 'bg-yellow-100 text-yellow-900' };
  return { label: 'At risk', className: 'bg-red-100 text-red-800' };
};

const MetricCard = ({
  label,
  value,
  helper,
  signal,
}: {
  label: string;
  value: string | number;
  helper: string;
  signal?: string;
}) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <div className="flex items-start justify-between gap-3">
      <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
      {signal && <span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-700">{signal}</span>}
    </div>
    <p className="mt-2 text-3xl font-black text-[#000000]">{value}</p>
    <p className="mt-1 text-xs font-semibold text-gray-600">{helper}</p>
  </div>
);

const BarMeter = ({ label, percentage }: { label: string; percentage: number }) => {
  const signal = getSignal(percentage);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-sm font-bold uppercase text-[#000000]">{label}</p>
        <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${signal.className}`}>{signal.label}</span>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-[#FA0201]" style={{ width: `${Math.min(percentage, 100)}%` }} />
      </div>
      <p className="mt-2 text-sm font-black text-[#000000]">{percentage}%</p>
    </div>
  );
};

const FutureAdherenceCard = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4">
    <p className="text-sm font-bold uppercase text-[#000000]">{title}</p>
    <p className="mt-1 text-xs text-gray-600">{description}</p>
    <p className="mt-3 inline-block rounded bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">Future signal</p>
  </div>
);

export default function ClientAdherencePage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [scheduledWorkouts, setScheduledWorkouts] = useState<ProgramWorkoutRecord[]>([]);
  const [sessions, setSessions] = useState<WorkoutSessionRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAdherence = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const windowRange = getThirtyDayWindow();
      const supabase = createClient();

      const [clientResult, scheduledResult, sessionsResult, submissionsResult] = await Promise.all([
        supabase
          .from('clients')
          .select('id, full_name, email, current_focus')
          .eq('id', clientId)
          .single(),
        supabase
          .from('program_workouts')
          .select('id, scheduled_date, status')
          .eq('client_id', clientId)
          .neq('status', 'archived')
          .not('scheduled_date', 'is', null)
          .gte('scheduled_date', windowRange.startDate)
          .lte('scheduled_date', windowRange.endDate)
          .order('scheduled_date', { ascending: false }),
        supabase
          .from('workout_sessions')
          .select('id, program_workout_id, started_at, completed_at, status, review_status')
          .eq('client_id', clientId)
          .gte('started_at', windowRange.startTimestamp)
          .lte('started_at', windowRange.endTimestamp)
          .order('started_at', { ascending: false }),
        supabase
          .from('task_submissions')
          .select('id, submitted_at, submission_type, review_status, followup_required')
          .eq('client_id', clientId)
          .gte('submitted_at', windowRange.startTimestamp)
          .lte('submitted_at', windowRange.endTimestamp)
          .order('submitted_at', { ascending: false }),
      ]);

      if (clientResult.error || !clientResult.data) {
        setError(clientResult.error?.message || 'Client not found.');
        setLoading(false);
        return;
      }

      if (scheduledResult.error) {
        setError(scheduledResult.error.message);
        setLoading(false);
        return;
      }

      if (sessionsResult.error) {
        setError(sessionsResult.error.message);
        setLoading(false);
        return;
      }

      if (submissionsResult.error) {
        setError(submissionsResult.error.message);
        setLoading(false);
        return;
      }

      setClient(clientResult.data as ClientRecord);
      setScheduledWorkouts((scheduledResult.data ?? []) as ProgramWorkoutRecord[]);
      setSessions((sessionsResult.data ?? []) as WorkoutSessionRecord[]);
      setSubmissions((submissionsResult.data ?? []) as SubmissionRecord[]);
      setLoading(false);
    };

    loadAdherence();
  }, [clientId]);

  const windowRange = getThirtyDayWindow();

  const completedSessions = sessions.filter((session) => session.status === 'completed');
  const completedWorkoutIds = new Set(completedSessions.map((session) => session.program_workout_id));
  const scheduledCompleted = scheduledWorkouts.filter((workout) => completedWorkoutIds.has(workout.id));
  const missedOrUnlogged = scheduledWorkouts.filter((workout) => !completedWorkoutIds.has(workout.id));
  const workoutAdherence = getPercentage(scheduledCompleted.length, scheduledWorkouts.length);

  const nonWorkoutSubmissions = submissions.filter((submission) => submission.submission_type !== 'workout_session');
  const reviewedSubmissions = submissions.filter((submission) => submission.review_status === 'reviewed');
  const openReviews = submissions.filter((submission) => submission.review_status !== 'reviewed');
  const followups = submissions.filter((submission) => submission.followup_required);
  const reviewCompletion = getPercentage(reviewedSubmissions.length, submissions.length);

  const recentSignals = useMemo(() => {
    const workoutSignals = missedOrUnlogged.slice(0, 5).map((workout) => ({
      id: `missed-${workout.id}`,
      title: 'Workout not completed yet',
      detail: `Scheduled for ${formatDate(workout.scheduled_date)}.`,
      status: 'watch',
    }));

    const reviewSignals = openReviews.slice(0, 5).map((submission) => ({
      id: `review-${submission.id}`,
      title: `${submission.submission_type.replaceAll('_', ' ')} needs review`,
      detail: `Submitted ${formatDate(submission.submitted_at)}.`,
      status: submission.followup_required ? 'follow-up' : 'review',
    }));

    return [...workoutSignals, ...reviewSignals].slice(0, 8);
  }, [missedOrUnlogged, openReviews]);

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading adherence tracking...</Card></div>;
  }

  if (error || !client) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <p className="text-sm font-semibold text-red-700">{error || 'Client not found.'}</p>
          <Link href={`/coach/clients/${clientId}`} className="mt-4 inline-block text-sm font-bold uppercase text-[#FA0201] hover:underline">
            Back to client
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Adherence Tracking</h1>
          <p className="mt-1 text-sm text-gray-700">{client.full_name}{client.email ? ` • ${client.email}` : ''}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-gray-500">{formatDate(windowRange.startDate)} → {formatDate(windowRange.endDate)}</p>
        </div>
        <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">
          Back to client
        </Link>
      </div>

      <section>
        <SectionHeader title="ADHERENCE SNAPSHOT" accent />
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <MetricCard
              label="Workout adherence"
              value={`${workoutAdherence}%`}
              helper={`${scheduledCompleted.length}/${scheduledWorkouts.length} scheduled completed`}
              signal="30 days"
            />
            <MetricCard
              label="Completed sessions"
              value={completedSessions.length}
              helper="Workout sessions logged"
              signal="training"
            />
            <MetricCard
              label="Submissions"
              value={nonWorkoutSubmissions.length}
              helper="Non-workout client submissions"
              signal="check-ins"
            />
            <MetricCard
              label="Open reviews"
              value={openReviews.length}
              helper={`${followups.length} marked follow-up`}
              signal="coach"
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <BarMeter label="Workout completion" percentage={workoutAdherence} />
            <BarMeter label="Review completion" percentage={reviewCompletion} />
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="COACH SIGNALS" accent />
        <Card>
          {recentSignals.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-sm font-semibold text-gray-700">No major adherence flags in this window.</p>
              <p className="mt-2 text-xs text-gray-500">Scheduled workouts, reviews, and follow-up submissions will appear here when action is needed.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSignals.map((signal) => (
                <div key={signal.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-bold uppercase text-[#000000]">{signal.title}</p>
                      <p className="mt-1 text-sm text-gray-600">{signal.detail}</p>
                    </div>
                    <Badge variant={signal.status === 'follow-up' ? 'warning' : 'default'}>{signal.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader title="FUTURE ADHERENCE INTELLIGENCE" accent />
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <FutureAdherenceCard
              title="Streak detection"
              description="Automatically show workout, check-in, and nutrition streaks with broken-streak alerts."
            />
            <FutureAdherenceCard
              title="Missed-session patterns"
              description="Spot repeated missed days, missed session types, and common adherence weak points."
            />
            <FutureAdherenceCard
              title="Pain-adjusted adherence"
              description="Separate low adherence from intentional deloads or pain-modified training weeks."
            />
            <FutureAdherenceCard
              title="Client risk score"
              description="Combine missed workouts, slow feedback response, low check-in frequency, and poor trend changes."
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
