'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';

export default function ClientProgressDetailPage() {
  const params = useParams();
  const slot = params.slot as string;

  return (
    <div>
      <PageHeader title="PROGRESS DATA" subtitle={`Graph ${slot}`} />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <Link href="/client" className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-3 text-xs font-black uppercase text-[#000000] hover:bg-gray-100">
          Back to hub
        </Link>

        <Card className="border-2 border-dashed border-gray-300 bg-gray-50">
          <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Progress detail</p>
          <h1 className="mt-2 text-2xl font-black uppercase text-[#000000]">Detailed graph view</h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-700">
            This route is now wired from the square progress tiles. The full graph/data table can be expanded here next without changing the hub layout.
          </p>
          <Link href="/client/training/history" className="mt-5 inline-flex rounded-lg bg-[#FA0201] px-5 py-3 text-xs font-black uppercase text-white hover:bg-red-700">
            View training data
          </Link>
        </Card>
      </div>
    </div>
  );
}
