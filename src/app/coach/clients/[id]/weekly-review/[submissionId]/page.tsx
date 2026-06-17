'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ReviewStatus = 'new' | 'reviewed' | 'needs_feedback' | 'needs_action' | 'flagged' | 'resolved';

type ClientRecord = {
  id: string;
  full_name: string;
  email: string | null;
  current_focus: string | null;
  next_review_date: string | null;
};

type SubmissionRecord = {
  id: string;
  client_id: string;
  submission_type: string;
  submitted_at: string;
  answer_value: number | null;
  answer_text: string | null;
  review_status: ReviewStatus;
  followup_required: boolean;
  coach_note: string | null;
};

type WeeklySummary = {
  rating: string;
  win: string;
  challenge: string;
  issues: string;
  helpNeeded: string;
};

type ReviewForm = {
  reviewDate: string;
  clientStatus: string;
  mainWin: string;
  mainIssue: string;
  decisionsMade: string;
  clientActions: string;
  coachActions: string;
  planChanges: string;
  nextReviewDate: string;
  privateNotes: string;
  updateClientFocus: boolean;
  newClientFocus: string;
};

type FeedbackForm = {
  mainWin: string;
  mainFocus: string;
  agreedAction: string;
  planChange: string;
  nextReviewDate: string;
};

const todayDate = () => new Date().toISOString().slice(0, 10);
const dateInDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
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

const formatStatus = (value: string) => value.replaceAll('_', ' ');

const statusVariant = (status: ReviewStatus) => {
  if (status === 'reviewed' || status === 'resolved') return 'success';
  if (status === 'needs_feedback' || status === 'needs_action') return 'warning';
  if (status === 'flagged') return 'danger';
  return 'default';
};

const parseWeeklySummary = (text: string | null, fallbackRating: number | null): WeeklySummary => {
  const summary: WeeklySummary = {
    rating: fallbackRating ? `${fallbackRating}/10` : 'Not provided',
    win: 'Not provided',
    challenge: 'Not provided',
    issues: 'Not provided',
    helpNeeded: 'Not provided',
  };

  if (!text) return summary;

  text.split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    const [label, ...rest] = line.split(':');
    const value = rest.join(':').trim() || 'Not provided';

    if (label === 'Rating') summary.rating = value;
    if (label === 'Win') summary.win = value;
    if (label === 'Challenge') summary.challenge = value;
    if (label === 'Issues') summary.issues = value;
    if (label === 'Help needed') summary.helpNeeded = value;
  });

  return summary;
};

const buildReviewForm = (client: ClientRecord, summary: WeeklySummary): ReviewForm => ({
  reviewDate: todayDate(),
  clientStatus: summary.issues !== 'Not provided' || summary.helpNeeded !== 'Not provided' ? 'needs_attention' : 'on_track',
  mainWin: summary.win === 'Not provided' ? '' : summary.win,
  mainIssue: [summary.challenge, summary.issues]
    .filter((item) => item && item !== 'Not provided')
    .join('\n'),
  decisionsMade: '',
  clientActions: '',
  coachActions: '',
  planChanges: '',
  nextReviewDate: client.next_review_date ?? dateInDays(7),
  privateNotes: '',
  updateClientFocus: true,
  newClientFocus: client.current_focus ?? '',
});

const buildFeedbackForm = (client: ClientRecord, summary: WeeklySummary): FeedbackForm => ({
  mainWin: summary.win === 'Not provided' ? '' : summary.win,
  mainFocus: summary.challenge === 'Not provided' ? '' : summary.challenge,
  agreedAction: summary.helpNeeded === 'Not provided' ? '' : summary.helpNeeded,
  planChange: '',
  nextReviewDate: client.next_review_date ?? dateInDays(7),
});

export default function CoachWeeklyReviewPage() {
  const params = useParams();
  const clientId = params.id as string;
  const submissionId = params.submissionId as string;
  const { user } = useAuth();

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [submission, setSubmission] = useState<SubmissionRecord | null>(null);
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewForm | null>(null);
  const [feedbackForm, setFeedbackForm] = useState<FeedbackForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingLog, setIsSavingLog] = useState(false);
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [isCreatingProgrammeAction, setIsCreatingProgrammeAction] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadWeeklyReview = async () => {
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
        .eq('client_id', clientId)
        .single();

      if (submissionError || !submissionData) {
        setMessage(submissionError?.message || 'Weekly check-in submission not found.');
        setIsLoading(false);
        return;
      }

      const loadedSubmission = submissionData as SubmissionRecord;
      if (loadedSubmission.submission_type !== 'weekly_checkin') {
        setMessage('This review page only supports weekly check-in submissions.');
        setIsLoading(false);
        return;
      }

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name, email, current_focus, next_review_date')
        .eq('id', clientId)
        .single();

      if (clientError || !clientData) {
        setMessage(clientError?.message || 'Client not found.');
        setIsLoading(false);
        return;
      }

      const loadedClient = clientData as ClientRecord;
      const parsedSummary = parseWeeklySummary(loadedSubmission.answer_text, loadedSubmission.answer_value);

      setClient(loadedClient);
      setSubmission(loadedSubmission);
      setSummary(parsedSummary);
      setReviewForm(buildReviewForm(loadedClient, parsedSummary));
      setFeedbackForm(buildFeedbackForm(loadedClient, parsedSummary));
      setIsLoading(false);
    };

    loadWeeklyReview();
  }, [clientId, submissionId]);

  const updateSubmissionReview = async ({
    status,
    coachNote,
    followupRequired,
  }: {
    status: ReviewStatus;
    coachNote?: string | null;
    followupRequired?: boolean;
  }) => {
    if (!submission) return { error: null };

    const supabase = createClient();
    const payload: Record<string, string | boolean | null> = {
      review_status: status,
    };

    if (coachNote !== undefined) payload.coach_note = coachNote;
    if (followupRequired !== undefined) payload.followup_required = followupRequired;

    const result = await supabase
      .from('task_submissions')
      .update(payload)
      .eq('id', submission.id)
      .eq('client_id', clientId);

    if (!result.error) {
      setSubmission({
        ...submission,
        review_status: status,
        coach_note: coachNote !== undefined ? coachNote : submission.coach_note,
        followup_required: followupRequired !== undefined ? followupRequired : submission.followup_required,
      });
    }

    return result;
  };

  const handleReviewChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setReviewForm((current) => (current ? { ...current, [name]: value } : current));
  };

  const handleFocusCheckboxChange = (event: ChangeEvent<HTMLInputElement>) => {
    setReviewForm((current) => (current ? { ...current, updateClientFocus: event.target.checked } : current));
  };

  const handleFeedbackChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFeedbackForm((current) => (current ? { ...current, [name]: value } : current));
  };

  const savePrivateReviewLog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || !reviewForm) return;

    if (!reviewForm.mainWin.trim() && !reviewForm.mainIssue.trim() && !reviewForm.decisionsMade.trim()) {
      setMessage('Add at least a main win, main issue, or decisions made.');
      return;
    }

    setIsSavingLog(true);
    setMessage(null);

    const supabase = createClient();
    const { error: logError } = await supabase.from('client_review_logs').insert({
      client_id: client.id,
      coach_id: user?.id ?? null,
      review_date: reviewForm.reviewDate,
      client_status: reviewForm.clientStatus,
      main_win: reviewForm.mainWin.trim() || null,
      main_issue: reviewForm.mainIssue.trim() || null,
      decisions_made: reviewForm.decisionsMade.trim() || null,
      client_actions: reviewForm.clientActions.trim() || null,
      coach_actions: reviewForm.coachActions.trim() || null,
      plan_changes: reviewForm.planChanges.trim() || null,
      next_review_date: reviewForm.nextReviewDate || null,
      private_notes: reviewForm.privateNotes.trim() || null,
    });

    if (logError) {
      setMessage(logError.message);
      setIsSavingLog(false);
      return;
    }

    const clientUpdate: Record<string, string | null> = {
      next_review_date: reviewForm.nextReviewDate || null,
    };

    if (reviewForm.updateClientFocus) {
      clientUpdate.current_focus = reviewForm.newClientFocus.trim() || null;
    }

    const { error: clientUpdateError } = await supabase
      .from('clients')
      .update(clientUpdate)
      .eq('id', client.id);

    if (clientUpdateError) {
      setMessage(clientUpdateError.message);
      setIsSavingLog(false);
      return;
    }

    const privateReviewNote = [
      submission?.coach_note?.trim(),
      `Weekly review log saved on ${reviewForm.reviewDate}.`,
      reviewForm.privateNotes.trim() ? `Private notes: ${reviewForm.privateNotes.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const reviewResult = await updateSubmissionReview({
      status: 'reviewed',
      coachNote: privateReviewNote || null,
      followupRequired: false,
    });

    if (reviewResult.error) {
      setMessage(reviewResult.error.message);
      setIsSavingLog(false);
      return;
    }

    setClient({
      ...client,
      next_review_date: reviewForm.nextReviewDate || null,
      current_focus: reviewForm.updateClientFocus ? reviewForm.newClientFocus.trim() || null : client.current_focus,
    });
    setMessage('Private weekly review log saved.');
    setIsSavingLog(false);
  };

  const sendWeeklyFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || !feedbackForm) return;

    if (!feedbackForm.mainWin.trim() && !feedbackForm.mainFocus.trim() && !feedbackForm.agreedAction.trim() && !feedbackForm.planChange.trim()) {
      setMessage('Add at least one client-visible feedback field.');
      return;
    }

    setIsSendingFeedback(true);
    setMessage(null);

    const supabase = createClient();
    const { error: feedbackError } = await supabase.from('feedback_notes').insert({
      client_id: client.id,
      coach_id: user?.id ?? null,
      feedback_date: todayDate(),
      main_win: feedbackForm.mainWin.trim() || null,
      main_focus: feedbackForm.mainFocus.trim() || null,
      agreed_action: feedbackForm.agreedAction.trim() || null,
      plan_change: feedbackForm.planChange.trim() || null,
      next_review_date: feedbackForm.nextReviewDate || null,
      client_visible: true,
    });

    if (feedbackError) {
      setMessage(feedbackError.message);
      setIsSendingFeedback(false);
      return;
    }

    const reviewResult = await updateSubmissionReview({
      status: 'reviewed',
      coachNote: submission?.coach_note || null,
      followupRequired: false,
    });

    if (reviewResult.error) {
      setMessage(reviewResult.error.message);
      setIsSendingFeedback(false);
      return;
    }

    setMessage('Weekly feedback sent to client.');
    setIsSendingFeedback(false);
  };

  const createProgrammeAdjustment = async () => {
    if (!client || !reviewForm) return;

    if (!reviewForm.planChanges.trim() && !reviewForm.decisionsMade.trim()) {
      setMessage('Add decisions made or plan changes before creating a programme adjustment.');
      return;
    }

    setIsCreatingProgrammeAction(true);
    setMessage(null);

    const supabase = createClient();
    const description = [
      'Programme adjustment decision from weekly review.',
      reviewForm.decisionsMade.trim() ? `Decision: ${reviewForm.decisionsMade.trim()}` : null,
      reviewForm.planChanges.trim() ? `Plan changes: ${reviewForm.planChanges.trim()}` : null,
      summary ? `Client rating: ${summary.rating}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const { error: actionError } = await supabase.from('coach_actions').insert({
      client_id: client.id,
      action_type: 'programme_adjustment',
      description,
      priority: reviewForm.clientStatus === 'at_risk' ? 'high' : 'medium',
      due_date: todayDate(),
      status: 'new',
      notes: `Created from weekly review submission. Submission ID: ${submissionId}.`,
    });

    if (actionError) {
      setMessage(actionError.message);
      setIsCreatingProgrammeAction(false);
      return;
    }

    const reviewResult = await updateSubmissionReview({
      status: 'needs_action',
      coachNote: [submission?.coach_note?.trim(), 'Programme adjustment action created from weekly review.'].filter(Boolean).join('\n') || null,
      followupRequired: true,
    });

    if (reviewResult.error) {
      setMessage(reviewResult.error.message);
      setIsCreatingProgrammeAction(false);
      return;
    }

    setMessage('Programme adjustment created. It will appear on the client Programme page.');
    setIsCreatingProgrammeAction(false);
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <Card><p className="font-semibold text-gray-700">Loading weekly review...</p></Card>
      </div>
    );
  }

  if (!submission || !client || !summary || !reviewForm || !feedbackForm) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <p className="font-bold uppercase text-[#000000]">Weekly review unavailable</p>
          {message && <p className="mt-2 text-sm text-gray-600">{message}</p>}
          <Link href="/coach/actions" className="mt-4 inline-block text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to actions</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Weekly Review</h1>
          <p className="mt-1 text-sm text-gray-600">{client.full_name}{client.email ? ` • ${client.email}` : ''}</p>
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">Check-in → coach review → feedback → next-week programme decision.</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link href={`/coach/clients/${client.id}/program`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Client programme</Link>
          <Link href={`/coach/clients/${client.id}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
          <Link href="/coach/actions" className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to actions</Link>
        </div>
      </div>

      {message && <Card><p className="text-sm font-semibold text-gray-700">{message}</p></Card>}

      <section>
        <SectionHeader title="CLIENT CHECK-IN" accent />
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(submission.review_status) as any}>{formatStatus(submission.review_status)}</Badge>
            {submission.followup_required && <Badge variant="warning">Follow-up required</Badge>}
            <span className="text-xs font-semibold uppercase text-gray-500">Submitted: {formatDateTime(submission.submitted_at)}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-bold uppercase text-gray-500">Rating</p>
              <p className="mt-1 text-lg font-black text-[#000000]">{summary.rating}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-bold uppercase text-gray-500">Win</p>
              <p className="mt-1 text-sm font-semibold text-[#000000]">{summary.win}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-bold uppercase text-gray-500">Challenge</p>
              <p className="mt-1 text-sm font-semibold text-[#000000]">{summary.challenge}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-bold uppercase text-gray-500">Pain / Issues</p>
              <p className="mt-1 text-sm font-semibold text-[#000000]">{summary.issues}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-bold uppercase text-gray-500">Help Needed</p>
              <p className="mt-1 text-sm font-semibold text-[#000000]">{summary.helpNeeded}</p>
            </div>
          </div>
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_0.9fr]">
        <section>
          <SectionHeader title="PRIVATE COACH REVIEW LOG" accent />
          <Card>
            <form onSubmit={savePrivateReviewLog} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input type="date" label="Review Date" name="reviewDate" value={reviewForm.reviewDate} onChange={handleReviewChange} required />
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Client Status</label>
                  <select name="clientStatus" value={reviewForm.clientStatus} onChange={handleReviewChange} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]">
                    <option value="on_track">On track</option>
                    <option value="needs_attention">Needs attention</option>
                    <option value="at_risk">At risk</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>
              <Textarea label="Main Win" name="mainWin" value={reviewForm.mainWin} onChange={handleReviewChange} />
              <Textarea label="Main Issue" name="mainIssue" value={reviewForm.mainIssue} onChange={handleReviewChange} />
              <Textarea label="Decisions Made" name="decisionsMade" value={reviewForm.decisionsMade} onChange={handleReviewChange} placeholder="What did you decide after reviewing this week?" />
              <Textarea label="Client Actions" name="clientActions" value={reviewForm.clientActions} onChange={handleReviewChange} placeholder="What does the client need to do next week?" />
              <Textarea label="Coach Actions" name="coachActions" value={reviewForm.coachActions} onChange={handleReviewChange} placeholder="What do you need to do after this review?" />
              <Textarea label="Plan Changes" name="planChanges" value={reviewForm.planChanges} onChange={handleReviewChange} placeholder="Training, nutrition, schedule, or task changes." />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input type="date" label="Next Review Date" name="nextReviewDate" value={reviewForm.nextReviewDate} onChange={handleReviewChange} />
                <Input label="Client Focus" name="newClientFocus" value={reviewForm.newClientFocus} onChange={handleReviewChange} placeholder="e.g. Hit 3 sessions and keep protein consistent" />
              </div>
              <label className="flex items-center gap-3 text-sm font-semibold uppercase text-gray-700">
                <input type="checkbox" checked={reviewForm.updateClientFocus} onChange={handleFocusCheckboxChange} className="h-5 w-5 rounded border-gray-300 accent-[#FA0201]" />
                Update client profile focus
              </label>
              <Textarea label="Private Notes" name="privateNotes" value={reviewForm.privateNotes} onChange={handleReviewChange} placeholder="Private context that should not be shown to the client." />
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={createProgrammeAdjustment} isLoading={isCreatingProgrammeAction}>Create programme adjustment</Button>
                <Button type="submit" isLoading={isSavingLog} className="bg-[#FA0201] hover:bg-red-700">Save review log</Button>
              </div>
            </form>
          </Card>
        </section>

        <section>
          <SectionHeader title="CLIENT WEEKLY FEEDBACK" accent />
          <Card>
            <form onSubmit={sendWeeklyFeedback} className="space-y-5">
              <Textarea label="Win" name="mainWin" value={feedbackForm.mainWin} onChange={handleFeedbackChange} placeholder="What went well this week?" />
              <Textarea label="What to improve" name="mainFocus" value={feedbackForm.mainFocus} onChange={handleFeedbackChange} placeholder="What is the one key focus?" />
              <Textarea label="Adjustment" name="agreedAction" value={feedbackForm.agreedAction} onChange={handleFeedbackChange} placeholder="What should they do next?" />
              <Textarea label="Plan Change" name="planChange" value={feedbackForm.planChange} onChange={handleFeedbackChange} placeholder="Only include client-visible changes." />
              <Input type="date" label="Next Review Date" name="nextReviewDate" value={feedbackForm.nextReviewDate} onChange={handleFeedbackChange} />
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-bold uppercase">Client-visible</p>
                <p className="mt-1">This creates a feedback note the client can see. Keep private risk, adherence, or business notes in the review log only.</p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" isLoading={isSendingFeedback} className="bg-[#FA0201] hover:bg-red-700">Send weekly feedback</Button>
              </div>
            </form>
          </Card>
        </section>
      </div>
    </div>
  );
}
