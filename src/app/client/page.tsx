'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { ClientDirectionMetricCards } from '@/components/client/client-direction-metric-cards';
import { TdeeSummaryCard } from '@/components/client/tdee-summary-card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = { id: string; full_name: string; current_focus: string | null; next_review_date: string | null };
type SettingsRecord = { show_today_actions_card: boolean; show_upcoming_actions_card: boolean; show_latest_feedback_card: boolean };
type TaskRecord = { id: string; task_name: string; task_type: string; instructions: string | null; start_date: string | null; end_date: string | null };
type SubmissionRecord = { assigned_task_id: string | null; submission_type: string };
type FeedbackRecord = { id: string; feedback_date: string; main_win: string | null; main_focus: string | null; agreed_action: string | null; plan_change: string | null; next_review_date: string | null };
type ActionItem = { id: string; title: string; description: string; href: string; date: string | null; state?: 'active' | 'scheduled'; statusLabel?: string };

const defaultSettings: SettingsRecord = { show_today_actions_card: true, show_upcoming_actions_card: true, show_latest_feedback_card: true };

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
};

const formatShortDate = (value: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(value));
const todayIso = () => new Date().toISOString().slice(0, 10);
const tomorrowIso = () => { const date = new Date(); date.setDate(date.getDate() + 1); return date.toISOString().slice(0, 10); };

const getTaskHref = (taskType: string) => ({
  weekly_checkin: '/client/submit/weekly-checkin',
  workout_checkin: '/client/submit/workout-checkin',
  key_lift: '/client/submit/key-lift',
  nutrition: '/client/submit/nutrition-bodyweight',
  bodyweight: '/client/submit/nutrition-bodyweight',
}[taskType] ?? '/client/check-in');

const getTaskState = (task: TaskRecord, today: string) => task.start_date && task.start_date > today ? 'scheduled' : 'active';
const getTaskStatusLabel = (task: TaskRecord, today: string) => {
  if (task.start_date && task.start_date > today) return `Next due ${formatDate(task.start_date)}`;
  if (task.end_date && task.end_date < today) return `Overdue since ${formatDate(task.end_date)}`;
  if (task.end_date && task.end_date === today) return 'Due today';
  return task.end_date ? `Due ${formatDate(task.end_date)}` : 'Assigned task';
};

const HubActionCard = ({ item }: { item: ActionItem }) => {
  const disabled = item.state === 'scheduled';
  const className = `block rounded-xl border p-4 ${disabled ? 'border-gray-200 bg-gray-100 opacity-70' : 'border-gray-200 bg-white hover:bg-gray-50'}`;
  const content = (
    <div className="flex items-start gap-3">
      <span className={`mt-1 h-3 w-3 rounded-full ${disabled ? 'bg-gray-400' : 'bg-[#FA0201]'}`} />
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold uppercase text-[#000000]">{item.title}</p>
          {item.statusLabel && <span className="rounded-full bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">{item.statusLabel}</span>}
        </div>
        <p className="mt-1 text-sm text-gray-600">{item.description}</p>
      </div>
    </div>
  );
  if (disabled) return <div className={className}>{content}</div>;
  return <Link href={item.href} className={className}>{content}</Link>;
};

export default function ClientHub() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadHub = async () => {
      if (!isSupabaseConfigured || !user) { setMessage('Account is not ready yet.'); setLoading(false); return; }
      const supabase = createClient();
      const clientResult = await supabase.from('clients').select('id, full_name, current_focus, next_review_date').eq('user_id', user.id).single();
      if (clientResult.error || !clientResult.data) { setMessage('This account is not linked to a client record yet.'); setLoading(false); return; }
      const linkedClient = clientResult.data as ClientRecord;
      setClient(linkedClient);
      const [settingsResult, taskResult, submissionResult, feedbackResult] = await Promise.all([
        supabase.from('client_settings').select('show_today_actions_card, show_upcoming_actions_card, show_latest_feedback_card').eq('client_id', linkedClient.id).maybeSingle(),
        supabase.from('assigned_tasks').select('id, task_name, task_type, instructions, start_date, end_date').eq('client_id', linkedClient.id).eq('active', true).order('created_at', { ascending: false }),
        supabase.from('task_submissions').select('assigned_task_id, submission_type').eq('client_id', linkedClient.id).order('submitted_at', { ascending: false }),
        supabase.from('feedback_notes').select('id, feedback_date, main_win, main_focus, agreed_action, plan_change, next_review_date').eq('client_id', linkedClient.id).eq('client_visible', true).order('feedback_date', { ascending: false }).limit(1),
      ]);
      const firstError = settingsResult.error || taskResult.error || submissionResult.error || feedbackResult.error;
      if (firstError) { setMessage(firstError.message); setLoading(false); return; }
      setSettings({ ...defaultSettings, ...((settingsResult.data as Partial<SettingsRecord> | null) ?? {}) });
      setTasks(((taskResult.data ?? []) as TaskRecord[]).filter((task) => task.task_type !== 'training_availability'));
      setSubmissions((submissionResult.data ?? []) as SubmissionRecord[]);
      setFeedback((feedbackResult.data?.[0] ?? null) as FeedbackRecord | null);
      setLoading(false);
    };
    loadHub();
  }, [user]);

  const isTaskComplete = (task: TaskRecord) => submissions.some((submission) => submission.assigned_task_id === task.id || submission.submission_type === task.task_type);

  const todayActions = useMemo<ActionItem[]>(() => {
    const today = todayIso();
    return tasks.filter((task) => !isTaskComplete(task) && task.end_date && task.end_date <= today).map((task) => ({
      id: task.id, title: task.task_name, description: task.instructions || task.task_type.replaceAll('_', ' '), href: getTaskHref(task.task_type), date: task.end_date, state: getTaskState(task, today), statusLabel: getTaskStatusLabel(task, today),
    }));
  }, [submissions, tasks]);

  const upcomingActions = useMemo<ActionItem[]>(() => {
    const today = todayIso();
    return tasks.filter((task) => !isTaskComplete(task) && (!task.end_date || task.end_date > today)).map((task) => ({
      id: task.id, title: task.task_name, description: task.end_date ? `${task.instructions || task.task_type.replaceAll('_', ' ')} • Due ${formatDate(task.end_date)}` : `${task.instructions || task.task_type.replaceAll('_', ' ')} • Assigned task`, href: getTaskHref(task.task_type), date: task.end_date, state: getTaskState(task, today), statusLabel: getTaskStatusLabel(task, today),
    })).sort((a, b) => {
      if (!a.date && !b.date) return a.title.localeCompare(b.title);
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }).slice(0, 8);
  }, [submissions, tasks]);

  if (loading) return <div><PageHeader title="YOUR HUB" /><div className="mx-auto max-w-6xl px-4 py-6 md:px-8"><Card><p className="font-semibold text-gray-700">Loading your hub...</p></Card></div></div>;
  if (message || !client) return <div><PageHeader title="YOUR HUB" /><div className="mx-auto max-w-6xl px-4 py-6 md:px-8"><Card><p className="font-bold uppercase text-[#000000]">Account not linked</p><p className="mt-2 text-sm text-gray-600">{message}</p></Card></div></div>;

  return (
    <div>
      <PageHeader title="YOUR HUB" subtitle={`Welcome, ${client.full_name}`} />
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 md:px-8">
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_420px]">
          <Card variant="dark" className="p-8">
            <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Current focus</p>
            <h1 className="mt-3 text-3xl font-black uppercase tracking-tight text-white">{client.current_focus || 'No current focus set'}</h1>
            <p className="mt-5 border-t border-white/20 pt-4 text-sm text-white/70">Next review: {formatDate(client.next_review_date)}</p>
          </Card>
          <TdeeSummaryCard clientId={client.id} />
        </section>

        <section>
          <SectionHeader title="YOUR DIRECTION" accent />
          <ClientDirectionMetricCards clientId={client.id} />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {settings.show_today_actions_card && <div><SectionHeader title={`TODAY - ${formatShortDate(todayIso())}`} accent /><div className="space-y-3">{todayActions.length === 0 ? <Card><p className="text-sm text-gray-600">No urgent actions today. Stay ready for your next task.</p></Card> : todayActions.map((item) => <HubActionCard key={item.id} item={item} />)}</div></div>}
          {settings.show_upcoming_actions_card && <div><SectionHeader title={`UPCOMING - FROM ${formatShortDate(tomorrowIso())}`} accent /><div className="space-y-3">{upcomingActions.length === 0 ? <Card><p className="text-sm text-gray-600">No upcoming actions assigned yet.</p></Card> : upcomingActions.map((item) => <HubActionCard key={item.id} item={item} />)}</div></div>}
        </section>

        {settings.show_latest_feedback_card && <section><SectionHeader title="LATEST FEEDBACK" accent /><Card>{!feedback ? <p className="text-sm text-gray-600">No coach feedback visible yet.</p> : <div className="space-y-4 text-sm text-gray-800"><p className="text-xs font-bold uppercase text-gray-500">{formatDate(feedback.feedback_date)}</p>{feedback.main_win && <p><strong>Main win:</strong> {feedback.main_win}</p>}{feedback.main_focus && <p><strong>Main focus:</strong> {feedback.main_focus}</p>}{feedback.agreed_action && <p><strong>Agreed action:</strong> {feedback.agreed_action}</p>}{feedback.plan_change && <p><strong>Plan change:</strong> {feedback.plan_change}</p>}{feedback.next_review_date && <p className="border-t border-gray-200 pt-3"><strong>Next review:</strong> {formatDate(feedback.next_review_date)}</p>}</div>}</Card></section>}
      </div>
    </div>
  );
}
