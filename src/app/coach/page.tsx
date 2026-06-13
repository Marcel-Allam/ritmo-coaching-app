'use client';

import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { useEffect, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface InsightFlagRecord {
  id: string;
  flag_type: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
}

interface ReviewDueRecord {
  id: string;
  full_name: string;
  next_review_date: string | null;
}

interface DashboardStats {
  activeClients: number;
  newSubmissions: number;
  checkinsDue: number;
  openActions: number;
}

interface QueryErrorLike {
  message: string;
}

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'high':
      return 'danger';
    case 'medium':
      return 'warning';
    case 'low':
      return 'success';
    default:
      return 'default';
  }
};

export default function CoachDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    activeClients: 0,
    newSubmissions: 0,
    checkinsDue: 0,
    openActions: 0,
  });
  const [flags, setFlags] = useState<InsightFlagRecord[]>([]);
  const [reviewsDue, setReviewsDue] = useState<ReviewDueRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const today = new Date().toISOString().slice(0, 10);

      const [
        activeClientsResult,
        weeklyCheckinsResult,
        workoutCheckinsResult,
        nutritionSubmissionsResult,
        checkinsDueResult,
        openActionsResult,
        flagsResult,
        reviewsResult,
      ] = await Promise.all([
        supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active'),
        supabase
          .from('weekly_checkins')
          .select('*', { count: 'exact', head: true })
          .eq('review_status', 'new'),
        supabase
          .from('workout_checkins')
          .select('*', { count: 'exact', head: true })
          .eq('review_status', 'new'),
        supabase
          .from('nutrition_submissions')
          .select('*', { count: 'exact', head: true })
          .eq('review_status', 'new'),
        supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .not('next_review_date', 'is', 'null')
          .lte('next_review_date', today),
        supabase
          .from('coach_actions')
          .select('*', { count: 'exact', head: true })
          .neq('status', 'done'),
        supabase
          .from('insight_flags')
          .select('id, flag_type, description, priority')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('clients')
          .select('id, full_name, next_review_date')
          .not('next_review_date', 'is', 'null')
          .order('next_review_date', { ascending: true })
          .limit(3),
      ]);

      const firstError = [
        activeClientsResult.error,
        weeklyCheckinsResult.error,
        workoutCheckinsResult.error,
        nutritionSubmissionsResult.error,
        checkinsDueResult.error,
        openActionsResult.error,
        flagsResult.error,
        reviewsResult.error,
      ].find(Boolean) as QueryErrorLike | undefined;

      if (firstError) {
        setError(firstError.message);
        setIsLoading(false);
        return;
      }

      setStats({
        activeClients: activeClientsResult.count ?? 0,
        newSubmissions:
          (weeklyCheckinsResult.count ?? 0) +
          (workoutCheckinsResult.count ?? 0) +
          (nutritionSubmissionsResult.count ?? 0),
        checkinsDue: checkinsDueResult.count ?? 0,
        openActions: openActionsResult.count ?? 0,
      });
      setFlags((flagsResult.data ?? []) as unknown as InsightFlagRecord[]);
      setReviewsDue((reviewsResult.data ?? []) as unknown as ReviewDueRecord[]);
      setIsLoading(false);
    };

    loadDashboard();
  }, []);

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="DASHBOARD"
        subtitle="Manage your coaching practice"
      />

      <div className="mt-8 space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="Active Clients"
            value={isLoading ? '...' : stats.activeClients}
            dark
          />
          <StatCard
            label="New Submissions"
            value={isLoading ? '...' : stats.newSubmissions}
          />
          <StatCard
            label="Check-ins Due"
            value={isLoading ? '...' : stats.checkinsDue}
            dark
          />
          <StatCard
            label="Open Actions"
            value={isLoading ? '...' : stats.openActions}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <SectionHeader title="PAIN / SUPPORT FLAGS" accent />
            <Card>
              {isLoading ? (
                <p className="font-semibold text-gray-700">Loading flags...</p>
              ) : flags.length === 0 ? (
                <p className="text-sm text-gray-600">No open flags.</p>
              ) : (
                <div className="space-y-4">
                  {flags.map((flag) => (
                    <div
                      key={flag.id}
                      className="flex items-start justify-between gap-4 pb-4 border-b border-gray-200 last:border-b-0 last:pb-0"
                    >
                      <div className="flex-1">
                        <p className="font-bold text-sm uppercase text-[#000000]">
                          {flag.flag_type.replaceAll('_', ' ')}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          {flag.description}
                        </p>
                      </div>
                      <Badge
                        variant={getSeverityColor(flag.priority) as any}
                      >
                        {flag.priority}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <div>
            <SectionHeader title="PROGRESS REVIEWS DUE" accent />
            <Card>
              {isLoading ? (
                <p className="font-semibold text-gray-700">Loading reviews...</p>
              ) : reviewsDue.length === 0 ? (
                <p className="text-sm text-gray-600">No progress reviews due.</p>
              ) : (
                <div className="space-y-4">
                  {reviewsDue.map((review) => (
                    <div
                      key={review.id}
                      className="flex items-center justify-between pb-4 border-b border-gray-200 last:border-b-0 last:pb-0"
                    >
                      <div>
                        <p className="font-bold text-sm uppercase text-[#000000]">
                          {review.full_name}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatDate(review.next_review_date)}
                        </p>
                      </div>
                      <div className="text-xs font-semibold text-[#FA0201] uppercase">
                        Review
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
