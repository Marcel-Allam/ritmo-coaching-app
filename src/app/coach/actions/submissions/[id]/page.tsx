'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type SubmissionRouteRecord = {
  client_id: string;
  submission_type: string;
  answer_text: string | null;
};

export default function CoachActionSubmissionRouterPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params.id as string;
  const [message, setMessage] = useState('Opening review...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const routeSubmission = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        return;
      }

      const supabase = createClient();
      const { data, error: submissionError } = await supabase
        .from('task_submissions')
        .select('client_id, submission_type, answer_text')
        .eq('id', submissionId)
        .single();

      if (submissionError || !data) {
        setError(submissionError?.message || 'Submission not found.');
        return;
      }

      const submission = data as SubmissionRouteRecord;

      if (submission.submission_type === 'workout_session' && submission.answer_text) {
        router.replace(`/coach/clients/${submission.client_id}/workout-review/${submission.answer_text}`);
        return;
      }

      if (submission.submission_type === 'coach_call_request') {
        router.replace('/coach/actions');
        return;
      }

      setMessage('This submission type is no longer supported in V1.');
    };

    routeSubmission();
  }, [router, submissionId]);

  if (error) {
    return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;
  }

  return (
    <div className="p-6 md:p-8">
      <Card>
        <p className="text-sm font-semibold text-gray-700">{message}</p>
        {message !== 'Opening review...' && (
          <Link href="/coach/actions" className="mt-4 inline-block text-xs font-black uppercase text-[#FA0201] hover:underline">
            Back to actions
          </Link>
        )}
      </Card>
    </div>
  );
}
