'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';

export default function CoachClientHubSettingsPage() {
  const params = useParams();
  const clientId = params.id as string;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Client hub settings</p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-[#000000]">Hub Settings</h1>
          <p className="mt-2 text-sm text-gray-600">Control the targets and cards this client sees on their hub.</p>
        </div>
        <Link href={`/coach/clients/${clientId}`} className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-xs font-black uppercase text-[#000000] hover:bg-gray-100">Back to client</Link>
      </div>
      <Card>
        <p className="text-sm font-semibold text-gray-700">Hub settings editor coming next.</p>
      </Card>
    </div>
  );
}
