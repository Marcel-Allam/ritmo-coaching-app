'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { TaskCard } from '@/components/ui/task-card';
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

  useEffect(() => {
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

    loadClientProfile();
  }, [clientId]);

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
          <SectionHeader title="ASSIGNED TASKS" accent />
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
