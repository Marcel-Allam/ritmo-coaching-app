'use client';

import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';

// Placeholder data for flags
const flagsData = [
  {
    id: 1,
    type: 'Pain Point',
    message: 'Client reporting lower back pain during workouts',
    severity: 'high',
  },
  {
    id: 2,
    type: 'Support Need',
    message: 'Needs guidance on nutrition planning',
    severity: 'medium',
  },
  {
    id: 3,
    type: 'Progress Alert',
    message: 'Excellent form improvement detected',
    severity: 'low',
  },
];

// Placeholder data for reviews
const reviewsData = [
  {
    id: 1,
    clientName: 'Sarah Mitchell',
    dueDate: 'June 17, 2026',
  },
  {
    id: 2,
    clientName: 'James Chen',
    dueDate: 'June 19, 2026',
  },
  {
    id: 3,
    clientName: 'Emma Rodriguez',
    dueDate: 'June 21, 2026',
  },
];

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
  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="DASHBOARD"
        subtitle="Manage your coaching practice"
      />

      <div className="mt-8 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="Active Clients"
            value={12}
            dark
            trend={{ direction: 'up', value: '+2' }}
          />
          <StatCard
            label="New Submissions"
            value={8}
            trend={{ direction: 'up', value: '+3' }}
          />
          <StatCard
            label="Check-ins Due"
            value={5}
            dark
          />
          <StatCard
            label="Open Actions"
            value={14}
            trend={{ direction: 'down', value: '-1' }}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pain/Support Flags Section */}
          <div>
            <SectionHeader title="PAIN / SUPPORT FLAGS" accent />
            <Card>
              <div className="space-y-4">
                {flagsData.map((flag) => (
                  <div
                    key={flag.id}
                    className="flex items-start justify-between gap-4 pb-4 border-b border-gray-200 last:border-b-0 last:pb-0"
                  >
                    <div className="flex-1">
                      <p className="font-bold text-sm uppercase text-[#000000]">
                        {flag.type}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {flag.message}
                      </p>
                    </div>
                    <Badge
                      variant={getSeverityColor(flag.severity) as any}
                    >
                      {flag.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Progress Reviews Section */}
          <div>
            <SectionHeader title="PROGRESS REVIEWS DUE" accent />
            <Card>
              <div className="space-y-4">
                {reviewsData.map((review) => (
                  <div
                    key={review.id}
                    className="flex items-center justify-between pb-4 border-b border-gray-200 last:border-b-0 last:pb-0"
                  >
                    <div>
                      <p className="font-bold text-sm uppercase text-[#000000]">
                        {review.clientName}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {review.dueDate}
                      </p>
                    </div>
                    <div className="text-xs font-semibold text-[#FA0201] uppercase">
                      Due Soon
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
