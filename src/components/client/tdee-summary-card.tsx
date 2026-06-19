'use client';

import { Card } from '@/components/ui/card';

export function TdeeSummaryCard({ clientId }: { clientId: string }) {
  return (
    <Card variant="dark" className="p-6">
      <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Energy estimate</p>
      <h2 className="mt-3 text-4xl font-black uppercase tracking-tight text-white">Setup needed</h2>
      <p className="mt-2 text-sm text-white/60">Client profile and latest bodyweight are needed before the maintenance estimate can be shown.</p>
      <p className="mt-4 text-xs text-white/40">Client ID: {clientId}</p>
    </Card>
  );
}
