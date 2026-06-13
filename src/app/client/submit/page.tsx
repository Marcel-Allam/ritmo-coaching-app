'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';

const submissionTypes = [
  {
    id: 'weekly-checkin',
    title: 'Weekly Check-in',
    description:
      'Submit your weekly metrics including energy, sleep quality, stress levels, motivation, adherence, and any notes about your week.',
    href: '/client/submit/weekly-checkin',
    icon: '📋',
  },
  {
    id: 'workout-checkin',
    title: 'Workout Check-in',
    description:
      'Log your session details including date, name, RPE rating, volume completion, and any notes.',
    href: '/client/submit/workout-checkin',
    icon: '💪',
  },
  {
    id: 'key-lift',
    title: 'Key Lift / Top Set',
    description:
      'Record your top lifts with weight, reps, and auto-calculated estimated 1RM. Perfect for tracking strength progress.',
    href: '/client/submit/key-lift',
    icon: '🏋️',
  },
  {
    id: 'nutrition-bodyweight',
    title: 'Nutrition & Bodyweight',
    description:
      'Log your daily macros, bodyweight, and nutrition adherence ratings to track your nutritional consistency.',
    href: '/client/submit/nutrition-bodyweight',
    icon: '⚖️',
  },
];

export default function SubmitHub() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="SUBMIT" />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {submissionTypes.map((item) => (
              <Link key={item.id} href={item.href}>
                <Card className="h-full p-8 cursor-pointer hover:shadow-lg transition-shadow">
                  <div className="text-4xl mb-4">{item.icon}</div>
                  <h2 className="text-xl font-bold uppercase mb-3">
                    {item.title}
                  </h2>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {item.description}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
