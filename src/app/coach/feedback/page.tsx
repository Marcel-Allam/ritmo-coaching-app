'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { useEffect, useMemo, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface FeedbackRecord {
  id: string;
  feedback_date: string;
  main_win: string | null;
  main_focus: string | null;
  agreed_action: string | null;
  plan_change: string | null;
  next_review_date: string | null;
  clients: {
    full_name: string;
  } | null;
}

const formatDate = (value: string | null) => {
  if (!value) return 'No date';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const buildFeedbackSummary = (feedback: FeedbackRecord) => {
  return [
    feedback.main_win,
    feedback.main_focus,
    feedback.agreed_action,
    feedback.plan_change,
  ]
    .filter(Boolean)
    .join(' ');
};

export default function CoachFeedbackPage() {
  const [expandedFeedback, setExpandedFeedback] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const toggleExpand = (feedbackId: string) => {
    setExpandedFeedback(
      expandedFeedback === feedbackId ? null : feedbackId
    );
  };

  useEffect(() => {
    const loadFeedback = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();

      const { data, error: feedbackError } = await supabase
        .from('feedback_notes')
        .select('id, feedback_date, main_win, main_focus, agreed_action, plan_change, next_review_date, clients(full_name)')
        .order('feedback_date', { ascending: false });

      if (feedbackError) {
        setError(feedbackError.message);
        setIsLoading(false);
        return;
      }

      setFeedback((data ?? []) as FeedbackRecord[]);
      setIsLoading(false);
    };

    loadFeedback();
  }, []);

  const groupedByDate = useMemo(
    () =>
      feedback.reduce(
        (acc, feedbackItem) => {
          const dateLabel = formatDate(feedbackItem.feedback_date);
          if (!acc[dateLabel]) {
            acc[dateLabel] = [];
          }
          acc[dateLabel].push(feedbackItem);
          return acc;
        },
        {} as Record<string, FeedbackRecord[]>
      ),
    [feedback]
  );

  const sortedDates = Object.keys(groupedByDate);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="WEEKLY FEEDBACK"
        subtitle="Review client progress and insights"
      />

      <div className="mt-8 space-y-8">
        {isLoading && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="font-semibold text-gray-700">Loading feedback...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        )}

        {!isLoading && !error && sortedDates.map((dateLabel) => (
          <div key={dateLabel}>
            <SectionHeader title={dateLabel} accent />

            <div className="space-y-4">
              {groupedByDate[dateLabel].map((feedbackItem) => {
                const isExpanded = expandedFeedback === feedbackItem.id;
                const summary = buildFeedbackSummary(feedbackItem);

                return (
                  <Card
                    key={feedbackItem.id}
                    className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => toggleExpand(feedbackItem.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold uppercase text-[#000000]">
                          {feedbackItem.clients?.full_name ?? 'No client linked'}
                        </h3>
                        {isExpanded ? (
                          <div className="mt-4 space-y-3 text-sm text-gray-700 leading-relaxed">
                            {feedbackItem.main_win && (
                              <p><strong>Main win:</strong> {feedbackItem.main_win}</p>
                            )}
                            {feedbackItem.main_focus && (
                              <p><strong>Main focus:</strong> {feedbackItem.main_focus}</p>
                            )}
                            {feedbackItem.agreed_action && (
                              <p><strong>Agreed action:</strong> {feedbackItem.agreed_action}</p>
                            )}
                            {feedbackItem.plan_change && (
                              <p><strong>Plan change:</strong> {feedbackItem.plan_change}</p>
                            )}
                            <div className="text-xs text-gray-500 font-semibold">
                              Next review: {formatDate(feedbackItem.next_review_date)}
                            </div>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                            {summary || 'No feedback details added yet.'}
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

        {!isLoading && !error && feedback.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-600 font-semibold">No feedback notes found</p>
          </div>
        )}
      </div>
    </div>
  );
}
