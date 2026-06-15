'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface FeedbackRecord {
  id: string;
  feedback_date: string;
  main_win: string | null;
  main_focus: string | null;
  agreed_action: string | null;
  plan_change: string | null;
  next_review_date: string | null;
}

interface ClientRecord {
  id: string;
  full_name: string;
}

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const buildPreview = (feedback: FeedbackRecord) => {
  return [
    feedback.main_win,
    feedback.main_focus,
    feedback.agreed_action,
    feedback.plan_change,
  ]
    .filter(Boolean)
    .join(' ');
};

export default function FeedbackPage() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadFeedback = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Account is not ready yet.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        setMessage('This account is not linked to a client record yet.');
        setIsLoading(false);
        return;
      }

      const linkedClient = clientData as ClientRecord;
      setClient(linkedClient);

      const { data: feedbackData, error: feedbackError } = await supabase
        .from('feedback_notes')
        .select('id, feedback_date, main_win, main_focus, agreed_action, plan_change, next_review_date')
        .eq('client_id', linkedClient.id)
        .eq('client_visible', true)
        .order('feedback_date', { ascending: false });

      if (feedbackError) {
        setMessage(feedbackError.message);
        setIsLoading(false);
        return;
      }

      setFeedback((feedbackData ?? []) as FeedbackRecord[]);
      setIsLoading(false);
    };

    loadFeedback();
  }, [user]);

  const toggleExpanded = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="FEEDBACK" subtitle={client ? `Latest coaching notes for ${client.full_name}` : undefined} />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-3xl mx-auto">
          {isLoading && (
            <Card>
              <p className="font-semibold text-gray-700">Loading feedback...</p>
            </Card>
          )}

          {!isLoading && message && (
            <Card>
              <p className="font-bold uppercase text-[#000000]">Feedback unavailable</p>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </Card>
          )}

          {!isLoading && !message && feedback.length === 0 && (
            <Card>
              <p className="font-bold uppercase text-[#000000]">No feedback yet</p>
              <p className="mt-2 text-sm text-gray-600">Your coach feedback will appear here once it has been sent.</p>
            </Card>
          )}

          {!isLoading && !message && feedback.length > 0 && (
            <div className="space-y-4 pb-8">
              {feedback.map((feedbackItem) => {
                const isExpanded = expandedId === feedbackItem.id;
                const preview = buildPreview(feedbackItem);

                return (
                  <Card
                    key={feedbackItem.id}
                    className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => toggleExpanded(feedbackItem.id)}
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <h3 className="font-bold uppercase text-base flex-1">
                          Coach feedback
                        </h3>
                        <span className="text-xs font-semibold text-gray-500 ml-4">
                          {formatDate(feedbackItem.feedback_date)}
                        </span>
                      </div>

                      <div className="h-px bg-gray-200 mb-3" />

                      {isExpanded ? (
                        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                          {feedbackItem.main_win && <p><strong>Main win:</strong> {feedbackItem.main_win}</p>}
                          {feedbackItem.main_focus && <p><strong>Main focus:</strong> {feedbackItem.main_focus}</p>}
                          {feedbackItem.agreed_action && <p><strong>Agreed action:</strong> {feedbackItem.agreed_action}</p>}
                          {feedbackItem.plan_change && <p><strong>Plan change:</strong> {feedbackItem.plan_change}</p>}
                          <p className="text-xs font-semibold uppercase text-gray-500">Next review: {formatDate(feedbackItem.next_review_date)}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
                          {preview || 'Feedback has been sent, but no details were added.'}
                        </p>
                      )}

                      <div className="mt-3 text-xs font-semibold uppercase text-[#FA0201]">
                        {isExpanded ? '← Collapse' : 'Expand →'}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
