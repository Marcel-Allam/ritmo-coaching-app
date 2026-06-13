'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';

interface FeedbackEntry {
  id: number;
  week: string;
  date: string;
  content: string;
}

const feedbackEntries: FeedbackEntry[] = [
  {
    id: 1,
    week: 'Week of June 9',
    date: 'June 13, 2026',
    content:
      'Great work this week! Your adherence to the program has been excellent. I noticed improved form on squats. Let\'s focus on increasing volume slightly next week to push adaptation further. The sleep metrics look solid - keep that consistency. One thing to work on: reduce stress levels through better recovery practices between sessions.',
  },
  {
    id: 2,
    week: 'Week of June 2',
    date: 'June 6, 2026',
    content:
      'Solid week overall. Your energy levels are climbing and motivation is strong. The key lift numbers show good progression - that\'s exactly what we want to see. Watch your nutrition adherence next week; I noticed it dipped mid-week. Overall trajectory is positive.',
  },
  {
    id: 3,
    week: 'Week of May 26',
    date: 'May 30, 2026',
    content:
      'Strong foundation week. Getting into the hypertrophy block with good intensity distribution. Your recovery notes suggest you\'re managing fatigue well. Keep monitoring sleep quality closely - there\'s a strong correlation with your workout performance. Minor form cues on deadlifts to review next session.',
  },
];

export default function FeedbackPage() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const toggleExpanded = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="FEEDBACK" />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto">
          <div className="space-y-4 pb-8">
            {feedbackEntries.map((feedback) => (
              <Card
                key={feedback.id}
                className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => toggleExpanded(feedback.id)}
              >
                <div className="p-6">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-bold uppercase text-base flex-1">
                      {feedback.week}
                    </h3>
                    <span className="text-xs font-semibold text-gray-500 ml-4">
                      {feedback.date}
                    </span>
                  </div>

                  {/* Divider */}
                  <div className="h-px bg-gray-200 mb-3" />

                  {/* Content */}
                  <p
                    className={`text-sm text-gray-700 leading-relaxed transition-all ${
                      expandedId === feedback.id ? '' : 'line-clamp-3'
                    }`}
                  >
                    {feedback.content}
                  </p>

                  {/* Expand indicator */}
                  <div className="mt-3 text-xs font-semibold uppercase text-[#FA0201]">
                    {expandedId === feedback.id ? '← Collapse' : 'Expand →'}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
