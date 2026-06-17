'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';

export default function RemovedWorkoutHistoryRoute() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientId = params.id as string;
  const sessionId = searchParams.get('session');

  useEffect(() => {
    if (sessionId) {
      router.replace(`/coach/clients/${clientId}/workout-review/${sessionId}`);
      return;
    }

    router.replace(`/coach/clients/${clientId}`);
  }, [clientId, router, sessionId]);

  return (
    <div className="p-6 md:p-8">
      <Card>Redirecting...</Card>
    </div>
  );
}
