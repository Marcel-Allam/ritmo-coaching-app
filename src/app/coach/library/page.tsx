import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';

const libraryLinks = [
  {
    label: 'Exercise',
    href: '/coach/exercise-catalogue',
    description: 'Manage the exercise database used when building workouts.',
  },
  {
    label: 'Workout',
    href: '/coach/library/workouts',
    description: 'Create and edit reusable workout templates.',
  },
  {
    label: 'Programme',
    href: '/coach/library/programmes',
    description: 'Build programme templates from workout templates.',
  },
];

export default function CoachLibraryPage() {
  return (
    <div className="space-y-8 p-6 md:p-8">
      <PageHeader title="LIBRARY" subtitle="Choose what you want to build or manage in the RITMO coaching library." />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {libraryLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="group h-full border-2 border-gray-200 bg-white transition hover:border-[#FA0201] hover:bg-red-50">
              <div className="flex h-full flex-col justify-between gap-8">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-[#FA0201]">Library</p>
                  <h2 className="mt-2 text-3xl font-black uppercase text-[#000000]">{item.label}</h2>
                  <p className="mt-3 text-sm font-semibold text-gray-600">{item.description}</p>
                </div>
                <div className="rounded-lg bg-[#000000] px-4 py-3 text-center text-sm font-black uppercase text-white transition group-hover:bg-[#FA0201]">
                  Open {item.label}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
