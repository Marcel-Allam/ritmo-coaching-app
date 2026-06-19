'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { TaskCard } from '@/components/ui/task-card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface ClientRecord {
  id: string;
  full_name: string;
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
  review_status: string;
}

type FilterStatus = 'all' | 'pending' | 'in-progress' | 'completed';
type TaskStatus = 'pending' | 'in-progress' | 'completed';

const taskRoutes: Record<string, string> = {
  weekly_checkin: '/client/submit/weekly-checkin',
  workout_checkin: '/client/submit/workout-checkin',
  key_lift: '/client/submit/key-lift',
  nutrition: '/client/submit/nutrition-bodyweight',
  bodyweight: '/client/submit/nutrition-bodyweight',
};

const formatDate = (value: string | null) => {
  if (!value) return 'No deadline';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

export default function TasksPage() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadTasks = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Account is not ready yet.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        setMessage('This account is not linked to a client record yet.');
        setLoading(false);
        return;
      }

      const linkedClient = clientData as ClientRecord;
      setClient(linkedClient);

      const [taskResult, submissionResult] = await Promise.all([
        supabase
          .from('assigned_tasks')
          .select('id, task_name, task_type, frequency, instructions, active, end_date')
          .eq('client_id', linkedClient.id)
          .eq('active', true)
          .order('created_at', { ascending: false }),
        supabase
          .from('task_submissions')
          .select('id, assigned_task_id, submission_type, review_status')
          .eq('client_id', linkedClient.id),
      ]);

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

      setTasks(((taskResult.data ?? []) as AssignedTaskRecord[]).filter((task) => task.task_type !== 'training_availability'));
      setSubmissions((submissionResult.data ?? []) as SubmissionRecord[]);
      setLoading(false);
    };

    loadTasks();
  }, [user]);

  const getTaskStatus = (task: AssignedTaskRecord): TaskStatus => {
    const submitted = submissions.some((submission) => (
      submission.assigned_task_id === task.id || submission.submission_type === task.task_type
    ));

    return submitted ? 'completed' : 'pending';
  };

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'all') return true;
    return getTaskStatus(task) === filter;
  });

  const filterOptions: { label: string; value: FilterStatus }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'In Progress', value: 'in-progress' },
    { label: 'Completed', value: 'completed' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <PageHeader title="YOUR TASKS" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto">
            <p className="font-semibold text-gray-700">Loading tasks...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="YOUR TASKS" subtitle={client ? `For ${client.full_name}` : undefined} />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto">
          {message && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
              <p className="text-sm font-semibold text-gray-700">{message}</p>
            </div>
          )}

          <div className="mb-8 flex gap-2 flex-wrap">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-4 py-2 rounded-lg font-bold uppercase text-sm transition-colors ${
                  filter === option.value
                    ? 'bg-[#FA0201] text-white'
                    : 'bg-white border-2 border-gray-300 text-black hover:border-[#FA0201]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="space-y-4 pb-8">
            {filteredTasks.length > 0 ? (
              filteredTasks.map((task) => {
                const href = taskRoutes[task.task_type] || '/client/submit';
                const status = getTaskStatus(task);

                return (
                  <Link key={task.id} href={href} className="block">
                    <TaskCard
                      title={task.task_name}
                      description={task.instructions || task.task_type.replaceAll('_', ' ')}
                      status={status}
                      dueDate={formatDate(task.end_date)}
                    />
                  </Link>
                );
              })
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg font-semibold uppercase">
                  No tasks with this status
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
