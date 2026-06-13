'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { TaskCard } from '@/components/ui/task-card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface ClientRecord {
  id: string;
  full_name: string;
  current_focus: string | null;
  next_review_date: string | null;
}

interface AssignedTaskRecord {
  id: string;
  task_name: string;
  task_type: string;
  instructions: string | null;
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

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

export default function ClientHub() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRecord | null>(null);
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

      const { data: taskData, error: taskError } = await supabase
        .from('assigned_tasks')
        .select('id, task_name, task_type, instructions, end_date')
        .eq('client_id', linkedClient.id)
        .eq('active', true)
        .order('created_at', { ascending: false });

      if (taskError) {
        setMessage(taskError.message);
        setLoading(false);
        return;
      }

      const { data: submissionData, error: submissionError } = await supabase
        .from('task_submissions')
        .select('assigned_task_id, submission_type')
        .eq('client_id', linkedClient.id)
        .order('submitted_at', { ascending: false });

      if (submissionError) {
        setMessage(submissionError.message);
        setLoading(false);
        return;
      }

      const { data: feedbackData, error: feedbackError } = await supabase
        .from('feedback_notes')
        .select('id, feedback_date, main_win, main_focus, agreed_action, plan_change, next_review_date')
        .eq('client_id', linkedClient.id)
        .eq('client_visible', true)
        .order('feedback_date', { ascending: false })
        .limit(1);

      if (feedbackError) {
        setMessage(feedbackError.message);
        setLoading(false);
        return;
      }

      setTasks((taskData ?? []) as AssignedTaskRecord[]);
      setSubmissions((submissionData ?? []) as SubmissionRecord[]);
      setFeedback((feedbackData?.[0] ?? null) as FeedbackRecord | null);
      setLoading(false);
    };

    loadHub();
  }, [user]);

  const isTaskComplete = (task: AssignedTaskRecord) => {
    return submissions.some((submission) => {
      return submission.assigned_task_id === task.id || submission.submission_type === task.task_type;
    });
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="YOUR HUB" />
        <div className="px-4 py-6 md:px-8 max-w-6xl mx-auto">
          <Card><p className="font-semibold text-gray-700">Loading your hub...</p></Card>
        </div>
      </div>
    );
  }

  if (message || !client) {
    return (
      <div>
        <PageHeader title="YOUR HUB" />
        <div className="px-4 py-6 md:px-8 max-w-6xl mx-auto">
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
      <div className="px-4 py-6 md:px-8 max-w-6xl mx-auto space-y-8">
        <section>
          <SectionHeader title="CURRENT FOCUS" accent />
          <Card variant="dark" className="p-8">
            <p className="text-white text-2xl font-bold">
              {client.current_focus || 'No current focus set'}
            </p>
            <p className="mt-4 pt-4 border-t border-gray-700 text-sm text-white opacity-75">
              Next review: {formatDate(client.next_review_date)}
            </p>
          </Card>
        </section>

        <section>
          <SectionHeader title="ASSIGNED TASKS" accent />
          <div className="space-y-4">
            {tasks.length === 0 ? (
              <Card><p className="text-sm text-gray-600">No active tasks assigned yet.</p></Card>
            ) : (
              tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  title={task.task_name}
                  description={task.instructions || task.task_type}
                  status={isTaskComplete(task) ? 'completed' : 'pending'}
                  dueDate={formatDate(task.end_date)}
                />
              ))
            )}
          </div>
        </section>

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
                  <p className="pt-3 border-t border-gray-200"><strong>Next review:</strong> {formatDate(feedback.next_review_date)}</p>
                )}
              </div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
