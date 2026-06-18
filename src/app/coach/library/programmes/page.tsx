import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ManageProgrammeLibraryPage() {
  return (
    <div className="space-y-8 p-6 md:p-8">
      <PageHeader
        title="MANAGE PROGRAMME LIBRARY"
        subtitle="Create, edit and organise reusable programme templates made from workout library items."
      />

      <Card className="border-2 border-gray-200 bg-gray-50">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.35fr] lg:items-center">
          <div>
            <h2 className="text-2xl font-black uppercase text-[#000000]">Programme library manager</h2>
            <p className="mt-2 text-sm text-gray-700">
              This page is the dedicated management surface for reusable programme templates. The current Library tab remains the preview/browse view; editing controls will live here.
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
