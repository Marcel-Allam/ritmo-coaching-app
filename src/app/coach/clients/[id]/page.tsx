'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { TaskCard } from '@/components/ui/task-card';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  main_win: string | null;
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

const emptyTaskForm = {
  taskName: '',
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

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const getStatusBadgeVariant = (status: string) => {
  return status === 'active' ? 'success' : 'warning';
};

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

const SnapshotMetric = ({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-black text-[#000000]">{value}</p>
    <p className="mt-1 text-xs font-semibold text-gray-600">{helper}</p>
  </div>
);

const FutureAnalyticsCard = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4">
    <div className="mb-3 h-24 rounded-lg bg-white/70 p-3">
      <div className="h-2 w-2/3 rounded bg-gray-300" />
      <div className="mt-4 flex h-12 items-end gap-2">
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-8 w-full rounded bg-gray-300" />
        <div className="h-6 w-full rounded bg-gray-200" />
        <div className="h-10 w-full rounded bg-gray-300" />
        <div className="h-7 w-full rounded bg-gray-200" />
      </div>
    </div>
    <p className="text-sm font-bold uppercase text-[#000000]">{title}</p>
    <p className="mt-1 text-xs text-gray-600">{description}</p>
    <p className="mt-3 inline-block rounded bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">
      Future interactive graph
    </p>
  </div>
);

export default function ClientProfilePage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [snapshot, setSnapshot] = useState<ClientSnapshot>(emptySnapshot);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const loadClientProfile = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();
    const weekRange = getCurrentWeekRange();

    const [
      clientResult,
      tasksResult,
      submissionsResult,
      scheduledWorkoutsResult,
      completedWorkoutsResult,
      reviewCountResult,
      latestFeedbackResult,
    ] = await Promise.all([
      supabase
        .from('clients')
        .select('id, full_name, email, user_id, status, current_focus, next_review_date, next_call_date, start_date')
        .eq('id', clientId)
        .single(),
      supabase
        .from('assigned_tasks')
        .select('id, task_name, task_type, frequency, instructions, active, end_date')
        .eq('client_id', clientId)
        .eq('active', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('task_submissions')
        .select('id, assigned_task_id, submission_type, submitted_at, review_status, answer_text')
        .eq('client_id', clientId)
        .order('submitted_at', { ascending: false })
        .limit(5),
      supabase
        .from('program_workouts')
        .select('id, scheduled_date, status')
        .eq('client_id', clientId)
        .neq('status', 'archived')
        .not('scheduled_date', 'is', null)
        .gte('scheduled_date', weekRange.weekStartDate)
        .lte('scheduled_date', weekRange.weekEndDate),
      supabase
        .from('workout_sessions')
        .select('id, status, completed_at')
        .eq('client_id', clientId)
        .eq('status', 'completed')
        .gte('completed_at', weekRange.weekStartTimestamp)
        .lte('completed_at', weekRange.weekEndTimestamp),
      supabase
        .from('task_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .neq('review_status', 'reviewed'),
      supabase
        .from('feedback_notes')
        .select('feedback_date, main_win, main_focus, agreed_action, next_review_date')
        .eq('client_id', clientId)
        .order('feedback_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    if (clientResult.error) {
      setError(clientResult.error.message);
      setIsLoading(false);
      return;
    }

    if (tasksResult.error) {
      setError(tasksResult.error.message);
      setIsLoading(false);
      return;
    }

    if (submissionsResult.error) {
      setError(submissionsResult.error.message);
      setIsLoading(false);
      return;
    }

    if (scheduledWorkoutsResult.error) {
      setError(scheduledWorkoutsResult.error.message);
      setIsLoading(false);
      return;
    }

    if (completedWorkoutsResult.error) {
      setError(completedWorkoutsResult.error.message);
      setIsLoading(false);
      return;
    }

    if (reviewCountResult.error) {
      setError(reviewCountResult.error.message);
      setIsLoading(false);
      return;
    }

    if (latestFeedbackResult.error) {
      setError(latestFeedbackResult.error.message);
      setIsLoading(false);
      return;
    }

    const workoutsScheduledThisWeek = scheduledWorkoutsResult.data?.length ?? 0;
    const workoutsCompletedThisWeek = completedWorkoutsResult.data?.length ?? 0;
    const workoutsRemainingThisWeek = Math.max(workoutsScheduledThisWeek - workoutsCompletedThisWeek, 0);

    setClient(clientResult.data as ClientRecord);
    setTasks((tasksResult.data ?? []) as AssignedTaskRecord[]);
    setSubmissions((submissionsResult.data ?? []) as SubmissionRecord[]);
    setSnapshot({
      weekStart: weekRange.weekStartDate,
      weekEnd: weekRange.weekEndDate,
      workoutsScheduledThisWeek,
      workoutsCompletedThisWeek,
      workoutsRemainingThisWeek,
      reviewsNeedingAction: reviewCountResult.count ?? 0,
      latestFeedback: ((latestFeedbackResult.data ?? [])[0] as LatestFeedbackRecord | undefined) ?? null,
    });
    setIsLoading(false);
  };

  useEffect(() => {
    loadClientProfile();
  }, [clientId]);

  const handleCreateInvite = async () => {
    if (!isSupabaseConfigured || !client) return;

    setIsCreatingInvite(true);
    setInviteMessage(null);
    setError(null);

    const supabase = createClient();
    const { data: token, error: inviteError } = await supabase.rpc('generate_client_invite', {
      p_client_id: client.id,
    });

    if (inviteError || !token) {
      setError(inviteError?.message || 'Could not create invite link.');
      setIsCreatingInvite(false);
      return;
    }

    const link = `${window.location.origin}/invite/${token as string}`;
    setInviteLink(link);
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

    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      return;
    }

    if (!taskForm.taskName.trim()) {
      setError('Task name is required.');
      return;
    }

    setIsSavingTask(true);
    setError(null);

    const supabase = createClient();

    const { error: insertError } = await supabase.from('assigned_tasks').insert({
      client_id: clientId,
      task_name: taskForm.taskName.trim(),
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

  const isTaskComplete = (task: AssignedTaskRecord) => {
    return submissions.some((submission) => {
      return submission.assigned_task_id === task.id || submission.submission_type === task.task_type;
    });
  };

  const getSubmissionHref = (submission: SubmissionRecord) => {
    if (submission.submission_type === 'workout_session' && submission.answer_text) {
      return `/coach/clients/${clientId}/workout-history?session=${submission.answer_text}`;
    }
    return `/coach/submissions/${submission.id}`;
  };

  const getNextAction = () => {
    if (!client?.user_id) return 'Invite client to create their account';
    if (snapshot.reviewsNeedingAction > 0) return 'Review latest client submission';
    if (snapshot.workoutsScheduledThisWeek === 0) return 'Schedule this week\'s training';
    if (snapshot.workoutsRemainingThisWeek > 0) return 'Monitor remaining scheduled workouts';
    return 'Send feedback or plan next progression';
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="font-semibold text-gray-700">Loading client profile...</p>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="p-6 md:p-8">
        <div className="text-center py-12">
          <p className="text-gray-600 font-semibold">Client not found</p>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <Link href="/coach/clients" className="text-[#FA0201] font-bold mt-4 inline-block">
            Back to Clients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-start gap-4">
            <div>
              <h1 className="text-3xl font-bold uppercase text-[#000000] tracking-tight">
                {client.full_name}
              </h1>
              {client.email && (
                <p className="text-sm text-gray-600 mt-1">{client.email}</p>
              )}
            </div>
            <Badge variant={getStatusBadgeVariant(client.status) as any}>
              {client.status}
            </Badge>
          </div>
          <div className="flex flex-col items-end gap-2">
            {!client.user_id && (
              <button
                type="button"
                onClick={handleCreateInvite}
                disabled={isCreatingInvite}
                className="rounded-lg bg-[#FA0201] px-4 py-2 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isCreatingInvite ? 'Creating invite...' : 'Invite Client'}
              </button>
            )}
            <Link
              href="/coach/clients"
              className="text-sm font-semibold text-[#FA0201] uppercase hover:underline"
            >
              Back to Clients
            </Link>
          </div>
        </div>

        {!client.user_id && inviteLink && (
          <Card className="mt-4 border-2 border-[#FA0201]">
            <div className="space-y-3">
              <p className="text-sm font-bold uppercase text-[#000000]">Client invite link</p>
              <p className="text-sm text-gray-600">Send this link to the client. Once they create their account, this invite button will disappear from the profile.</p>
              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  readOnly
                  value={inviteLink}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                />
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="rounded-lg bg-black px-4 py-3 text-sm font-bold uppercase text-white hover:bg-gray-900"
                >
                  Copy
                </button>
              </div>
              {inviteMessage && <p className="text-sm font-semibold text-gray-700">{inviteMessage}</p>}
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-8">
        <div>
          <SectionHeader title="CLIENT SNAPSHOT" accent />
          <Card>
            <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-gray-500">Current week</p>
                <p className="text-sm font-semibold text-[#000000]">
                  {formatDate(snapshot.weekStart)} → {formatDate(snapshot.weekEnd)}
                </p>
              </div>
              <div className="rounded-xl bg-black px-4 py-3 text-white">
                <p className="text-xs font-bold uppercase text-gray-400">Next action</p>
                <p className="text-sm font-bold uppercase">{getNextAction()}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <SnapshotMetric
                label="Account"
                value={client.user_id ? 'Linked' : 'Invite'}
                helper={client.user_id ? 'Client account connected' : 'Invite still needed'}
              />
              <SnapshotMetric
                label="Scheduled"
                value={snapshot.workoutsScheduledThisWeek}
                helper="Workouts this week"
              />
              <SnapshotMetric
                label="Completed"
                value={snapshot.workoutsCompletedThisWeek}
                helper={`${snapshot.workoutsRemainingThisWeek} remaining`}
              />
              <SnapshotMetric
                label="Needs review"
                value={snapshot.reviewsNeedingAction}
                helper="Open coach actions"
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase text-gray-500">Latest feedback</p>
                {snapshot.latestFeedback ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm font-bold text-[#000000]">Sent {formatDate(snapshot.latestFeedback.feedback_date)}</p>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Main focus:</span>{' '}
                      {snapshot.latestFeedback.main_focus || 'Not recorded'}
                    </p>
                    <p className="text-sm text-gray-700">
                      <span className="font-semibold">Agreed action:</span>{' '}
                      {snapshot.latestFeedback.agreed_action || 'Not recorded'}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-600">No feedback sent yet.</p>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase text-gray-500">Current coaching focus</p>
                <p className="mt-2 text-sm font-semibold text-[#000000]">
                  {client.current_focus || 'No current focus set'}
                </p>
                <p className="mt-2 text-sm text-gray-700">
                  <span className="font-semibold">Next review:</span> {formatDate(client.next_review_date)}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div>
          <SectionHeader title="FUTURE PERFORMANCE TRACKING" accent />
          <Card>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <FutureAnalyticsCard
                title="Exercise progress"
                description="Interactive lift-specific graphs for load, reps, estimated strength, and progression history."
              />
              <FutureAnalyticsCard
                title="Volume trend"
                description="Weekly hard sets, total load, and training density by muscle group or movement pattern."
              />
              <FutureAnalyticsCard
                title="Bodyweight trend"
                description="Client bodyweight, adherence, and nutrition trend overlays for coaching decisions."
              />
              <FutureAnalyticsCard
                title="Performance timeline"
                description="Major PRs, missed sessions, pain reports, and coach feedback shown as a single timeline."
              />
            </div>
          </Card>
        </div>

        <div>
          <SectionHeader title="CURRENT FOCUS" accent />
          <Card variant="dark">
            <p className="text-white text-lg">
              {client.current_focus || 'No current focus set'}
            </p>
          </Card>
        </div>

        <div>
          <SectionHeader title="CLIENT DETAILS" accent />
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
              <div>
                <p className="text-xs font-bold uppercase text-gray-500">Start Date</p>
                <p className="mt-1 text-gray-800">{formatDate(client.start_date)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-gray-500">Next Review</p>
                <p className="mt-1 text-gray-800">{formatDate(client.next_review_date)}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-gray-500">Next Call</p>
                <p className="mt-1 text-gray-800">{formatDate(client.next_call_date)}</p>
              </div>
            </div>
          </Card>
        </div>

        <div>
          <div className="flex items-start justify-between gap-4">
            <SectionHeader title="ASSIGNED TASKS" accent />
            <div className="mb-4 flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => setIsTaskFormOpen(true)}
                className="rounded-lg bg-[#FA0201] px-4 py-2 text-sm font-bold uppercase text-white hover:bg-red-700"
              >
                Assign Task
              </button>
              <Link
                href={`/coach/clients/${clientId}/training`}
                className="rounded-lg bg-black px-4 py-2 text-sm font-bold uppercase text-white hover:bg-gray-900"
              >
                Create Workout
              </Link>
              <Link
                href={`/coach/clients/${clientId}/current-workouts`}
                className="rounded-lg bg-white px-4 py-2 text-sm font-bold uppercase text-[#000000] border border-gray-300 hover:bg-gray-100"
              >
                Current Workouts
              </Link>
              <Link
                href={`/coach/clients/${clientId}/schedule-workouts`}
                className="rounded-lg bg-[#FA0201] px-4 py-2 text-sm font-bold uppercase text-white hover:bg-red-700"
              >
                Schedule Workouts
              </Link>
              <Link
                href={`/coach/clients/${clientId}/workout-history`}
                className="rounded-lg bg-white px-4 py-2 text-sm font-bold uppercase text-[#000000] border border-gray-300 hover:bg-gray-100"
              >
                Workout History
              </Link>
            </div>
          </div>

          {isTaskFormOpen && (
            <Card className="mb-4 border-2 border-[#FA0201]">
              <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Task Name</label>
                  <Input
                    value={taskForm.taskName}
                    onChange={(event) => setTaskForm((current) => ({ ...current, taskName: event.target.value }))}
                    placeholder="e.g. Weekly check-in"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Task Type</label>
                  <select
                    value={taskForm.taskType}
                    onChange={(event) => setTaskForm((current) => ({ ...current, taskType: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                  >
                    <option value="weekly_checkin">Weekly check-in</option>
                    <option value="training_availability">Training availability</option>
                    <option value="workout_checkin">Workout check-in</option>
                    <option value="key_lift">Key lift / top set</option>
                    <option value="nutrition">Nutrition submission</option>
                    <option value="bodyweight">Bodyweight</option>
                    <option value="progress_photo">Progress photo</option>
                    <option value="habit_check">Habit check</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Frequency</label>
                  <select
                    value={taskForm.frequency}
                    onChange={(event) => setTaskForm((current) => ({ ...current, frequency: event.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="per_workout">Per workout</option>
                    <option value="one_off">One-off</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Due / End Date</label>
                  <Input
                    type="date"
                    value={taskForm.endDate}
                    onChange={(event) => setTaskForm((current) => ({ ...current, endDate: event.target.value }))}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Instructions</label>
                  <textarea
                    value={taskForm.instructions}
                    onChange={(event) => setTaskForm((current) => ({ ...current, instructions: event.target.value }))}
                    placeholder="Add the exact instruction the client should follow."
                    className="min-h-24 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                  />
                </div>

                <div className="md:col-span-2 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsTaskFormOpen(false)}
                    className="rounded-lg bg-gray-200 px-5 py-3 text-sm font-bold uppercase text-[#000000] hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingTask}
                    className="rounded-lg bg-[#FA0201] px-5 py-3 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {isSavingTask ? 'Saving...' : 'Save Task'}
                  </button>
                </div>
              </form>
            </Card>
          )}

          <div className="space-y-4">
            {tasks.length === 0 ? (
              <Card>
                <p className="text-sm text-gray-600">No active tasks assigned.</p>
              </Card>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  title={task.task_name}
                  description={task.instructions || `${task.frequency} ${task.task_type}`}
                  status={isTaskComplete(task) ? 'completed' : 'pending'}
                  dueDate={formatDate(task.end_date)}
                />
              ))
            )}
          </div>
        </div>

        <div>
          <SectionHeader title="RECENT SUBMISSIONS" accent />
          <Card>
            {submissions.length === 0 ? (
              <p className="text-sm text-gray-600">No submissions yet.</p>
            ) : (
              <div className="space-y-4">
                {submissions.map((submission) => (
                  <Link key={submission.id} href={getSubmissionHref(submission)} className="block border-b border-gray-200 pb-4 last:border-b-0 last:pb-0 hover:bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold uppercase text-[#000000]">{submission.submission_type.replaceAll('_', ' ')}</p>
                        <p className="mt-1 text-xs text-gray-500">{formatDate(submission.submitted_at)}</p>
                      </div>
                      <Badge variant={submission.review_status === 'reviewed' ? 'success' : 'default'}>
                        {submission.review_status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
