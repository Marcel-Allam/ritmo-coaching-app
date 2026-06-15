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
  user_id: string | null;
  status: string;
  start_date: string | null;
  current_focus: string | null;
  next_review_date: string | null;
  next_call_date: string | null;
  private_coach_notes: string | null;
};

type WorkoutSessionRecord = {
  id: string;
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

type FeedbackNoteRecord = {
  id: string;
  feedback_date: string;
  main_focus: string | null;
  agreed_action: string | null;
  client_visible: boolean;
  created_at: string;
};

type BodyweightEntryRecord = {
  id: string;
  entry_date: string;
  submitted_at: string;
  bodyweight_kg: number;
};

type RiskSignal = {
  id: string;
  severity: 'high' | 'medium' | 'low' | 'positive';
  title: string;
  detail: string;
  action: string;
  href: string | null;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const daysSince = (value: string | null) => {
  if (!value) return null;

  const now = new Date();
  const date = new Date(value);
  const diff = now.getTime() - date.getTime();
  return Math.max(Math.floor(diff / (1000 * 60 * 60 * 24)), 0);
};

const daysUntil = (value: string | null) => {
  if (!value) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(value);
  date.setHours(0, 0, 0, 0);

  const diff = date.getTime() - today.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const getSignalStyle = (severity: RiskSignal['severity']) => {
  switch (severity) {
    case 'high':
      return 'border-red-200 bg-red-50 text-red-800';
    case 'medium':
      return 'border-yellow-200 bg-yellow-50 text-yellow-900';
    case 'low':
      return 'border-gray-200 bg-gray-50 text-gray-800';
    case 'positive':
      return 'border-green-200 bg-green-50 text-green-800';
    default:
      return 'border-gray-200 bg-gray-50 text-gray-800';
  }
};

const getRiskScore = (signals: RiskSignal[]) => {
  const score = signals.reduce((total, signal) => {
    if (signal.severity === 'high') return total + 25;
    if (signal.severity === 'medium') return total + 15;
    if (signal.severity === 'low') return total + 6;
    if (signal.severity === 'positive') return total - 8;
    return total;
  }, 0);

  return Math.max(0, Math.min(score, 100));
};

const getRiskBand = (score: number) => {
  if (score >= 70) return { label: 'High risk', className: 'bg-red-100 text-red-800' };
  if (score >= 40) return { label: 'Medium risk', className: 'bg-yellow-100 text-yellow-900' };
  return { label: 'Stable', className: 'bg-green-100 text-green-800' };
};

const MetricCard = ({ label, value, helper }: { label: string; value: string | number; helper: string }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-black text-[#000000]">{value}</p>
    <p className="mt-1 text-xs font-semibold text-gray-600">{helper}</p>
  </div>
);

const FutureRiskCard = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4">
    <p className="text-sm font-bold uppercase text-[#000000]">{title}</p>
    <p className="mt-1 text-xs text-gray-600">{description}</p>
    <p className="mt-3 inline-block rounded bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">Future risk input</p>
  </div>
);

export default function ClientRiskSignalsPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutSessionRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [feedbackNotes, setFeedbackNotes] = useState<FeedbackNoteRecord[]>([]);
  const [bodyweights, setBodyweights] = useState<BodyweightEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadRiskSignals = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const [clientResult, workoutsResult, submissionsResult, feedbackResult, bodyweightResult] = await Promise.all([
        supabase
          .from('clients')
          .select('id, full_name, email, user_id, status, start_date, current_focus, next_review_date, next_call_date, private_coach_notes')
          .eq('id', clientId)
          .single(),
        supabase
          .from('workout_sessions')
          .select('id, started_at, completed_at, status, review_status')
          .eq('client_id', clientId)
          .order('started_at', { ascending: false })
          .limit(50),
        supabase
          .from('task_submissions')
          .select('id, submitted_at, submission_type, review_status, followup_required')
          .eq('client_id', clientId)
          .order('submitted_at', { ascending: false })
          .limit(50),
        supabase
          .from('feedback_notes')
          .select('id, feedback_date, main_focus, agreed_action, client_visible, created_at')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('bodyweight_entries')
          .select('id, entry_date, submitted_at, bodyweight_kg')
          .eq('client_id', clientId)
          .order('entry_date', { ascending: false })
          .limit(20),
      ]);

      if (clientResult.error || !clientResult.data) {
        setError(clientResult.error?.message || 'Client not found.');
        setLoading(false);
        return;
      }

      if (workoutsResult.error) {
        setError(workoutsResult.error.message);
        setLoading(false);
        return;
      }

      if (submissionsResult.error) {
        setError(submissionsResult.error.message);
        setLoading(false);
        return;
      }

      if (feedbackResult.error) {
        setError(feedbackResult.error.message);
        setLoading(false);
        return;
      }

      if (bodyweightResult.error) {
        setError(bodyweightResult.error.message);
        setLoading(false);
        return;
      }

      setClient(clientResult.data as ClientRecord);
      setWorkouts((workoutsResult.data ?? []) as WorkoutSessionRecord[]);
      setSubmissions((submissionsResult.data ?? []) as SubmissionRecord[]);
      setFeedbackNotes((feedbackResult.data ?? []) as FeedbackNoteRecord[]);
      setBodyweights((bodyweightResult.data ?? []) as BodyweightEntryRecord[]);
      setLoading(false);
    };

    loadRiskSignals();
  }, [clientId]);

  const latestCompletedWorkout = workouts.find((workout) => workout.status === 'completed') ?? null;
  const latestSubmission = submissions[0] ?? null;
  const latestFeedback = feedbackNotes[0] ?? null;
  const latestBodyweight = bodyweights[0] ?? null;

  const openReviews = submissions.filter((submission) => submission.review_status !== 'reviewed');
  const followups = submissions.filter((submission) => submission.followup_required);
  const unreviewedWorkouts = workouts.filter((workout) => workout.review_status !== 'reviewed');

  const daysSinceWorkout = daysSince(latestCompletedWorkout?.completed_at || latestCompletedWorkout?.started_at || null);
  const daysSinceSubmission = daysSince(latestSubmission?.submitted_at || null);
  const daysSinceFeedback = daysSince(latestFeedback?.created_at || latestFeedback?.feedback_date || null);
  const daysSinceBodyweight = daysSince(latestBodyweight?.submitted_at || latestBodyweight?.entry_date || null);
  const daysToReview = daysUntil(client?.next_review_date || null);

  const riskSignals = useMemo<RiskSignal[]>(() => {
    if (!client) return [];

    const signals: RiskSignal[] = [];

    if (!client.user_id) {
      signals.push({
        id: 'account-not-linked',
        severity: 'high',
        title: 'Client account not linked',
        detail: 'The client has not created or linked their app account yet.',
        action: 'Send or resend the invite link.',
        href: `/coach/clients/${clientId}`,
      });
    }

    if (daysSinceWorkout === null) {
      signals.push({
        id: 'no-workout-yet',
        severity: 'medium',
        title: 'No completed workouts logged',
        detail: 'There is no completed workout session for this client yet.',
        action: 'Assign and schedule the first workout.',
        href: `/coach/clients/${clientId}/training`,
      });
    } else if (daysSinceWorkout >= 14) {
      signals.push({
        id: 'workout-gap-high',
        severity: 'high',
        title: 'Long gap since completed workout',
        detail: `Last completed workout was ${daysSinceWorkout} days ago.`,
        action: 'Check adherence and schedule the next training session.',
        href: `/coach/clients/${clientId}/adherence`,
      });
    } else if (daysSinceWorkout >= 7) {
      signals.push({
        id: 'workout-gap-medium',
        severity: 'medium',
        title: 'Workout gap needs attention',
        detail: `Last completed workout was ${daysSinceWorkout} days ago.`,
        action: 'Review recent adherence and upcoming schedule.',
        href: `/coach/clients/${clientId}/adherence`,
      });
    } else {
      signals.push({
        id: 'recent-training-positive',
        severity: 'positive',
        title: 'Recent training activity',
        detail: `Last completed workout was ${daysSinceWorkout} days ago.`,
        action: 'Keep current training momentum moving.',
        href: `/coach/clients/${clientId}/progress`,
      });
    }

    if (openReviews.length >= 5) {
      signals.push({
        id: 'open-reviews-high',
        severity: 'high',
        title: 'Review backlog is high',
        detail: `${openReviews.length} submissions are still not reviewed.`,
        action: 'Clear review backlog from the action tab.',
        href: '/coach/actions',
      });
    } else if (openReviews.length > 0) {
      signals.push({
        id: 'open-reviews-medium',
        severity: 'medium',
        title: 'Open reviews need coach action',
        detail: `${openReviews.length} submissions are waiting for review.`,
        action: 'Review and close the outstanding items.',
        href: '/coach/actions',
      });
    }

    if (followups.length > 0) {
      signals.push({
        id: 'followups',
        severity: 'medium',
        title: 'Follow-up required',
        detail: `${followups.length} submissions are marked as follow-up required.`,
        action: 'Send feedback or agree the next action.',
        href: '/coach/actions',
      });
    }

    if (unreviewedWorkouts.length >= 3) {
      signals.push({
        id: 'workout-review-backlog',
        severity: 'medium',
        title: 'Workout reviews are building up',
        detail: `${unreviewedWorkouts.length} workout sessions are not marked reviewed.`,
        action: 'Open workout history and mark reviewed after feedback.',
        href: `/coach/clients/${clientId}/workout-history`,
      });
    }

    if (daysSinceFeedback === null) {
      signals.push({
        id: 'no-feedback',
        severity: 'medium',
        title: 'No feedback sent yet',
        detail: 'There are no feedback notes recorded for this client.',
        action: 'Send the first feedback note after a review.',
        href: `/coach/clients/${clientId}/workout-history`,
      });
    } else if (daysSinceFeedback >= 14) {
      signals.push({
        id: 'feedback-gap',
        severity: 'medium',
        title: 'Feedback gap',
        detail: `Last recorded feedback was ${daysSinceFeedback} days ago.`,
        action: 'Send a short check-in or update the current focus.',
        href: `/coach/feedback`,
      });
    } else {
      signals.push({
        id: 'recent-feedback-positive',
        severity: 'positive',
        title: 'Recent feedback recorded',
        detail: `Last feedback was ${daysSinceFeedback} days ago.`,
        action: 'Keep feedback cadence consistent.',
        href: `/coach/feedback`,
      });
    }

    if (daysSinceBodyweight === null) {
      signals.push({
        id: 'no-bodyweight',
        severity: 'low',
        title: 'No bodyweight entries',
        detail: 'Bodyweight context is missing for this client.',
        action: 'Assign or remind bodyweight logging if relevant.',
        href: `/coach/clients/${clientId}/bodyweight`,
      });
    } else if (daysSinceBodyweight >= 14) {
      signals.push({
        id: 'bodyweight-gap',
        severity: 'low',
        title: 'Bodyweight logging gap',
        detail: `Last bodyweight entry was ${daysSinceBodyweight} days ago.`,
        action: 'Ask for a new bodyweight log before adjusting nutrition.',
        href: `/coach/clients/${clientId}/bodyweight`,
      });
    }

    if (daysToReview !== null && daysToReview < 0) {
      signals.push({
        id: 'review-overdue',
        severity: 'high',
        title: 'Review date overdue',
        detail: `Next review date was due ${Math.abs(daysToReview)} days ago.`,
        action: 'Book or complete the client review.',
        href: `/coach/clients/${clientId}`,
      });
    } else if (daysToReview !== null && daysToReview <= 3) {
      signals.push({
        id: 'review-soon',
        severity: 'medium',
        title: 'Review due soon',
        detail: `Next review is due in ${daysToReview} day${daysToReview === 1 ? '' : 's'}.`,
        action: 'Prepare the review notes and next block decision.',
        href: `/coach/clients/${clientId}`,
      });
    }

    return signals;
  }, [client, clientId, daysSinceWorkout, daysSinceFeedback, daysSinceBodyweight, daysToReview, openReviews.length, followups.length, unreviewedWorkouts.length]);

  const riskScore = getRiskScore(riskSignals);
  const riskBand = getRiskBand(riskScore);
  const highSignals = riskSignals.filter((signal) => signal.severity === 'high').length;
  const mediumSignals = riskSignals.filter((signal) => signal.severity === 'medium').length;
  const positiveSignals = riskSignals.filter((signal) => signal.severity === 'positive').length;

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading risk signals...</Card></div>;
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
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Risk Signals</h1>
          <p className="mt-1 text-sm text-gray-700">{client.full_name}{client.email ? ` • ${client.email}` : ''}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-gray-500">Current focus: {client.current_focus || 'Not set'}</p>
        </div>
        <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">
          Back to client
        </Link>
      </div>

      <section>
        <SectionHeader title="RISK SNAPSHOT" accent />
        <Card>
          <div className="mb-5 rounded-xl bg-black p-5 text-white">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-gray-400">Current risk score</p>
                <p className="mt-2 text-5xl font-black">{riskScore}/100</p>
              </div>
              <span className={`w-fit rounded-full px-4 py-2 text-sm font-bold uppercase ${riskBand.className}`}>
                {riskBand.label}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <MetricCard label="High signals" value={highSignals} helper="Needs fast attention" />
            <MetricCard label="Medium signals" value={mediumSignals} helper="Watch and resolve" />
            <MetricCard label="Positive signals" value={positiveSignals} helper="Momentum indicators" />
            <MetricCard label="Next review" value={formatDate(client.next_review_date)} helper="Review scheduling anchor" />
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="COACH ATTENTION SIGNALS" accent />
        <Card>
          {riskSignals.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-sm font-semibold text-gray-700">No risk signals found.</p>
              <p className="mt-2 text-xs text-gray-500">This client currently has no obvious review, adherence, feedback, or logging gaps.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {riskSignals.map((signal) => {
                const card = (
                  <div className={`rounded-xl border p-4 ${getSignalStyle(signal.severity)}`}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black uppercase">{signal.title}</p>
                          <Badge variant={signal.severity === 'positive' ? 'success' : signal.severity === 'high' ? 'warning' : 'default'}>
                            {signal.severity}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm">{signal.detail}</p>
                        <p className="mt-2 text-xs font-bold uppercase">Action: {signal.action}</p>
                      </div>
                      {signal.href && <p className="text-xs font-bold uppercase">Open</p>}
                    </div>
                  </div>
                );

                if (!signal.href) return <div key={signal.id}>{card}</div>;

                return (
                  <Link key={signal.id} href={signal.href} className="block">
                    {card}
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader title="FUTURE RETENTION INTELLIGENCE" accent />
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <FutureRiskCard
              title="Payment risk"
              description="Combine missed payments, renewal dates, and contract status once payments are added."
            />
            <FutureRiskCard
              title="Client sentiment"
              description="Track check-in tone, frustration, confidence, and subjective buy-in over time."
            />
            <FutureRiskCard
              title="Churn prediction"
              description="Predict risk from missed sessions, late check-ins, low feedback response, and trend stagnation."
            />
            <FutureRiskCard
              title="Save plan"
              description="Generate a suggested intervention: call, deload, reset goals, testimonial request, or renewal pitch."
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
