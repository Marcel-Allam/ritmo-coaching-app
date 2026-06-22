'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { TaskCard } from '@/components/ui/task-card';
import { Input } from '@/components/ui/input';
import { ClientMetricChartDashboard } from '@/components/coach/client-metric-chart-dashboard';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface ClientRecord {
  id: string;
  full_name: string;
  email: string | null;
  user_id: string | null;
  status: string;
  current_focus: string | null;
  next_review_date: string | null;
  next_call_date: string | null;
  start_date: string | null;
}

interface AssignedTaskRecord {
  id: string;
  task_name: string;
  task_type: string;
  frequency: string;
  instructions: string | null;
  active: boolean;
  end_date: string | null;
}

interface SubmissionRecord {
  id: string;
  assigned_task_id: string | null;
  submission_type: string;
  submitted_at: string;
  review_status: string;
  answer_text?: string | null;
}

interface LatestFeedbackRecord {
  feedback_date: string;
  main_focus: string | null;
  agreed_action: string | null;
  next_review_date: string | null;
}

interface ClientSnapshot {
  weekStart: string;
  weekEnd: string;
  workoutsScheduledThisWeek: number;
  workoutsCompletedThisWeek: number;
  workoutsRemainingThisWeek: number;
  reviewsNeedingAction: number;
  latestFeedback: LatestFeedbackRecord | null;
}

type ProgramRecord = { id: string; title: string; goal: string | null; status: string; created_at: string };
type ProgramWorkoutRecord = { id: string; program_id: string; title: string; workout_order: number; scheduled_date: string | null; status: string };
type ProgramExerciseRecord = { id: string; workout_id: string; exercise_order: number; exercise_name: string };
type ProgramSetRecord = { id: string; exercise_id: string; set_order: number; target_reps: string | null; target_weight_kg: number | null; target_rpe: number | null };
type ProgramOverview = ProgramRecord & {
  workouts: Array<ProgramWorkoutRecord & {
    exercises: Array<ProgramExerciseRecord & { sets: ProgramSetRecord[] }>;
  }>;
};

const emptyTaskForm = {
  taskType: 'weekly_checkin',
  frequency: 'weekly',
  endDate: '',
  instructions: '',
};

const emptySnapshot: ClientSnapshot = {
  weekStart: '',
  weekEnd: '',
  workoutsScheduledThisWeek: 0,
  workoutsCompletedThisWeek: 0,
  workoutsRemainingThisWeek: 0,
  reviewsNeedingAction: 0,
  latestFeedback: null,
};

const taskOptions = [
  { value: 'weekly_checkin', label: 'Weekly check-in' },
  { value: 'training_availability', label: 'Training availability' },
  { value: 'workout_checkin', label: 'Workout check-in' },
  { value: 'key_lift', label: 'Key lift / top set' },
  { value: 'nutrition', label: 'Nutrition submission' },
  { value: 'bodyweight', label: 'Bodyweight' },
  { value: 'progress_photo', label: 'Progress photo' },
  { value: 'habit_check', label: 'Habit check' },
];

const getTaskLabel = (taskType: string) => taskOptions.find((task) => task.value === taskType)?.label ?? taskType.replaceAll('_', ' ');

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
};

const getStatusBadgeVariant = (status: string) => (status === 'active' ? 'success' : 'warning');

const getCurrentWeekRange = () => {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    weekStartDate: monday.toISOString().slice(0, 10),
    weekEndDate: sunday.toISOString().slice(0, 10),
    weekStartTimestamp: monday.toISOString(),
    weekEndTimestamp: sunday.toISOString(),
  };
};

const getSetSummary = (sets: ProgramSetRecord[]) => {
  if (sets.length === 0) return 'No prescribed sets';
  const reps = sets.map((set) => set.target_reps || '?').join(' / ');
  const hasLoads = sets.some((set) => set.target_weight_kg !== null && set.target_weight_kg !== undefined);
  const loadLabel = hasLoads
    ? ` • ${sets.map((set) => (set.target_weight_kg !== null && set.target_weight_kg !== undefined ? `${set.target_weight_kg}kg` : 'bodyweight')).join(' / ')}`
    : '';
  return `${sets.length} set${sets.length === 1 ? '' : 's'} × ${reps} reps${loadLabel}`;
};

const SnapshotMetric = ({ label, value, helper }: { label: string; value: string | number; helper: string }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-black text-[#000000]">{value}</p>
    <p className="mt-1 text-xs font-semibold text-gray-600">{helper}</p>
  </div>
);

const ProgrammeCard = ({
  program,
  isExpanded,
  onToggle,
  editHref,
}: {
  program: ProgramOverview;
  isExpanded: boolean;
  onToggle: () => void;
  editHref: string;
}) => {
  const [expandedWorkoutIds, setExpandedWorkoutIds] = useState<Set<string>>(new Set());

  const toggleWorkout = (workoutId: string) => {
    setExpandedWorkoutIds((current) => {
      const next = new Set(current);
      if (next.has(workoutId)) next.delete(workoutId);
      else next.add(workoutId);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <button type="button" onClick={onToggle} className="text-left">
          <div className="flex items-center gap-2">
            <p className="text-lg font-black uppercase tracking-tight text-[#000000]">{program.title || 'Untitled programme'}</p>
            <span className="text-lg font-black text-[#FA0201]">{isExpanded ? '▴' : '▾'}</span>
          </div>
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">
            {program.workouts.length} workout{program.workouts.length === 1 ? '' : 's'} assigned
            {program.goal ? ` • ${program.goal}` : ''}
          </p>
        </button>
        <Link href={editHref} className="rounded-lg bg-[#FA0201] px-5 py-3 text-center text-sm font-bold uppercase text-white hover:bg-red-700">
          Edit client plan
        </Link>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
          {program.workouts.length === 0 ? (
            <p className="text-sm text-gray-600">No workouts found inside this programme.</p>
          ) : program.workouts.map((workout) => {
            const workoutExpanded = expandedWorkoutIds.has(workout.id);
            return (
              <div key={workout.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <button type="button" onClick={() => toggleWorkout(workout.id)} className="flex w-full flex-col gap-2 text-left md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black uppercase text-[#000000]">Day {workout.workout_order || '-'} · {workout.title}</p>
                      <span className="text-sm font-black text-[#FA0201]">{workoutExpanded ? '▴' : '▾'}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold uppercase text-gray-500">{formatDate(workout.scheduled_date)} · {workout.status}</p>
                  </div>
                  <p className="text-xs font-bold uppercase text-gray-500">{workout.exercises.length} exercise{workout.exercises.length === 1 ? '' : 's'}</p>
                </button>
                {workoutExpanded && (
                  <div className="mt-3 space-y-2">
                    {workout.exercises.length === 0 ? (
                      <p className="text-xs text-gray-600">No exercises added yet.</p>
                    ) : workout.exercises.map((exercise) => (
                      <div key={exercise.id} className="rounded bg-white px-3 py-2 text-xs text-gray-700">
                        <span className="font-black uppercase text-[#000000]">{exercise.exercise_name}</span>
                        <span className="ml-2 font-semibold text-gray-600">{getSetSummary(exercise.sets)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function ClientProfilePage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [snapshot, setSnapshot] = useState<ClientSnapshot>(emptySnapshot);
  const [programmes, setProgrammes] = useState<ProgramOverview[]>([]);
  const [expandedProgrammeIds, setExpandedProgrammeIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const loadProgrammeOverview = async (supabase: ReturnType<typeof createClient>) => {
    const programResult = await supabase
      .from('training_programs')
      .select('id, title, goal, status, created_at')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (programResult.error) throw programResult.error;

    const loadedPrograms = (programResult.data ?? []) as ProgramRecord[];
    const programIds = loadedPrograms.map((program) => program.id);
    if (programIds.length === 0) return [];

    const workoutResult = await supabase
      .from('program_workouts')
      .select('id, program_id, title, workout_order, scheduled_date, status')
      .in('program_id', programIds)
      .neq('status', 'archived')
      .order('workout_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (workoutResult.error) throw workoutResult.error;

    const loadedWorkouts = (workoutResult.data ?? []) as ProgramWorkoutRecord[];
    const workoutIds = loadedWorkouts.map((workout) => workout.id);
    if (workoutIds.length === 0) return loadedPrograms.map((program) => ({ ...program, workouts: [] }));

    const exerciseResult = await supabase
      .from('program_exercises')
      .select('id, workout_id, exercise_order, exercise_name')
      .in('workout_id', workoutIds)
      .order('exercise_order', { ascending: true });

    if (exerciseResult.error) throw exerciseResult.error;

    const loadedExercises = (exerciseResult.data ?? []) as ProgramExerciseRecord[];
    const exerciseIds = loadedExercises.map((exercise) => exercise.id);
    const setResult = exerciseIds.length > 0
      ? await supabase
          .from('program_sets')
          .select('id, exercise_id, set_order, target_reps, target_weight_kg, target_rpe')
          .in('exercise_id', exerciseIds)
          .order('set_order', { ascending: true })
      : { data: [], error: null };

    if (setResult.error) throw setResult.error;

    const loadedSets = (setResult.data ?? []) as ProgramSetRecord[];

    return loadedPrograms.map((program) => ({
      ...program,
      workouts: loadedWorkouts
        .filter((workout) => workout.program_id === program.id)
        .map((workout) => ({
          ...workout,
          exercises: loadedExercises
            .filter((exercise) => exercise.workout_id === workout.id)
            .map((exercise) => ({
              ...exercise,
              sets: loadedSets.filter((set) => set.exercise_id === exercise.id),
            })),
        })),
    }));
  };

  const loadClientProfile = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();
    const weekRange = getCurrentWeekRange();

    const [clientResult, tasksResult, submissionsResult, scheduledWorkoutsResult, completedWorkoutsResult, reviewCountResult, latestFeedbackResult] = await Promise.all([
      supabase.from('clients').select('id, full_name, email, user_id, status, current_focus, next_review_date, next_call_date, start_date').eq('id', clientId).single(),
      supabase.from('assigned_tasks').select('id, task_name, task_type, frequency, instructions, active, end_date').eq('client_id', clientId).eq('active', true).order('created_at', { ascending: false }),
      supabase.from('task_submissions').select('id, assigned_task_id, submission_type, submitted_at, review_status, answer_text').eq('client_id', clientId).order('submitted_at', { ascending: false }).limit(5),
      supabase.from('program_workouts').select('id, scheduled_date, status').eq('client_id', clientId).neq('status', 'archived').not('scheduled_date', 'is', null).gte('scheduled_date', weekRange.weekStartDate).lte('scheduled_date', weekRange.weekEndDate),
      supabase.from('workout_sessions').select('id, status, completed_at').eq('client_id', clientId).eq('status', 'completed').gte('completed_at', weekRange.weekStartTimestamp).lte('completed_at', weekRange.weekEndTimestamp),
      supabase.from('task_submissions').select('id', { count: 'exact', head: true }).eq('client_id', clientId).neq('review_status', 'reviewed'),
      supabase.from('feedback_notes').select('feedback_date, main_focus, agreed_action, next_review_date').eq('client_id', clientId).order('feedback_date', { ascending: false }).order('created_at', { ascending: false }).limit(1),
    ]);

    const firstError = clientResult.error || tasksResult.error || submissionsResult.error || scheduledWorkoutsResult.error || completedWorkoutsResult.error || reviewCountResult.error || latestFeedbackResult.error;
    if (firstError) {
      setError(firstError.message);
      setIsLoading(false);
      return;
    }

    try {
      const programmeOverview = await loadProgrammeOverview(supabase);
      setProgrammes(programmeOverview);
      if (programmeOverview[0]) setExpandedProgrammeIds(new Set([programmeOverview[0].id]));
    } catch (programmeError) {
      setError(programmeError instanceof Error ? programmeError.message : 'Could not load programme summary.');
      setIsLoading(false);
      return;
    }

    const workoutsScheduledThisWeek = scheduledWorkoutsResult.data?.length ?? 0;
    const workoutsCompletedThisWeek = completedWorkoutsResult.data?.length ?? 0;

    setClient(clientResult.data as ClientRecord);
    setTasks((tasksResult.data ?? []) as AssignedTaskRecord[]);
    setSubmissions((submissionsResult.data ?? []) as SubmissionRecord[]);
    setSnapshot({
      weekStart: weekRange.weekStartDate,
      weekEnd: weekRange.weekEndDate,
      workoutsScheduledThisWeek,
      workoutsCompletedThisWeek,
      workoutsRemainingThisWeek: Math.max(workoutsScheduledThisWeek - workoutsCompletedThisWeek, 0),
      reviewsNeedingAction: reviewCountResult.count ?? 0,
      latestFeedback: ((latestFeedbackResult.data ?? [])[0] as LatestFeedbackRecord | undefined) ?? null,
    });
    setIsLoading(false);
  };

  useEffect(() => {
    loadClientProfile();
  }, [clientId]);

  const toggleProgramme = (programId: string) => {
    setExpandedProgrammeIds((current) => {
      const next = new Set(current);
      if (next.has(programId)) next.delete(programId);
      else next.add(programId);
      return next;
    });
  };

  const handleCreateInvite = async () => {
    if (!isSupabaseConfigured || !client) return;
    setIsCreatingInvite(true);
    setInviteMessage(null);
    setError(null);

    const supabase = createClient();
    const { data: token, error: inviteError } = await supabase.rpc('generate_client_invite', { p_client_id: client.id });

    if (inviteError || !token) {
      setError(inviteError?.message || 'Could not create invite link.');
      setIsCreatingInvite(false);
      return;
    }

    setInviteLink(`${window.location.origin}/invite/${token as string}`);
    setInviteMessage('Invite link created. Send this to the client.');
    setIsCreatingInvite(false);
  };

  const handleCopyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteMessage('Invite link copied.');
    } catch {
      setInviteMessage('Copy failed. Select and copy the link manually.');
    }
  };

  const handleCreateTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSupabaseConfigured) return;

    setIsSavingTask(true);
    setError(null);

    const taskLabel = getTaskLabel(taskForm.taskType);
    const supabase = createClient();
    const { error: insertError } = await supabase.from('assigned_tasks').insert({
      client_id: clientId,
      task_name: taskLabel,
      task_type: taskForm.taskType,
      frequency: taskForm.frequency,
      required: true,
      start_date: new Date().toISOString().slice(0, 10),
      end_date: taskForm.endDate || null,
      active: true,
      instructions: taskForm.instructions.trim() || null,
    });

    if (insertError) {
      setError(insertError.message);
      setIsSavingTask(false);
      return;
    }

    setTaskForm(emptyTaskForm);
    setIsTaskFormOpen(false);
    setIsSavingTask(false);
    setIsLoading(true);
    await loadClientProfile();
  };

  const isTaskComplete = (task: AssignedTaskRecord) => submissions.some((submission) => submission.assigned_task_id === task.id || submission.submission_type === task.task_type);

  const getSubmissionHref = (submission: SubmissionRecord) => {
    if (submission.submission_type === 'workout_session' && submission.answer_text) return `/coach/clients/${clientId}/workout-review/${submission.answer_text}`;
    return `/coach/actions/submissions/${submission.id}`;
  };

  const getNextAction = () => {
    if (snapshot.reviewsNeedingAction > 0) return 'Review latest client submission';
    if (!client?.user_id) return 'Send client invite';
    if (snapshot.workoutsScheduledThisWeek === 0) return 'Assign this week training';
    return 'Monitor delivery';
  };

  if (isLoading) return <div className="flex min-h-[400px] items-center justify-center"><p className="font-semibold text-gray-700">Loading client profile...</p></div>;

  if (error || !client) {
    return (
      <div className="p-6 md:p-8">
        <div className="py-12 text-center">
          <p className="font-semibold text-gray-600">Client not found</p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Link href="/coach/clients" className="mt-4 inline-block font-bold text-[#FA0201]">Back to Clients</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-start gap-4">
            <div>
              <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">{client.full_name}</h1>
              {client.email && <p className="mt-1 text-sm text-gray-600">{client.email}</p>}
            </div>
            <Badge variant={getStatusBadgeVariant(client.status) as any}>{client.status}</Badge>
          </div>
          <div className="flex flex-col items-end gap-2">
            {!client.user_id && (
              <button type="button" onClick={handleCreateInvite} disabled={isCreatingInvite} className="rounded-lg bg-[#FA0201] px-4 py-2 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60">
                {isCreatingInvite ? 'Creating invite...' : 'Invite Client'}
              </button>
            )}
            <Link href={`/coach/clients/${clientId}/hub-settings`} className="rounded-lg bg-black px-4 py-2 text-sm font-bold uppercase text-white hover:bg-gray-900">Hub Settings</Link>
            <Link href={`/coach/clients/${clientId}/settings`} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold uppercase text-[#000000] hover:bg-gray-100">Client Settings</Link>
            <Link href="/coach/clients" className="text-sm font-semibold uppercase text-[#FA0201] hover:underline">Back to Clients</Link>
          </div>
        </div>

        {!client.user_id && inviteLink && (
          <Card className="mt-4 border-2 border-[#FA0201]">
            <div className="space-y-3">
              <p className="text-sm font-bold uppercase text-[#000000]">Client invite link</p>
              <p className="text-sm text-gray-600">Send this link to the client. Once they create their account, this invite button will disappear from the profile.</p>
              <div className="flex flex-col gap-3 md:flex-row">
                <input readOnly value={inviteLink} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]" />
                <button type="button" onClick={handleCopyInvite} className="rounded-lg bg-black px-4 py-3 text-sm font-bold uppercase text-white hover:bg-gray-900">Copy</button>
              </div>
              {inviteMessage && <p className="text-sm font-semibold text-gray-700">{inviteMessage}</p>}
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-8">
        <div>
          <SectionHeader title="PROGRAMME" accent />
          <Card className="space-y-4">
            {programmes.length === 0 ? (
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-lg font-black uppercase text-[#000000]">No programme assigned</p>
                  <p className="mt-1 text-sm text-gray-600">Assign a programme from the Library to create editable client-specific workouts.</p>
                </div>
                <Link href={`/coach/clients/${clientId}/program#assign-from-library`} className="rounded-lg bg-[#FA0201] px-5 py-3 text-center text-sm font-bold uppercase text-white hover:bg-red-700">
                  Create client plan
                </Link>
              </div>
            ) : programmes.map((program) => (
              <ProgrammeCard key={program.id} program={program} isExpanded={expandedProgrammeIds.has(program.id)} onToggle={() => toggleProgramme(program.id)} editHref={`/coach/clients/${clientId}/program`} />
            ))}
          </Card>
        </div>

        <div>
          <SectionHeader title="CLIENT SNAPSHOT" accent />
          <Card>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-gray-500">Current week</p>
                <p className="text-sm font-semibold text-[#000000]">{formatDate(snapshot.weekStart)} → {formatDate(snapshot.weekEnd)}</p>
              </div>
              <div className="rounded-xl bg-black px-4 py-3 text-white">
                <p className="text-xs font-bold uppercase text-gray-400">Next action</p>
                <p className="text-sm font-bold uppercase">{getNextAction()}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <SnapshotMetric label="Account" value={client.user_id ? 'Linked' : 'Invite'} helper={client.user_id ? 'Client account connected' : 'Invite still needed'} />
              <SnapshotMetric label="Scheduled" value={snapshot.workoutsScheduledThisWeek} helper="Workouts this week" />
              <SnapshotMetric label="Completed" value={snapshot.workoutsCompletedThisWeek} helper={`${snapshot.workoutsRemainingThisWeek} remaining`} />
              <SnapshotMetric label="Needs review" value={snapshot.reviewsNeedingAction} helper="Open coach actions" />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase text-gray-500">Latest feedback</p>
                {snapshot.latestFeedback ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm font-bold text-[#000000]">Sent {formatDate(snapshot.latestFeedback.feedback_date)}</p>
                    <p className="text-sm text-gray-700"><span className="font-semibold">Main focus:</span> {snapshot.latestFeedback.main_focus || 'Not recorded'}</p>
                    <p className="text-sm text-gray-700"><span className="font-semibold">Agreed action:</span> {snapshot.latestFeedback.agreed_action || 'Not recorded'}</p>
                  </div>
                ) : <p className="mt-2 text-sm text-gray-600">No feedback sent yet.</p>}
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase text-gray-500">Current coaching focus</p>
                <p className="mt-2 text-sm font-semibold text-[#000000]">{client.current_focus || 'No current focus set'}</p>
                <p className="mt-2 text-sm text-gray-700"><span className="font-semibold">Next review:</span> {formatDate(client.next_review_date)}</p>
              </div>
            </div>
          </Card>
        </div>

        <div>
          <SectionHeader title="FUTURE PERFORMANCE TRACKING" accent />
          <Card>
            <ClientMetricChartDashboard clientId={clientId} />
          </Card>
        </div>

        <div>
          <SectionHeader title="TASKS" accent />
          <Card className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-bold uppercase text-[#000000]">Tasks</p>
                <p className="mt-1 text-xs font-semibold uppercase text-gray-500">Assigned tasks and recent submissions in one workflow.</p>
              </div>
              <button type="button" onClick={() => setIsTaskFormOpen((value) => !value)} className="rounded-lg bg-[#FA0201] px-4 py-2 text-sm font-bold uppercase text-white hover:bg-red-700">
                {isTaskFormOpen ? 'Close Task Form' : 'Assign Task'}
              </button>
            </div>

            {isTaskFormOpen && (
              <div className="rounded-xl border-2 border-[#FA0201] bg-white p-4">
                <form onSubmit={handleCreateTask} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <label>
                      <span className="mb-2 block text-sm font-semibold uppercase">Task type</span>
                      <select value={taskForm.taskType} onChange={(event) => setTaskForm({ ...taskForm, taskType: event.target.value })} className="w-full rounded-lg border-2 border-gray-300 px-4 py-2 text-black">
                        {taskOptions.map((task) => <option key={task.value} value={task.value}>{task.label}</option>)}
                      </select>
                    </label>
                    <label>
                      <span className="mb-2 block text-sm font-semibold uppercase">Frequency</span>
                      <select value={taskForm.frequency} onChange={(event) => setTaskForm({ ...taskForm, frequency: event.target.value })} className="w-full rounded-lg border-2 border-gray-300 px-4 py-2 text-black">
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="one_off">One-off</option>
                      </select>
                    </label>
                    <Input label="End date" type="date" value={taskForm.endDate} onChange={(event) => setTaskForm({ ...taskForm, endDate: event.target.value })} />
                  </div>
                  <label>
                    <span className="mb-2 block text-sm font-semibold uppercase">Instructions</span>
                    <textarea value={taskForm.instructions} onChange={(event) => setTaskForm({ ...taskForm, instructions: event.target.value })} rows={3} className="w-full rounded-lg border-2 border-gray-300 px-4 py-2 text-black" placeholder="Tell the client what to submit and how often." />
                  </label>
                  <button type="submit" disabled={isSavingTask} className="rounded-lg bg-black px-5 py-3 text-sm font-bold uppercase text-white hover:bg-gray-900 disabled:opacity-60">
                    {isSavingTask ? 'Assigning...' : 'Assign Task'}
                  </button>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase text-[#000000]">Assigned tasks</p>
                  <Badge variant="default">{tasks.length}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {tasks.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No active tasks assigned.</div>
                  ) : tasks.map((task) => (
                    <TaskCard key={task.id} title={task.task_name} description={`${task.frequency}${task.end_date ? ` until ${formatDate(task.end_date)}` : ''}`} completed={isTaskComplete(task)} href={`/coach/actions/tasks/${task.id}`} />
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase text-[#000000]">Recent submissions</p>
                  <Badge variant="default">{submissions.length}</Badge>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {submissions.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No recent submissions yet.</div>
                  ) : submissions.map((submission) => (
                    <Link key={submission.id} href={getSubmissionHref(submission)} className="rounded-xl border border-gray-200 bg-white p-4 hover:border-[#FA0201]">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-bold uppercase text-[#000000]">{submission.submission_type.replaceAll('_', ' ')}</p>
                          <p className="text-sm text-gray-600">Submitted {formatDate(submission.submitted_at)}</p>
                        </div>
                        <Badge variant={submission.review_status === 'reviewed' ? 'success' : 'warning'}>{submission.review_status}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
