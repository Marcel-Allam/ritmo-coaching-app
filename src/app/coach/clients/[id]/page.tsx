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
  submission_type: string;
  submitted_at: string;
  review_status: string;
}

const emptyTaskForm = {
  taskName: '',
  taskType: 'weekly_checkin',
  frequency: 'weekly',
  endDate: '',
  instructions: '',
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

export default function ClientProfilePage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);

  const loadClientProfile = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const [clientResult, tasksResult, submissionsResult] = await Promise.all([
      supabase
        .from('clients')
        .select('id, full_name, email, status, current_focus, next_review_date, next_call_date, start_date')
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
        .select('id, submission_type, submitted_at, review_status')
        .eq('client_id', clientId)
        .order('submitted_at', { ascending: false })
        .limit(5),
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

    setClient(clientResult.data as ClientRecord);
    setTasks((tasksResult.data ?? []) as AssignedTaskRecord[]);
    setSubmissions((submissionsResult.data ?? []) as SubmissionRecord[]);
    setIsLoading(false);
  };

  useEffect(() => {
    loadClientProfile();
  }, [clientId]);

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
          <Link
            href="/coach/clients"
            className="text-sm font-semibold text-[#FA0201] uppercase hover:underline"
          >
            Back to Clients
          </Link>
        </div>
      </div>

      <div className="space-y-8">
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
          <div className="flex items-center justify-between gap-4">
            <SectionHeader title="ASSIGNED TASKS" accent />
            <button
              type="button"
              onClick={() => setIsTaskFormOpen(true)}
              className="mb-4 rounded-lg bg-[#FA0201] px-4 py-2 text-sm font-bold uppercase text-white hover:bg-red-700"
            >
              Assign Task
            </button>
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
                <p className="text-sm text-gray-600">No active tasks assigned yet.</p>
              </Card>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  title={task.task_name}
                  description={task.instructions || task.task_type}
                  status="pending"
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
              <p className="text-sm text-gray-600">No recent submissions yet.</p>
            ) : (
              <div className="space-y-4">
                {submissions.map((submission) => (
                  <div
                    key={submission.id}
                    className="flex items-center justify-between pb-4 border-b border-gray-200 last:border-b-0 last:pb-0"
                  >
                    <div>
                      <p className="font-bold text-sm uppercase text-[#000000]">
                        {submission.submission_type.replaceAll('_', ' ')}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDate(submission.submitted_at)}
                      </p>
                    </div>
                    <Badge variant="default">{submission.review_status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
