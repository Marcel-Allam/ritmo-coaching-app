import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';

export default function ClientDietPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader title="DIET" subtitle="This section will be built later." />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
          <Card className="border-2 border-gray-200 bg-gray-50">
            <p className="text-xs font-bold uppercase text-gray-500">Coming later</p>
            <h1 className="mt-1 text-2xl font-black uppercase text-[#000000]">Diet section not built yet.</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              This tab is reserved for future client guidance. Current accountability tasks remain under Check in.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
