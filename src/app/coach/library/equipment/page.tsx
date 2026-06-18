import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ManageEquipmentDefaultsPage() {
  return (
    <div className="space-y-8 p-6 md:p-8">
      <PageHeader
        title="EDIT EQUIPMENT DEFAULTS"
        subtitle="Manage equipment-based load jumps, progression modes, and total/per-hand/per-side rules."
      />

      <Card className="border-2 border-gray-200 bg-gray-50">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.35fr] lg:items-center">
          <div>
            <h2 className="text-2xl font-black uppercase text-[#000000]">Equipment defaults manager</h2>
            <p className="mt-2 text-sm text-gray-700">
              This page is the dedicated management surface for RITMO progression defaults. Editing controls for default increments and progression modes will live here.
            </p>
          </div>
          <Link href="/coach/library">
            <Button type="button" className="w-full bg-[#FA0201] hover:bg-red-700">Back to Library</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
