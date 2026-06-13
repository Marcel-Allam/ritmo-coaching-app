'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { useState } from 'react';

// Placeholder data for feedback entries
const feedbackData = [
  {
    id: 1,
    clientName: 'Sarah Mitchell',
    weekRange: 'June 10 - June 16, 2026',
    weekStartDate: '2026-06-10',
    feedbackContent:
      'Great progress this week! Sarah showed excellent form consistency during her upper body workouts and increased her squat depth by 2 inches. She has been very consistent with logging her workouts. One area to focus on is her recovery routine - she mentioned feeling slightly fatigued on Wednesday. Recommend increasing her sleep hours and adding more stretching on off days.',
  },
  {
    id: 2,
    clientName: 'James Chen',
    weekRange: 'June 10 - June 16, 2026',
    weekStartDate: '2026-06-10',
    feedbackContent:
      'James continues to show steady improvement in his flexibility work. His hip mobility has improved noticeably over the past two weeks. We discussed his lower back tightness and adjusted his routine to include more targeted stretching. He is responding well to the foam rolling protocol. Overall engagement and adherence to the program are excellent.',
  },
  {
    id: 3,
    clientName: 'Emma Rodriguez',
    weekRange: 'June 3 - June 9, 2026',
    weekStartDate: '2026-06-03',
    feedbackContent:
      'Emma had a strong week with consistent nutrition tracking and three gym sessions. She is making good progress on her weight management goals. However, she expressed some challenges with meal prep consistency. Suggested batch cooking on Sundays and prepared a simplified meal plan. Her mindset has been very positive and she is engaged with the process.',
  },
  {
    id: 4,
    clientName: 'Lisa Anderson',
    weekRange: 'June 3 - June 9, 2026',
    weekStartDate: '2026-06-03',
    feedbackContent:
      'Lisa is showing exceptional performance improvements. Her sprint times are down 0.5 seconds from last month and her power output has increased significantly. We added more plyometric work to her program and she handled it very well. Competition is approaching and she is in great form. Recommend maintaining current intensity and monitoring recovery closely.',
  },
];

export default function CoachFeedbackPage() {
  const [expandedFeedback, setExpandedFeedback] = useState<number | null>(null);

  const toggleExpand = (feedbackId: number) => {
    setExpandedFeedback(
      expandedFeedback === feedbackId ? null : feedbackId
    );
  };

  // Group feedback by week
  const groupedByWeek = feedbackData.reduce(
    (acc, feedback) => {
      const weekRange = feedback.weekRange;
      if (!acc[weekRange]) {
        acc[weekRange] = [];
      }
      acc[weekRange].push(feedback);
      return acc;
    },
    {} as Record<string, typeof feedbackData>
  );

  const sortedWeeks = Object.keys(groupedByWeek).sort(
    (a, b) => {
      const dateA = groupedByWeek[a][0].weekStartDate;
      const dateB = groupedByWeek[b][0].weekStartDate;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    }
  );

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="WEEKLY FEEDBACK"
        subtitle="Review client progress and insights"
      />

      <div className="mt-8 space-y-8">
        {sortedWeeks.map((weekRange) => (
          <div key={weekRange}>
            <SectionHeader title={weekRange} accent />

            <div className="space-y-4">
              {groupedByWeek[weekRange].map((feedback) => {
                const isExpanded = expandedFeedback === feedback.id;

                return (
                  <Card
                    key={feedback.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => toggleExpand(feedback.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold uppercase text-[#000000]">
                          {feedback.clientName}
                        </h3>
                        {isExpanded ? (
                          <div className="mt-4 space-y-3">
                            <p className="text-sm text-gray-700 leading-relaxed">
                              {feedback.feedbackContent}
                            </p>
                            <div className="text-xs text-gray-500 font-semibold">
                              Week of {feedback.weekRange}
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                            {feedback.feedbackContent}
                          </p>
                        )}
                      </div>

                      <div className="flex-shrink-0">
                        <Badge variant="default">
                          {isExpanded ? 'Close' : 'View'}
                        </Badge>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
