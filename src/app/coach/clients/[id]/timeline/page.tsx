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

type WorkoutSessionRecord = {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  review_status: string;
  client_notes: string | null;
  coach_note: string | null;
};

type BodyweightEntryRecord = {
  id: string;
  entry_date: string;
  submitted_at: string;
  bodyweight_kg: number;
  notes: string | null;
};

type FeedbackNoteRecord = {
  id: string;
  feedback_date: string;
  main_win: string | null;
  main_focus: string | null;
  agreed_action: string | null;
  plan_change: string | null;
  next_review_date: string | null;
  client_visible: boolean;
  created_at: string;
};

type SubmissionRecord = {
  id: string;
  submitted_at: string;
  submission_type: string;
  answer_value: number | null;
  answer_text: string | null;
  review_status: string;
  followup_required: boolean;
  coach_note: string | null;
};

type TimelineType = 'workout' | 'bodyweight' | 'feedback' | 'submission';

type TimelineItem = {
  id: string;
  type: TimelineType;
  date: string;
  title: string;
  subtitle: string;
  detail: string | null;
  status: string | null;
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

const formatDateTime = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const normaliseSubmissionType = (value: string) => value.replaceAll('_', ' ');

const getTypeLabel = (type: TimelineType) => {
  switch (type) {
    case 'workout':
      return 'Workout';
    case 'bodyweight':
      return 'Bodyweight';
    case 'feedback':
      return 'Feedback';
    case 'submission':
      return 'Submission';
    default:
      return 'Event';
  }
};

const getTypeAccent = (type: TimelineType) => {
  switch (type) {
    case 'workout':
      return 'bg-black text-white';
    case 'bodyweight':
      return 'bg-[#FA0201] text-white';
    case 'feedback':
      return 'bg-white text-black border border-gray-300';
    case 'submission':
      return 'bg-gray-100 text-black border border-gray-300';
    default:
      return 'bg-gray-100 text-black border border-gray-300';
  }
};

const MetricCard = ({ label, value, helper }: { label: string; value: string | number; helper: string }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-black text-[#000000]">{value}</p>
    <p className="mt-1 text-xs font-semibold text-gray-600">{helper}</p>
  </div>
);

const FutureTimelineCard = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4">
    <p className="text-sm font-bold uppercase text-[#000000]">{title}</p>
    <p className="mt-1 text-xs text-gray-600">{description}</p>
    <p className="mt-3 inline-block rounded bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">Future timeline flag</p>
  </div>
);

const TimelineCard = ({ item }: { item: TimelineItem }) => {
  const content = (
    <div className="rounded-xl border border-gray-200 bg-white p-4 transition hover:border-[#FA0201] hover:shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <div className={`flex h-11 min-w-11 items-center justify-center rounded-xl text-xs font-black uppercase ${getTypeAccent(item.type)}`}>
            {getTypeLabel(item.type).slice(0, 2)}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black uppercase text-[#000000]">{item.title}</p>
              {item.status && (
                <Badge variant={item.status === 'reviewed' || item.status === 'completed' ? 'success' : 'default'}>
                  {item.status}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs font-semibold uppercase text-gray-500">{formatDateTime(item.date)}</p>
            <p className="mt-2 text-sm text-gray-700">{item.subtitle}</p>
            {item.detail && <p className="mt-2 text-sm text-gray-600">{item.detail}</p>}
          </div>
        </div>
        {item.href && <p className="text-xs font-bold uppercase text-[#FA0201]">Open</p>}
      </div>
    </div>
  );

  if (!item.href) return content;

  return (
    <Link href={item.href} className="block">
      {content}
    </Link>
  );
};

export default function ClientTimelinePage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutSessionRecord[]>([]);
  const [bodyweights, setBodyweights] = useState<BodyweightEntryRecord[]>([]);
  const [feedbackNotes, setFeedbackNotes] = useState<FeedbackNoteRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [filter, setFilter] = useState<'all' | TimelineType>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTimeline = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const [clientResult, workoutsResult, bodyweightsResult, feedbackResult, submissionsResult] = await Promise.all([
        supabase
          .from('clients')
          .select('id, full_name, email, current_focus')
          .eq('id', clientId)
          .single(),
        supabase
          .from('workout_sessions')
          .select('id, started_at, completed_at, status, review_status, client_notes, coach_note')
          .eq('client_id', clientId)
          .order('started_at', { ascending: false })
          .limit(50),
        supabase
          .from('bodyweight_entries')
          .select('id, entry_date, submitted_at, bodyweight_kg, notes')
          .eq('client_id', clientId)
          .order('entry_date', { ascending: false })
          .limit(50),
        supabase
          .from('feedback_notes')
          .select('id, feedback_date, main_win, main_focus, agreed_action, plan_change, next_review_date, client_visible, created_at')
          .eq('client_id', clientId)
          .order('feedback_date', { ascending: false })
          .limit(50),
        supabase
          .from('task_submissions')
          .select('id, submitted_at, submission_type, answer_value, answer_text, review_status, followup_required, coach_note')
          .eq('client_id', clientId)
          .neq('submission_type', 'workout_session')
          .order('submitted_at', { ascending: false })
          .limit(50),
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

      if (bodyweightsResult.error) {
        setError(bodyweightsResult.error.message);
        setLoading(false);
        return;
      }

      if (feedbackResult.error) {
        setError(feedbackResult.error.message);
        setLoading(false);
        return;
      }

      if (submissionsResult.error) {
        setError(submissionsResult.error.message);
        setLoading(false);
        return;
      }

      setClient(clientResult.data as ClientRecord);
      setWorkouts((workoutsResult.data ?? []) as WorkoutSessionRecord[]);
      setBodyweights((bodyweightsResult.data ?? []) as BodyweightEntryRecord[]);
      setFeedbackNotes((feedbackResult.data ?? []) as FeedbackNoteRecord[]);
      setSubmissions((submissionsResult.data ?? []) as SubmissionRecord[]);
      setLoading(false);
    };

    loadTimeline();
  }, [clientId]);

  const timelineItems = useMemo(() => {
    const workoutItems: TimelineItem[] = workouts.map((workout) => ({
      id: `workout-${workout.id}`,
      type: 'workout',
      date: workout.completed_at || workout.started_at,
      title: workout.status === 'completed' ? 'Workout completed' : 'Workout started',
      subtitle: workout.client_notes || 'Workout session logged through the client workout companion.',
      detail: workout.coach_note ? `Coach note: ${workout.coach_note}` : null,
      status: workout.review_status,
      href: `/coach/clients/${clientId}/workout-history?session=${workout.id}`,
    }));

    const bodyweightItems: TimelineItem[] = bodyweights.map((entry) => ({
      id: `bodyweight-${entry.id}`,
      type: 'bodyweight',
      date: entry.submitted_at || entry.entry_date,
      title: 'Bodyweight logged',
      subtitle: `${Number(entry.bodyweight_kg).toFixed(1)}kg recorded for ${formatDate(entry.entry_date)}.`,
      detail: entry.notes,
      status: null,
      href: `/coach/clients/${clientId}/bodyweight`,
    }));

    const feedbackItems: TimelineItem[] = feedbackNotes.map((feedback) => ({
      id: `feedback-${feedback.id}`,
      type: 'feedback',
      date: feedback.created_at || feedback.feedback_date,
      title: feedback.client_visible ? 'Feedback sent to client' : 'Private coach feedback saved',
      subtitle: feedback.main_focus ? `Main focus: ${feedback.main_focus}` : 'Feedback note created.',
      detail: feedback.agreed_action ? `Agreed action: ${feedback.agreed_action}` : feedback.plan_change,
      status: feedback.client_visible ? 'visible' : 'private',
      href: null,
    }));

    const submissionItems: TimelineItem[] = submissions.map((submission) => ({
      id: `submission-${submission.id}`,
      type: 'submission',
      date: submission.submitted_at,
      title: `${normaliseSubmissionType(submission.submission_type)} submitted`,
      subtitle: submission.answer_text || (submission.answer_value !== null ? `${submission.answer_value}` : 'Client task submission received.'),
      detail: submission.followup_required ? 'Marked as requiring follow-up.' : submission.coach_note,
      status: submission.review_status,
      href: `/coach/submissions/${submission.id}`,
    }));

    return [...workoutItems, ...bodyweightItems, ...feedbackItems, ...submissionItems]
      .filter((item) => filter === 'all' || item.type === filter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [workouts, bodyweights, feedbackNotes, submissions, filter, clientId]);

  const openReviews = timelineItems.filter((item) => item.status && item.status !== 'reviewed' && item.status !== 'completed').length;
  const latestEvent = timelineItems[0] ?? null;

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading progress timeline...</Card></div>;
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
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Progress Timeline</h1>
          <p className="mt-1 text-sm text-gray-700">{client.full_name}{client.email ? ` • ${client.email}` : ''}</p>
        </div>
        <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">
          Back to client
        </Link>
      </div>

      <section>
        <SectionHeader title="TIMELINE SNAPSHOT" accent />
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <MetricCard label="Events" value={timelineItems.length} helper="Visible in current filter" />
            <MetricCard label="Workouts" value={workouts.length} helper="Workout sessions tracked" />
            <MetricCard label="Bodyweight logs" value={bodyweights.length} helper="Entries recorded" />
            <MetricCard label="Open statuses" value={openReviews} helper="Non-reviewed/non-complete items" />
          </div>
          <div className="mt-5 rounded-xl bg-black p-4 text-white">
            <p className="text-xs font-bold uppercase text-gray-400">Latest event</p>
            <p className="mt-1 text-sm font-bold uppercase">{latestEvent ? latestEvent.title : 'No events yet'}</p>
            <p className="mt-1 text-xs text-gray-300">{latestEvent ? formatDateTime(latestEvent.date) : 'Timeline will populate when client activity is logged.'}</p>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="CLIENT HISTORY" accent />
        <Card>
          <div className="mb-5 flex flex-wrap gap-2">
            {(['all', 'workout', 'bodyweight', 'feedback', 'submission'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`rounded-lg px-4 py-2 text-xs font-bold uppercase ${filter === option ? 'bg-[#FA0201] text-white' : 'bg-gray-100 text-[#000000] hover:bg-gray-200'}`}
              >
                {option === 'all' ? 'All' : getTypeLabel(option)}
              </button>
            ))}
          </div>

          {timelineItems.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-sm font-semibold text-gray-700">No timeline events yet.</p>
              <p className="mt-2 text-xs text-gray-500">Workouts, feedback, bodyweight entries, and submissions will appear here as the client uses the system.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {timelineItems.map((item) => <TimelineCard key={item.id} item={item} />)}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader title="FUTURE TIMELINE FLAGS" accent />
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <FutureTimelineCard
              title="Pain reports"
              description="Surface pain entries from workout check-ins and highlight recurring body areas or severity."
            />
            <FutureTimelineCard
              title="Adherence streaks"
              description="Show completed/missed workout streaks and check-in consistency over time."
            />
            <FutureTimelineCard
              title="PR milestones"
              description="Automatically tag strength PRs, estimated 1RM jumps, and first-time performance wins."
            />
            <FutureTimelineCard
              title="Nutrition context"
              description="Overlay nutrition submissions around weight changes and training performance shifts."
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
