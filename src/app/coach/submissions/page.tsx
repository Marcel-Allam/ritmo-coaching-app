'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface SubmissionRecord {
  id: string;
  client_id: string;
  submission_type: string;
  submitted_at: string;
  answer_value: number | null;
  review_status: string;
  followup_required: boolean;
}

interface ClientRecord {
  id: string;
  full_name: string;
}

const formatDate = (value: string) => {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const formatSubmissionType = (value: string) => value.replaceAll('_', ' ');

const statusVariant = (status: string) => {
  return status === 'reviewed' ? 'success' : 'default';
};

export default function CoachSubmissionsPage() {
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadSubmissions = async () => {
      if (!isSupabaseConfigured) {
        setMessage('Supabase environment variables are not configured.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();

      const { data: submissionData, error: submissionError } = await supabase
        .from('task_submissions')
        .select('id, client_id, submission_type, submitted_at, answer_value, review_status, followup_required')
        .order('submitted_at', { ascending: false })
        .limit(50);

      if (submissionError) {
        setMessage(submissionError.message);
        setIsLoading(false);
        return;
      }

      const loadedSubmissions = (submissionData ?? []) as SubmissionRecord[];
      setSubmissions(loadedSubmissions);

      const clientIds = Array.from(new Set(loadedSubmissions.map((submission) => submission.client_id)));

      if (clientIds.length > 0) {
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('id, full_name')
          .in('id', clientIds);

        if (clientError) {
          setMessage(clientError.message);
          setIsLoading(false);
          return;
        }

        const clientMap = ((clientData ?? []) as ClientRecord[]).reduce<Record<string, string>>((current, client) => {
          current[client.id] = client.full_name;
          return current;
        }, {});

        setClients(clientMap);
      }

      setIsLoading(false);
    };

    loadSubmissions();
  }, []);

  const newSubmissions = submissions.filter((submission) => submission.review_status !== 'reviewed');
  const reviewedSubmissions = submissions.filter((submission) => submission.review_status === 'reviewed');

  const renderSubmission = (submission: SubmissionRecord) => {
    return (
      <Link
        key={submission.id}
        href={`/coach/submissions/${submission.id}`}
        className="block rounded-lg hover:bg-gray-50"
      >
        <div className="flex items-center justify-between gap-4 border-b border-gray-200 py-4 last:border-b-0">
          <div>
            <p className="font-bold text-sm uppercase text-[#000000]">
              {formatSubmissionType(submission.submission_type)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {clients[submission.client_id] || 'Client'} - {formatDate(submission.submitted_at)}
            </p>
            {submission.followup_required && (
              <p className="mt-1 text-xs font-bold uppercase text-[#FA0201]">Follow-up required</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {submission.answer_value !== null && (
              <span className="text-sm font-bold text-gray-700">{submission.answer_value}/10</span>
            )}
            <Badge variant={statusVariant(submission.review_status) as any}>
              {submission.review_status}
            </Badge>
          </div>
        </div>
      </Link>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <p className="font-semibold text-gray-700">Loading review queue...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold uppercase text-[#000000] tracking-tight">Review Queue</h1>
        <p className="mt-1 text-sm text-gray-600">Review client submissions and send feedback.</p>
      </div>

      {message && (
        <Card className="mb-6">
          <p className="text-sm font-semibold text-gray-700">{message}</p>
        </Card>
      )}

      <div className="space-y-8">
        <section>
          <SectionHeader title="NEW SUBMISSIONS" accent />
          <Card>
            {newSubmissions.length === 0 ? (
              <p className="text-sm text-gray-600">No new submissions to review.</p>
            ) : (
              <div>{newSubmissions.map(renderSubmission)}</div>
            )}
          </Card>
        </section>

        <section>
          <SectionHeader title="RECENTLY REVIEWED" accent />
          <Card>
            {reviewedSubmissions.length === 0 ? (
              <p className="text-sm text-gray-600">No reviewed submissions yet.</p>
            ) : (
              <div>{reviewedSubmissions.slice(0, 10).map(renderSubmission)}</div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
