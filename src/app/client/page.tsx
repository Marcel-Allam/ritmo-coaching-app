'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TaskCard } from '@/components/ui/task-card';
import { SectionHeader } from '@/components/ui/section-header';

// Placeholder data
const assignedTasks = [
  {
    id: 1,
    title: 'Complete Weekly Check-in',
    description: 'Submit your weekly metrics and feedback',
    status: 'pending' as const,
    dueDate: 'June 15, 2026',
  },
  {
    id: 2,
    title: 'Log Top Lift - Upper Push',
    description: 'Record your heaviest set from this week',
    status: 'in-progress' as const,
    dueDate: 'June 16, 2026',
  },
  {
    id: 3,
    title: 'Nutrition Check-in',
    description: 'Submit your average daily intake',
    status: 'pending' as const,
    dueDate: 'June 17, 2026',
  },
];

const feedbackNotes = [
  {
    id: 1,
    week: 'Week of June 9',
    date: 'June 13, 2026',
    content:
      'Great work this week! Your adherence to the program has been excellent. I noticed improved form on squats. Let\'s focus on increasing volume slightly next week to push adaptation further.',
  },
];

const submissionOptions = [
  {
    id: 'weekly-checkin',
    title: 'Weekly Check-in',
    description: 'Energy, sleep, stress, motivation',
    href: '/client/submit/weekly-checkin',
    icon: '📋',
  },
  {
    id: 'workout-checkin',
    title: 'Workout Check-in',
    description: 'Session RPE and volume',
    href: '/client/submit/workout-checkin',
    icon: '💪',
  },
  {
    id: 'key-lift',
    title: 'Key Lift / Top Set',
    description: 'Record your top lifts',
    href: '/client/submit/key-lift',
    icon: '🏋️',
  },
  {
    id: 'nutrition-bodyweight',
    title: 'Nutrition & Bodyweight',
    description: 'Macros and weight tracking',
    href: '/client/submit/nutrition-bodyweight',
    icon: '⚖️',
  },
];

export default function ClientHub() {
  const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null);

  return (
    <div>
      <PageHeader title="YOUR HUB" />

      <div className="px-4 py-6 md:px-8 max-w-6xl mx-auto space-y-8">
          {/* Current Focus Section */}
          <section>
            <SectionHeader title="CURRENT FOCUS" accent />
            <Card variant="dark" className="p-8">
              <div className="text-white">
                <div className="text-sm font-semibold uppercase opacity-75 mb-2">
                  Active Program
                </div>
                <div className="text-2xl md:text-3xl font-bold">
                  Hypertrophy Block - Week 4 of 8
                </div>
                <div className="mt-4 pt-4 border-t border-gray-700 text-sm opacity-75">
                  Focus on controlled eccentric movements and maintaining perfect form
                </div>
              </div>
              <div
                className="absolute top-0 right-0 w-0 h-0 border-l-[80px] border-t-[80px] border-l-transparent border-t-red-600"
                aria-hidden="true"
              />
            </Card>
          </section>

          {/* Assigned Tasks Section */}
          <section>
            <SectionHeader title="ASSIGNED TASKS" accent />
            <div className="space-y-4">
              {assignedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  title={task.title}
                  description={task.description}
                  status={task.status}
                  dueDate={task.dueDate}
                />
              ))}
            </div>
          </section>

          {/* Submit Section */}
          <section>
            <SectionHeader title="SUBMIT" accent />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {submissionOptions.map((option) => (
                <Link key={option.id} href={option.href}>
                  <Card
                    variant="dark"
                    className="h-full p-6 cursor-pointer hover:shadow-lg transition-shadow relative"
                  >
                    <div className="text-white">
                      <div className="text-3xl mb-3">{option.icon}</div>
                      <h3 className="text-lg font-bold uppercase mb-1">
                        {option.title}
                      </h3>
                      <p className="text-sm opacity-75">{option.description}</p>
                    </div>
                    <div
                      className="absolute top-0 right-0 w-0 h-0 border-l-[60px] border-t-[60px] border-l-transparent border-t-red-600"
                      aria-hidden="true"
                    />
                  </Card>
                </Link>
              ))}
            </div>
          </section>

          {/* Latest Feedback Section */}
          <section>
            <SectionHeader title="LATEST FEEDBACK" accent />
            <div className="space-y-4">
              {feedbackNotes.map((feedback) => (
                <Card
                  key={feedback.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() =>
                    setExpandedFeedback(
                      expandedFeedback === feedback.id ? null : feedback.id
                    )
                  }
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold uppercase text-sm">{feedback.week}</h3>
                    <span className="text-xs text-gray-500">{feedback.date}</span>
                  </div>
                  <p
                    className={`text-sm text-gray-700 ${
                      expandedFeedback === feedback.id ? '' : 'line-clamp-2'
                    }`}
                  >
                    {feedback.content}
                  </p>
                  {expandedFeedback === feedback.id && (
                    <Button variant="ghost" size="sm" className="mt-3">
                      Read More
                    </Button>
                  )}
                </Card>
              ))}
            </div>
          </section>

          {/* Next Review Section */}
          <section className="pb-8">
            <SectionHeader title="NEXT REVIEW" accent />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-6 text-center">
                <p className="text-sm font-semibold uppercase opacity-75 mb-2">
                  Scheduled For
                </p>
                <p className="text-2xl font-bold text-[#FA0201]">
                  June 20, 2026
                </p>
                <p className="text-xs text-gray-500 mt-2">In 7 days</p>
              </Card>
            </div>
          </section>
      </div>
    </div>
  );
}
