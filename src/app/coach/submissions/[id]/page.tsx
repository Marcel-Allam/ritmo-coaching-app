'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface SubmissionRecord {
  id: string;
  client_id: string;
  submission_type: string;
  submitted_at: string;
  answer_value: number | null;
  answer_text: string | null;
  review_status: ReviewStatus;
  followup_required: boolean;
  coach_note: string | null;
}

interface ClientRecord {
  id: string;
  full_name: string;
  email: string | null;
}

type WeeklyCallOutcome = 'complete' | 'missed';
type ReviewStatus = 'new' | 'reviewed' | 'needs_feedback' | 'needs_action' | 'flagged' | 'resolved';
type ActionPriority = 'low' | 'medium' | 'high';
type CoachActionType = 'review_submission' | 'send_feedback' | 'adjust_plan' | 'check_in_client' | 'resolve_issue';

interface ActionFormState {
  actionType: CoachActionType;
  priority: ActionPriority;
  dueDate: string;
  description: string;
}

const availabilityPrompt = `Set your training days now.\n\nWhen your workouts have a clear day attached, they stop being “I’ll fit it in” and become part of the plan. Pick the days you can realistically train next week.`;

const completedCallMessage = `Good work on today’s check-in.\n\nNext step: pick the days you can realistically train next week so I can schedule your workouts around your actual week.`;

const missedCallMessage = `We missed today’s check-in call — no stress, but let’s keep the week moving.\n\nPlease pick the days you can realistically train next week so I can schedule your workouts around your actual availability. We can rearrange the call separately if needed.`;

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const todayDate = () => new Date().toISOString().slice(0, 10);

const dateInDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const formatSubmissionType = (value: string) => value.replaceAll('_', ' ');

const formatStatus = (value: string) => value.replaceAll('_', ' ');

const statusVariant = (status: ReviewStatus) => {
  if (status === 'reviewed' || status === 'resolved') return 'success';
  if (status === 'needs_feedback' || status === 'needs_action') return 'warning';
  if (status === 'flagged') return 'danger';
  return 'default';
};

const defaultActionForm: ActionFormState = {
  actionType: 'check_in_client',
  priority: 'medium',
  dueDate: todayDate(),
  description: '',
};

const suggestedActionCopy: Record<string, string> = {
  weekly_checkin: 'Review this weekly check-in and decide what needs to change before the next coaching touchpoint.',
  nutrition: 'Review nutrition adherence, identify the main bottleneck, and decide whether feedback or a plan adjustment is needed.',
  bodyweight: 'Review bodyweight trend context and decide whether to adjust calories, expectations, or follow-up questions.',
  workout_checkin: 'Review the workout notes and decide whether load, volume, or exercise selection needs adjusting.',
  key_lift: 'Review the top-set performance and decide whether progression should continue, hold, or deload.',
  training_availability: 'Use this availability to schedule the next workouts.',
};

export default function CoachSubmissionReviewPage() {
  const params = useParams();
  const submissionId = params.id as string;
  const { user } = useAuth();

  const [submission, setSubmission] = useState<SubmissionRecord | null>(null);
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [coachNote, setCoachNote] = useState('');
  const [mainWin, setMainWin] = useState('');
  const [mainFocus, setMainFocus] = useState('');
  const [agreedAction, setAgreedAction] = useState('');
  const [planChange, setPlanChange] = useState('');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [actionForm, setActionForm] = useState<ActionFormState>(defaultActionForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingReview, setIsSavingReview] = useState(false);
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [isCreatingAction, setIsCreatingAction] = useState(false);
  const [isCreatingAvailabilityTask, setIsCreatingAvailabilityTask] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const suggestedAction = useMemo(() => {
    if (!submission) return '';
    return suggestedActionCopy[submission.submission_type] ?? 'Review this submission and decide the next coach action.';
  }, [submission]);

  const loadSubmission = async () => {
    if (!isSupabaseConfigured) {
      setMessage('Supabase environment variables are not configured.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const { data: submissionData, error: submissionError } = await supabase
      .from('task_submissions')
      .select('id, client_id, submission_type, submitted_at, answer_value, answer_text, review_status, followup_required, coach_note')
      .eq('id', submissionId)
      .single();

    if (submissionError || !submissionData) {
      setMessage('Submission not found.');
      setIsLoading(false);
      return;
    }

    const loadedSubmission = submissionData as SubmissionRecord;
    setSubmission(loadedSubmission);
    setCoachNote(loadedSubmission.coach_note || '');
    setActionForm((current) => ({
      ...current,
      description: suggestedActionCopy[loadedSubmission.submission_type] ?? current.description,
    }));

    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('id, full_name, email')
      .eq('id', loadedSubmission.client_id)
      .single();

    if (!clientError && clientData) {
      setClient(clientData as ClientRecord);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    loadSubmission();
  }, [submissionId]);

  const updateSubmissionReview = async ({
    status,
    note,
    followupRequired,
  }: {
    status: ReviewStatus;
    note?: string | null;
    followupRequired?: boolean;
  }) => {
    if (!submission) return { error: null };

    const supabase = createClient();
    const payload: Record<string, string | boolean | null> = {
      review_status: status,
    };

    if (note !== undefined) payload.coach_note = note;
    if (followupRequired !== undefined) payload.followup_required = followupRequired;

    const result = await supabase
      .from('task_submissions')
      .update(payload)
      .eq('id', submission.id);

    if (!result.error) {
      setSubmission({
        ...submission,
        review_status: status,
        coach_note: note !== undefined ? note : submission.coach_note,
        followup_required: followupRequired !== undefined ? followupRequired : submission.followup_required,
      });
    }

    return result;
  };

  const markReviewed = async () => {
    if (!submission) return;

    setIsSavingReview(true);
    setMessage(null);

    const result = await updateSubmissionReview({
      status: 'reviewed',
      note: coachNote.trim() || null,
      followupRequired: false,
    });

    if (result.error) {
      setMessage(result.error.message);
      setIsSavingReview(false);
      return;
    }

    setMessage('Submission marked as reviewed.');
    setIsSavingReview(false);
  };

  const setReviewStatus = async (status: ReviewStatus) => {
    if (!submission) return;

    setIsSavingStatus(true);
    setMessage(null);

    const result = await updateSubmissionReview({
      status,
      note: coachNote.trim() || null,
      followupRequired: ['needs_feedback', 'needs_action', 'flagged'].includes(status),
    });

    if (result.error) {
      setMessage(result.error.message);
      setIsSavingStatus(false);
      return;
    }

    setMessage(`Submission set to ${formatStatus(status)}.`);
    setIsSavingStatus(false);
  };

  const createCoachAction = async () => {
    if (!submission || !client) return;

    if (!actionForm.description.trim()) {
      setMessage('Add an action description before creating an action.');
      return;
    }

    setIsCreatingAction(true);
    setMessage(null);

    const supabase = createClient();
    const actionNote = [
      `Created from ${formatSubmissionType(submission.submission_type)} submission.`,
      submission.answer_text ? `Submission summary:\n${submission.answer_text}` : null,
      coachNote.trim() ? `Private coach note:\n${coachNote.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const { error: actionError } = await supabase.from('coach_actions').insert({
      client_id: client.id,
      action_type: actionForm.actionType,
      description: actionForm.description.trim(),
      priority: actionForm.priority,
      due_date: actionForm.dueDate || null,
      status: 'new',
      notes: actionNote,
    });

    if (actionError) {
      setMessage(actionError.message);
      setIsCreatingAction(false);
      return;
    }

    const mergedCoachNote = [
      coachNote.trim(),
      `Coach action created: ${actionForm.description.trim()}`,
    ]
      .filter(Boolean)
      .join('\n');

    const result = await updateSubmissionReview({
      status: 'needs_action',
      note: mergedCoachNote || null,
      followupRequired: true,
    });

    if (result.error) {
      setMessage(result.error.message);
      setIsCreatingAction(false);
      return;
    }

    setCoachNote(mergedCoachNote);
    setActionForm(defaultActionForm);
    setMessage('Coach action created and submission moved to needs action.');
    setIsCreatingAction(false);
  };

  const createTrainingAvailabilityTask = async (outcome: WeeklyCallOutcome) => {
    if (!submission || !client) return;

    setIsCreatingAvailabilityTask(true);
    setMessage(null);

    const supabase = createClient();
    const automatedMessage = outcome === 'complete' ? completedCallMessage : missedCallMessage;
    const instructions = `${automatedMessage}\n\n${availabilityPrompt}`;
    const privateNote = outcome === 'complete'
      ? 'Weekly call completed. Training availability task sent.'
      : 'Weekly call missed. Training availability task still sent to keep momentum.';

    const { data: existingTaskData, error: existingTaskError } = await supabase
      .from('assigned_tasks')
      .select('id')
      .eq('client_id', client.id)
      .eq('task_type', 'training_availability')
      .eq('active', true)
      .limit(1);

    if (existingTaskError) {
      setMessage(existingTaskError.message);
      setIsCreatingAvailabilityTask(false);
      return;
    }

    const existingTaskId = (existingTaskData?.[0] as { id: string } | undefined)?.id;

    const taskPayload = {
      client_id: client.id,
      task_name: 'Submit training availability',
      task_type: 'training_availability',
      frequency: 'one_off',
      required: true,
      start_date: todayDate(),
      end_date: dateInDays(2),
      active: true,
      instructions,
    };

    const taskResult = existingTaskId
      ? await supabase.from('assigned_tasks').update(taskPayload).eq('id', existingTaskId)
      : await supabase.from('assigned_tasks').insert(taskPayload);

    if (taskResult.error) {
      setMessage(taskResult.error.message);
      setIsCreatingAvailabilityTask(false);
      return;
    }

    const mergedCoachNote = [coachNote.trim(), privateNote].filter(Boolean).join('\n');
    const reviewResult = await updateSubmissionReview({
      status: 'reviewed',
      note: mergedCoachNote || null,
      followupRequired: false,
    });

    if (reviewResult.error) {
      setMessage(reviewResult.error.message);
      setIsCreatingAvailabilityTask(false);
      return;
    }

    setCoachNote(mergedCoachNote);
    setMessage(outcome === 'complete'
      ? 'Weekly call marked complete. Training availability task sent to client.'
      : 'Weekly call marked missed. Training availability task still sent to client.'
    );
    setIsCreatingAvailabilityTask(false);
  };

  const sendFeedback = async () => {
    if (!submission || !client) return;

    if (!mainWin.trim() && !mainFocus.trim() && !agreedAction.trim() && !planChange.trim()) {
      setMessage('Add at least one feedback field before sending.');
      return;
    }

    setIsSendingFeedback(true);
    setMessage(null);

    const supabase = createClient();

    const { error: feedbackError } = await supabase.from('feedback_notes').insert({
      client_id: client.id,
      coach_id: user?.id ?? null,
      feedback_date: todayDate(),
      main_win: mainWin.trim() || null,
      main_focus: mainFocus.trim() || null,
      agreed_action: agreedAction.trim() || null,
      plan_change: planChange.trim() || null,
      next_review_date: nextReviewDate || null,
      client_visible: true,
    });

    if (feedbackError) {
      setMessage(feedbackError.message);
      setIsSendingFeedback(false);
      return;
    }

    const result = await updateSubmissionReview({
      status: 'reviewed',
      note: coachNote.trim() || null,
      followupRequired: false,
    });

    if (result.error) {
      setMessage(result.error.message);
      setIsSendingFeedback(false);
      return;
    }

    setMainWin('');
    setMainFocus('');
    setAgreedAction('');
    setPlanChange('');
    setNextReviewDate('');
    setMessage('Feedback sent to client and submission marked as reviewed.');
    setIsSendingFeedback(false);
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <p className="font-semibold text-gray-700">Loading submission...</p>
        </Card>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <p className="font-bold uppercase text-[#000000]">Submission not found</p>
          {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}
          <Link href="/coach/clients" className="mt-4 inline-block text-sm font-bold uppercase text-[#FA0201]">
            Back to clients
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold uppercase text-[#000000] tracking-tight">
            {formatSubmissionType(submission.submission_type)}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            {client?.full_name || 'Client'} - {formatDate(submission.submitted_at)}
          </p>
        </div>
        <Badge variant={statusVariant(submission.review_status) as any}>
          {formatStatus(submission.review_status)}
        </Badge>
      </div>

      <div className="space-y-8">
        <div>
          <SectionHeader title="SUBMISSION SUMMARY" accent />
          <Card>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm mb-6">
              <div>
                <p className="text-xs font-bold uppercase text-gray-500">Client</p>
                <p className="mt-1 text-gray-800">{client?.full_name || 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-gray-500">Rating / Value</p>
                <p className="mt-1 text-gray-800">{submission.answer_value ?? 'Not set'}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-gray-500">Follow-up Required</p>
                <p className="mt-1 text-gray-800">{submission.followup_required ? 'Yes' : 'No'}</p>
              </div>
            </div>

            <div className="rounded-lg bg-gray-100 p-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
                {submission.answer_text || 'No written answers saved.'}
              </pre>
            </div>
          </Card>
        </div>

        <div>
          <SectionHeader title="REVIEW DECISION" accent />
          <Card>
            <p className="mb-4 text-sm text-gray-700">
              Decide what this submission needs. This keeps the queue useful without forcing a full feedback note every time.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <Button type="button" variant="outline" isLoading={isSavingStatus} onClick={() => setReviewStatus('needs_feedback')}>
                Needs feedback
              </Button>
              <Button type="button" variant="outline" isLoading={isSavingStatus} onClick={() => setReviewStatus('needs_action')}>
                Needs action
              </Button>
              <Button type="button" variant="outline" isLoading={isSavingStatus} onClick={() => setReviewStatus('flagged')}>
                Flag
              </Button>
              <Button type="button" variant="outline" isLoading={isSavingStatus} onClick={() => setReviewStatus('resolved')}>
                Resolve
              </Button>
            </div>
          </Card>
        </div>

        <div>
          <SectionHeader title="CREATE COACH ACTION" accent />
          <Card>
            <p className="mb-4 text-sm text-gray-700">
              Turn this submission into a clear action in the coach action queue. Use this when a submission needs more than simple review.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Action Type</label>
                <select
                  value={actionForm.actionType}
                  onChange={(event) => setActionForm((current) => ({ ...current, actionType: event.target.value as CoachActionType }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                >
                  <option value="check_in_client">Check in client</option>
                  <option value="send_feedback">Send feedback</option>
                  <option value="adjust_plan">Adjust plan</option>
                  <option value="resolve_issue">Resolve issue</option>
                  <option value="review_submission">Review submission</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Priority</label>
                <select
                  value={actionForm.priority}
                  onChange={(event) => setActionForm((current) => ({ ...current, priority: event.target.value as ActionPriority }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Due Date</label>
                <input
                  type="date"
                  value={actionForm.dueDate}
                  onChange={(event) => setActionForm((current) => ({ ...current, dueDate: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Action Description</label>
              <textarea
                value={actionForm.description || suggestedAction}
                onChange={(event) => setActionForm((current) => ({ ...current, description: event.target.value }))}
                className="min-h-28 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
              />
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={createCoachAction} isLoading={isCreatingAction} className="bg-[#FA0201] hover:bg-red-700">
                Create action
              </Button>
            </div>
          </Card>
        </div>

        {submission.submission_type === 'weekly_checkin' && (
          <div>
            <SectionHeader title="WEEKLY CALL OUTCOME" accent />
            <Card>
              <p className="mb-4 text-sm text-gray-700">
                Use this after the weekly review call. Both options send the client a training availability task for the week ahead.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={() => createTrainingAvailabilityTask('complete')}
                  isLoading={isCreatingAvailabilityTask}
                  className="bg-[#FA0201] hover:bg-red-700"
                >
                  Mark call complete + send availability task
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => createTrainingAvailabilityTask('missed')}
                  isLoading={isCreatingAvailabilityTask}
                >
                  Mark call missed + send availability task
                </Button>
              </div>
            </Card>
          </div>
        )}

        {submission.submission_type === 'training_availability' && client && (
          <div>
            <SectionHeader title="SCHEDULE WORKOUTS" accent />
            <Card>
              <p className="mb-4 text-sm text-gray-700">
                Use this availability to assign created workouts to the client’s real training days.
              </p>
              <Link href={`/coach/clients/${client.id}/schedule-workouts`}>
                <Button type="button" className="bg-[#FA0201] hover:bg-red-700">
                  Schedule workouts
                </Button>
              </Link>
            </Card>
          </div>
        )}

        <div>
          <SectionHeader title="COACH REVIEW" accent />
          <Card>
            {message && <p className="mb-4 text-sm font-semibold text-gray-700">{message}</p>}
            <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Private Coach Note</label>
            <textarea
              value={coachNote}
              onChange={(event) => setCoachNote(event.target.value)}
              placeholder="Add your private review note here."
              className="min-h-32 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
            />
            <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-end">
              <Link href={client ? `/coach/clients/${client.id}` : '/coach/clients'}>
                <Button type="button" variant="outline">
                  Back to client
                </Button>
              </Link>
              <Button type="button" onClick={markReviewed} isLoading={isSavingReview}>
                Mark reviewed
              </Button>
            </div>
          </Card>
        </div>

        <div>
          <SectionHeader title="SEND FEEDBACK TO CLIENT" accent />
          <Card>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Main Win</label>
                <textarea value={mainWin} onChange={(event) => setMainWin(event.target.value)} className="min-h-20 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Main Focus</label>
                <textarea value={mainFocus} onChange={(event) => setMainFocus(event.target.value)} className="min-h-20 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Agreed Action</label>
                <textarea value={agreedAction} onChange={(event) => setAgreedAction(event.target.value)} className="min-h-20 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Plan Change</label>
                <textarea value={planChange} onChange={(event) => setPlanChange(event.target.value)} className="min-h-20 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Next Review Date</label>
                <input type="date" value={nextReviewDate} onChange={(event) => setNextReviewDate(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm" />
              </div>
              <div className="flex justify-end">
                <Button type="button" onClick={sendFeedback} isLoading={isSendingFeedback}>
                  Send feedback
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
