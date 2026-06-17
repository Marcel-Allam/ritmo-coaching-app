'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface ClientRecord {
  id: string;
  full_name: string;
  current_focus: string | null;
  next_review_date: string | null;
}

interface ClientSettingsRecord {
  show_calorie_target: boolean;
  show_key_lift_card: boolean;
  show_bodyweight_card: boolean;
  show_calorie_guideline_card: boolean;
  show_today_actions_card: boolean;
  show_upcoming_actions_card: boolean;
  show_latest_feedback_card: boolean;
  bodyweight_enabled: boolean;
  training_availability_enabled: boolean;
}

interface AssignedTaskRecord {
  id: string;
  task_name: string;
  task_type: string;
  instructions: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface SubmissionRecord {
  assigned_task_id: string | null;
  submission_type: string;
}

interface FeedbackRecord {
  id: string;
  feedback_date: string;
  main_win: string | null;
  main_focus: string | null;
  agreed_action: string | null;
  plan_change: string | null;
  next_review_date: string | null;
}

interface KeyLiftRecord {
  id: string;
  submitted_at: string;
  lift_name: string;
  weight_kg: number;
  reps: number;
}

interface BodyweightRecord {
  id: string;
  entry_date: string;
  bodyweight_kg: number;
}

interface WorkoutRecord {
  id: string;
  title: string;
  scheduled_date: string | null;
  status: string;
}

type ActionState = 'active' | 'scheduled' | 'not_scheduled';

interface ActionItem {
  id: string;
  title: string;
  description: string;
  href: string;
  date: string | null;
  state?: ActionState;
  statusLabel?: string;
}

const defaultSettings: ClientSettingsRecord = {
  show_calorie_target: false,
  show_key_lift_card: true,
  show_bodyweight_card: true,
  show_calorie_guideline_card: false,
  show_today_actions_card: true,
  show_upcoming_actions_card: true,
  show_latest_feedback_card: true,
  bodyweight_enabled: true,
  training_availability_enabled: true,
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const formatShortDate = (value: string) => {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const tomorrowIso = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
};

const estimateOneRepMax = (weightKg: number, reps: number) => {
  return weightKg * (1 + reps / 30);
};

const formatPercent = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
};

const getTaskHref = (taskType: string) => {
  const routes: Record<string, string> = {
    weekly_checkin: '/client/submit/weekly-checkin',
    workout_checkin: '/client/submit/workout-checkin',
    key_lift: '/client/submit/key-lift',
    nutrition: '/client/submit/nutrition-bodyweight',
    bodyweight: '/client/submit/nutrition-bodyweight',
    training_availability: '/client/submit/training-availability',
  };

  return routes[taskType] ?? '/client/check-in';
};

const getTaskActionState = (task: AssignedTaskRecord, today: string): ActionState => {
  if (task.start_date && task.start_date > today) return 'scheduled';
  return 'active';
};

const getWeeklyTaskStatusLabel = (task: AssignedTaskRecord | undefined, today: string) => {
  if (!task) return 'Not scheduled';
  if (task.start_date && task.start_date > today) return `Next due ${formatDate(task.start_date)}`;
  if (task.end_date && task.end_date < today) return `Overdue since ${formatDate(task.end_date)}`;
  if (task.end_date && task.end_date === today) return 'Due today';
  return task.end_date ? `Due ${formatDate(task.end_date)}` : 'Due now';
};

const calculateWindowTrend = <T,>(
  records: T[],
  getDate: (record: T) => string,
  getValue: (record: T) => number,
  days: number
) => {
  const sorted = [...records]
    .filter((record) => Number.isFinite(getValue(record)))
    .sort((a, b) => new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime());

  if (sorted.length < 2) return null;

  const latest = sorted[sorted.length - 1];
  const latestDate = new Date(getDate(latest));
  const cutoff = new Date(latestDate);
  cutoff.setDate(latestDate.getDate() - days);

  const windowRecords = sorted.filter((record) => new Date(getDate(record)) >= cutoff);
  if (windowRecords.length < 2) return null;

  const first = getValue(windowRecords[0]);
  const last = getValue(windowRecords[windowRecords.length - 1]);

  if (first === 0) return null;
  return ((last - first) / first) * 100;
};

const getCalorieGuideline = (bodyweightTrend4Week: number | null) => {
  if (bodyweightTrend4Week === null) {
    return {
      label: 'More data needed',
      detail: 'Log at least two weigh-ins before the app can show a useful calorie direction.',
    };
  }

  if (bodyweightTrend4Week <= -1) {
    return {
      label: 'Weight trending down',
      detail: 'Trend is moving down. Coach should decide whether to hold calories or adjust based on the client goal and performance.',
    };
  }

  if (bodyweightTrend4Week >= 1) {
    return {
      label: 'Weight trending up',
      detail: 'Trend is moving up. Coach should decide whether this matches the client goal or needs a calorie adjustment.',
    };
  }

  return {
    label: 'Trend stable',
    detail: 'Bodyweight is broadly stable. If the goal needs faster movement, coach review may be needed.',
  };
};

const MiniTrend = ({ values }: { values: number[] }) => {
  if (values.length < 2) {
    return (
      <div className="mt-4 flex h-24 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold uppercase text-gray-500">
        More data needed
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 80 - ((value - min) / range) * 60;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg className="mt-4 h-24 w-full rounded-lg bg-gray-100" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="4" className="text-[#000000]" />
      <line x1="0" y1="82" x2="100" y2="82" stroke="currentColor" strokeWidth="1" className="text-gray-300" />
    </svg>
  );
};

const ProgressCard = ({
  title,
  oneWeek,
  fourWeek,
  helper,
  values,
}: {
  title: string;
  oneWeek: number | null;
  fourWeek: number | null;
  helper: string;
  values: number[];
}) => (
  <Card>
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase text-gray-500">Progress Card</p>
        <h2 className="mt-1 text-xl font-black uppercase text-[#000000]">{title}</h2>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg bg-gray-100 p-3">
        <p className="text-3xl font-black text-[#000000]">{formatPercent(oneWeek)}</p>
        <p className="mt-1 text-xs font-bold uppercase text-gray-500">1 week</p>
      </div>
      <div className="rounded-lg bg-gray-100 p-3">
        <p className="text-3xl font-black text-[#000000]">{formatPercent(fourWeek)}</p>
        <p className="mt-1 text-xs font-bold uppercase text-gray-500">4 weeks</p>
      </div>
    </div>
    <MiniTrend values={values} />
    <p className="mt-3 text-sm text-gray-600">{helper}</p>
  </Card>
);

const HubActionCard = ({ item }: { item: ActionItem }) => {
  const isDisabled = item.state === 'scheduled' || item.state === 'not_scheduled';
  const cardClassName = `block rounded-xl border p-4 ${
    isDisabled
      ? 'border-gray-200 bg-gray-100 opacity-70'
      : 'border-gray-200 bg-white hover:bg-gray-50'
  }`;

  const innerContent = (
    <div className="flex items-start gap-3">
      <span className={`mt-1 h-3 w-3 rounded-full ${isDisabled ? 'bg-gray-400' : 'bg-[#FA0201]'}`} />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold uppercase text-[#000000]">{item.title}</p>
          {item.statusLabel && (
            <span className="rounded-full bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">
              {item.statusLabel}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-gray-600">{item.description}</p>
      </div>
    </div>
  );

  if (isDisabled) {
    return <div className={cardClassName}>{innerContent}</div>;
  }

  return <Link href={item.href} className={cardClassName}>{innerContent}</Link>;
};

export default function ClientHub() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [settings, setSettings] = useState<ClientSettingsRecord>(defaultSettings);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRecord | null>(null);
  const [keyLifts, setKeyLifts] = useState<KeyLiftRecord[]>([]);
  const [bodyweightEntries, setBodyweightEntries] = useState<BodyweightRecord[]>([]);
  const [scheduledWorkouts, setScheduledWorkouts] = useState<WorkoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadHub = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Account is not ready yet.');
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name, current_focus, next_review_date')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        setMessage('This account is not linked to a client record yet.');
        setLoading(false);
        return;
      }

      const linkedClient = clientData as ClientRecord;
      setClient(linkedClient);

      const [settingsResult, taskResult, submissionResult, feedbackResult, keyLiftResult, bodyweightResult, workoutResult] = await Promise.all([
        supabase
          .from('client_settings')
          .select('show_calorie_target, show_key_lift_card, show_bodyweight_card, show_calorie_guideline_card, show_today_actions_card, show_upcoming_actions_card, show_latest_feedback_card, bodyweight_enabled, training_availability_enabled')
          .eq('client_id', linkedClient.id)
          .maybeSingle(),
        supabase
          .from('assigned_tasks')
          .select('id, task_name, task_type, instructions, start_date, end_date')
          .eq('client_id', linkedClient.id)
          .eq('active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('task_submissions')
          .select('assigned_task_id, submission_type')
          .eq('client_id', linkedClient.id)
          .order('submitted_at', { ascending: false }),
        supabase
          .from('feedback_notes')
          .select('id, feedback_date, main_win, main_focus, agreed_action, plan_change, next_review_date')
          .eq('client_id', linkedClient.id)
          .eq('client_visible', true)
          .order('feedback_date', { ascending: false })
          .limit(1),
        supabase
          .from('key_lift_entries')
          .select('id, submitted_at, lift_name, weight_kg, reps')
          .eq('client_id', linkedClient.id)
          .order('submitted_at', { ascending: false })
          .limit(30),
        supabase
          .from('bodyweight_entries')
          .select('id, entry_date, bodyweight_kg')
          .eq('client_id', linkedClient.id)
          .order('entry_date', { ascending: false })
          .limit(30),
        supabase
          .from('program_workouts')
          .select('id, title, scheduled_date, status')
          .eq('client_id', linkedClient.id)
          .eq('status', 'active')
          .not('scheduled_date', 'is', null)
          .order('scheduled_date', { ascending: true })
          .limit(20),
      ]);

      if (settingsResult.error) {
        setMessage(settingsResult.error.message);
        setLoading(false);
        return;
      }

      if (taskResult.error) {
        setMessage(taskResult.error.message);
        setLoading(false);
        return;
      }

      if (submissionResult.error) {
        setMessage(submissionResult.error.message);
        setLoading(false);
        return;
      }

      if (feedbackResult.error) {
        setMessage(feedbackResult.error.message);
        setLoading(false);
        return;
      }

      if (keyLiftResult.error) {
        setMessage(keyLiftResult.error.message);
        setLoading(false);
        return;
      }

      if (bodyweightResult.error) {
        setMessage(bodyweightResult.error.message);
        setLoading(false);
        return;
      }

      if (workoutResult.error) {
        setMessage(workoutResult.error.message);
        setLoading(false);
        return;
      }

      setSettings({
        ...defaultSettings,
        ...((settingsResult.data as Partial<ClientSettingsRecord> | null) ?? {}),
      });
      setTasks((taskResult.data ?? []) as AssignedTaskRecord[]);
      setSubmissions((submissionResult.data ?? []) as SubmissionRecord[]);
      setFeedback((feedbackResult.data?.[0] ?? null) as FeedbackRecord | null);
      setKeyLifts((keyLiftResult.data ?? []) as KeyLiftRecord[]);
      setBodyweightEntries((bodyweightResult.data ?? []) as BodyweightRecord[]);
      setScheduledWorkouts((workoutResult.data ?? []) as WorkoutRecord[]);
      setLoading(false);
    };

    loadHub();
  }, [user]);

  const isTaskComplete = (task: AssignedTaskRecord) => {
    return submissions.some((submission) => {
      return submission.assigned_task_id === task.id || submission.submission_type === task.task_type;
    });
  };

  const latestLiftName = keyLifts[0]?.lift_name ?? 'Key Lift';
  const selectedLiftEntries = keyLifts.filter((entry) => entry.lift_name === latestLiftName);
  const keyLiftValues = selectedLiftEntries
    .slice()
    .reverse()
    .map((entry) => estimateOneRepMax(entry.weight_kg, entry.reps));
  const bodyweightValues = bodyweightEntries
    .slice()
    .reverse()
    .map((entry) => entry.bodyweight_kg);

  const keyLiftOneWeek = calculateWindowTrend(selectedLiftEntries, (entry) => entry.submitted_at, (entry) => estimateOneRepMax(entry.weight_kg, entry.reps), 7);
  const keyLiftFourWeek = calculateWindowTrend(selectedLiftEntries, (entry) => entry.submitted_at, (entry) => estimateOneRepMax(entry.weight_kg, entry.reps), 28);
  const bodyweightOneWeek = calculateWindowTrend(bodyweightEntries, (entry) => entry.entry_date, (entry) => entry.bodyweight_kg, 7);
  const bodyweightFourWeek = calculateWindowTrend(bodyweightEntries, (entry) => entry.entry_date, (entry) => entry.bodyweight_kg, 28);
  const calorieGuideline = getCalorieGuideline(bodyweightFourWeek);

  const weeklyCalendarActions = useMemo<ActionItem[]>(() => {
    const today = todayIso();
    const buildWeeklyAction = ({
      taskType,
      enabled,
      fallbackTitle,
      activeDescription,
      scheduledDescription,
      href,
    }: {
      taskType: 'training_availability' | 'bodyweight';
      enabled: boolean;
      fallbackTitle: string;
      activeDescription: string;
      scheduledDescription: string;
      href: string;
    }): ActionItem | null => {
      if (!enabled) return null;

      const task = tasks.find((item) => item.task_type === taskType);
      if (!task) {
        return {
          id: `weekly-${taskType}-not-scheduled`,
          title: fallbackTitle,
          description: 'No active weekly item is scheduled yet. Your coach can enable this, or you can adjust reminder preferences in Configure.',
          href: '/client/configure',
          date: null,
          state: 'not_scheduled',
          statusLabel: 'Not scheduled',
        };
      }

      const state = getTaskActionState(task, today);
      return {
        id: task.id,
        title: task.task_name || fallbackTitle,
        description: state === 'active'
          ? (task.instructions || activeDescription)
          : `${scheduledDescription} ${getWeeklyTaskStatusLabel(task, today)}.`,
        href,
        date: task.end_date || task.start_date,
        state,
        statusLabel: getWeeklyTaskStatusLabel(task, today),
      };
    };

    return [
      buildWeeklyAction({
        taskType: 'training_availability',
        enabled: settings.training_availability_enabled,
        fallbackTitle: 'Training availability',
        activeDescription: 'Confirm the days you can train next week.',
        scheduledDescription: 'Your next training availability check-in is already scheduled.',
        href: '/client/submit/training-availability',
      }),
      buildWeeklyAction({
        taskType: 'bodyweight',
        enabled: settings.bodyweight_enabled,
        fallbackTitle: 'Bodyweight check-in',
        activeDescription: 'Log your weekly bodyweight.',
        scheduledDescription: 'Your next bodyweight check-in is already scheduled.',
        href: '/client/submit/nutrition-bodyweight',
      }),
    ].filter(Boolean) as ActionItem[];
  }, [settings.training_availability_enabled, settings.bodyweight_enabled, tasks]);

  const todayActions = useMemo<ActionItem[]>(() => {
    const today = todayIso();
    const activeTaskActions = tasks
      .filter((task) => !['training_availability', 'bodyweight'].includes(task.task_type))
      .filter((task) => !isTaskComplete(task) && task.end_date && task.end_date <= today)
      .map((task) => ({
        id: task.id,
        title: task.task_name,
        description: task.instructions || task.task_type.replaceAll('_', ' '),
        href: getTaskHref(task.task_type),
        date: task.end_date,
      }));

    const workoutActions = scheduledWorkouts
      .filter((workout) => workout.scheduled_date === today)
      .map((workout) => ({
        id: workout.id,
        title: workout.title,
        description: 'Scheduled workout for today',
        href: `/client/training/${workout.id}`,
        date: workout.scheduled_date,
      }));

    return [...workoutActions, ...activeTaskActions];
  }, [scheduledWorkouts, submissions, tasks]);

  const upcomingActions = useMemo<ActionItem[]>(() => {
    const today = todayIso();
    const upcomingTaskActions = tasks
      .filter((task) => !['training_availability', 'bodyweight'].includes(task.task_type))
      .filter((task) => !isTaskComplete(task) && (!task.end_date || task.end_date > today))
      .map((task) => ({
        id: task.id,
        title: task.task_name,
        description: task.end_date
          ? `${task.instructions || task.task_type.replaceAll('_', ' ')} • Due ${formatDate(task.end_date)}`
          : `${task.instructions || task.task_type.replaceAll('_', ' ')} • Assigned task`,
        href: getTaskHref(task.task_type),
        date: task.end_date,
      }));

    const workoutActions = scheduledWorkouts
      .filter((workout) => workout.scheduled_date && workout.scheduled_date > today)
      .map((workout) => ({
        id: workout.id,
        title: workout.title,
        description: `Scheduled for ${formatDate(workout.scheduled_date)}`,
        href: `/client/training/${workout.id}`,
        date: workout.scheduled_date,
      }));

    return [...workoutActions, ...upcomingTaskActions]
      .sort((a, b) => {
        if (!a.date && !b.date) return a.title.localeCompare(b.title);
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      })
      .slice(0, 8);
  }, [scheduledWorkouts, submissions, tasks]);

  if (loading) {
    return (
      <div>
        <PageHeader title="YOUR HUB" />
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
          <Card><p className="font-semibold text-gray-700">Loading your hub...</p></Card>
        </div>
      </div>
    );
  }

  if (message || !client) {
    return (
      <div>
        <PageHeader title="YOUR HUB" />
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
          <Card>
            <p className="font-bold uppercase text-[#000000]">Account not linked</p>
            <p className="mt-2 text-sm text-gray-600">{message}</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="YOUR HUB" subtitle={`Welcome, ${client.full_name}`} />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-8">
        <section>
          <SectionHeader title="YOUR DIRECTION" accent />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {settings.show_key_lift_card && (
              <ProgressCard
                title={latestLiftName === 'Key Lift' ? 'Key Lift Progress' : `${latestLiftName} Progress`}
                oneWeek={keyLiftOneWeek}
                fourWeek={keyLiftFourWeek}
                helper="Strength trend uses estimated 1RM from your logged key lift/top-set entries."
                values={keyLiftValues}
              />
            )}

            {settings.show_bodyweight_card && (
              <ProgressCard
                title="Bodyweight Progress"
                oneWeek={bodyweightOneWeek}
                fourWeek={bodyweightFourWeek}
                helper="Bodyweight is noisy day to day, so the 4-week trend matters most."
                values={bodyweightValues}
              />
            )}

            {settings.show_calorie_guideline_card && (
              <Card>
                <p className="text-xs font-bold uppercase text-gray-500">Guideline Card</p>
                <h2 className="mt-1 text-xl font-black uppercase text-[#000000]">Calorie Guideline</h2>
                <div className="mt-4 rounded-lg bg-gray-100 p-4">
                  <p className="text-2xl font-black text-[#000000]">{calorieGuideline.label}</p>
                  <p className="mt-2 text-sm text-gray-700">{calorieGuideline.detail}</p>
                </div>
                <p className="mt-3 text-xs font-semibold uppercase text-gray-500">
                  {settings.show_calorie_target ? 'Calorie target visibility is enabled.' : 'No calorie target shown yet.'}
                </p>
              </Card>
            )}
          </div>
        </section>

        <section>
          <SectionHeader title="CURRENT FOCUS" accent />
          <Card variant="dark" className="p-8">
            <p className="text-2xl font-bold text-white">
              {client.current_focus || 'No current focus set'}
            </p>
            <p className="mt-4 border-t border-gray-700 pt-4 text-sm text-white opacity-75">
              Next review: {formatDate(client.next_review_date)}
            </p>
          </Card>
        </section>

        {weeklyCalendarActions.length > 0 && (
          <section>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <SectionHeader title="WEEKLY CALENDAR" accent />
              <Link href="/client/configure" className="mb-4 text-xs font-bold uppercase text-[#FA0201] hover:underline">
                Configure reminders
              </Link>
            </div>
            <div className="space-y-3">
              {weeklyCalendarActions.map((item) => <HubActionCard key={item.id} item={item} />)}
            </div>
          </section>
        )}

        {settings.show_today_actions_card && (
          <section>
            <SectionHeader title={`TODAY - ${formatShortDate(todayIso())}`} accent />
            <div className="space-y-3">
              {todayActions.length === 0 ? (
                <Card><p className="text-sm text-gray-600">No urgent actions today. Stay ready for your next task.</p></Card>
              ) : (
                todayActions.map((item) => <HubActionCard key={item.id} item={item} />)
              )}
            </div>
          </section>
        )}

        {settings.show_upcoming_actions_card && (
          <section>
            <SectionHeader title={`UPCOMING - FROM ${formatShortDate(tomorrowIso())}`} accent />
            <div className="space-y-3">
              {upcomingActions.length === 0 ? (
                <Card><p className="text-sm text-gray-600">No upcoming actions scheduled yet.</p></Card>
              ) : (
                upcomingActions.map((item) => <HubActionCard key={item.id} item={item} />)
              )}
            </div>
          </section>
        )}

        {settings.show_latest_feedback_card && (
          <section>
            <SectionHeader title="LATEST FEEDBACK" accent />
            <Card>
              {!feedback ? (
                <p className="text-sm text-gray-600">No coach feedback visible yet.</p>
              ) : (
                <div className="space-y-4 text-sm text-gray-800">
                  <p className="text-xs font-bold uppercase text-gray-500">{formatDate(feedback.feedback_date)}</p>
                  {feedback.main_win && <p><strong>Main win:</strong> {feedback.main_win}</p>}
                  {feedback.main_focus && <p><strong>Main focus:</strong> {feedback.main_focus}</p>}
                  {feedback.agreed_action && <p><strong>Agreed action:</strong> {feedback.agreed_action}</p>}
                  {feedback.plan_change && <p><strong>Plan change:</strong> {feedback.plan_change}</p>}
                  {feedback.next_review_date && (
                    <p className="border-t border-gray-200 pt-3"><strong>Next review:</strong> {formatDate(feedback.next_review_date)}</p>
                  )}
                </div>
              )}
            </Card>
          </section>
        )}
      </div>
    </div>
  );
}
