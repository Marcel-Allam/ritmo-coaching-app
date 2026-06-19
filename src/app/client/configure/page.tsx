import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';

export default function ClientConfigurePage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader title="CONFIGURE" subtitle="Control when recurring check-ins appear." />
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
          <Card className="border-2 border-gray-200 bg-gray-50">
            <p className="text-xs font-bold uppercase text-gray-500">Coming next</p>
            <h1 className="mt-1 text-2xl font-black uppercase text-[#000000]">Reminder timing controls</h1>
            <p className="mt-3 text-sm leading-relaxed text-gray-700">
              This is where clients will choose when recurring check-ins appear. Coach toggles still decide which actions are active for each client.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}
