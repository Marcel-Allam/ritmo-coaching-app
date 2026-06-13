'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface SubmissionRecord {
  id: string;
  client_id: string;
  submission_type: string;
  submitted_at: string;
  answer_value: number | null;
  answer_text: string | null;
  review_status: string;
  followup_required: boolean;
  coach_note: string | null;
}

interface ClientRecord {
  id: string;
  full_name: string;
  email: string | null;
}

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

const formatSubmissionType = (value: string) => value.replaceAll('_', ' ');

export default function CoachSubmissionReviewPage() {
  const params = useParams();
  const submissionId = params.id as string;

  const [submission, setSubmission] = useState<SubmissionRecord | null>(null);
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [coachNote, setCoachNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  const markReviewed = async () => {
    if (!submission) return;

    setIsSaving(true);
    setMessage(null);

    const supabase = createClient();

    const { error } = await supabase
      .from('task_submissions')
      .update({
        review_status: 'reviewed',
        coach_note: coachNote.trim() || null,
      })
      .eq('id', submission.id);

    if (error) {
      setMessage(error.message);
      setIsSaving(false);
      return;
    }

    setSubmission({
      ...submission,
      review_status: 'reviewed',
      coach_note: coachNote.trim() || null,
    });
    setMessage('Submission marked as reviewed.');
    setIsSaving(false);
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
        <Badge variant={submission.review_status === 'reviewed' ? 'success' : 'default'}>
          {submission.review_status}
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
              <Button type="button" onClick={markReviewed} isLoading={isSaving}>
                Mark reviewed
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
