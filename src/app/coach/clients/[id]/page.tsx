'use client';

import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { TaskCard } from '@/components/ui/task-card';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// Placeholder client data
const clientsData: Record<number, any> = {
  1: {
    id: 1,
    name: 'Sarah Mitchell',
    status: 'active',
    currentFocus:
      'Develop consistent strength training routine and improve core stability',
    tasks: [
      {
        id: 1,
        title: 'Complete Upper Body Workout',
        description: 'Perform the prescribed upper body routine',
        status: 'in-progress',
        dueDate: 'June 14, 2026',
      },
      {
        id: 2,
        title: 'Log Daily Steps',
        description: 'Track daily step count',
        status: 'pending',
        dueDate: 'June 15, 2026',
      },
      {
        id: 3,
        title: 'Form Check Video',
        description: 'Submit video of squat form for review',
        status: 'pending',
        dueDate: 'June 16, 2026',
      },
    ],
    submissions: [
      {
        id: 1,
        type: 'Workout Log',
        date: 'June 12, 2026',
      },
      {
        id: 2,
        type: 'Progress Photo',
        date: 'June 10, 2026',
      },
      {
        id: 3,
        type: 'Nutrition Log',
        date: 'June 8, 2026',
      },
    ],
    nextReview: 'June 17, 2026',
  },
  2: {
    id: 2,
    name: 'James Chen',
    status: 'active',
    currentFocus:
      'Increase flexibility and improve mobility for better movement quality',
    tasks: [
      {
        id: 1,
        title: 'Daily Stretching Routine',
        description: '20-minute flexibility session',
        status: 'pending',
        dueDate: 'June 15, 2026',
      },
      {
        id: 2,
        title: 'Foam Rolling Session',
        description: 'Use foam roller on legs and back',
        status: 'pending',
        dueDate: 'June 16, 2026',
      },
    ],
    submissions: [
      {
        id: 1,
        type: 'Mobility Assessment',
        date: 'June 11, 2026',
      },
      {
        id: 2,
        type: 'Pain Check-in',
        date: 'June 9, 2026',
      },
    ],
    nextReview: 'June 19, 2026',
  },
  3: {
    id: 3,
    name: 'Emma Rodriguez',
    status: 'active',
    currentFocus:
      'Sustainable weight management with healthy nutrition and regular exercise',
    tasks: [
      {
        id: 1,
        title: 'Meal Planning',
        description: 'Plan meals for the week',
        status: 'completed',
        dueDate: 'June 13, 2026',
      },
      {
        id: 2,
        title: 'Grocery Shopping',
        description: 'Shop for planned meals',
        status: 'pending',
        dueDate: 'June 15, 2026',
      },
    ],
    submissions: [
      {
        id: 1,
        type: 'Weekly Weigh-in',
        date: 'June 12, 2026',
      },
      {
        id: 2,
        type: 'Food Log',
        date: 'June 7, 2026',
      },
    ],
    nextReview: 'June 21, 2026',
  },
  4: {
    id: 4,
    name: 'Marcus Thompson',
    status: 'paused',
    currentFocus:
      'Gradual return to activity following knee injury with modified exercises',
    tasks: [
      {
        id: 1,
        title: 'Gentle Range of Motion',
        description: 'Easy mobility work',
        status: 'pending',
        dueDate: 'June 16, 2026',
      },
    ],
    submissions: [
      {
        id: 1,
        type: 'Pain Assessment',
        date: 'June 10, 2026',
      },
    ],
    nextReview: 'July 5, 2026',
  },
  5: {
    id: 5,
    name: 'Lisa Anderson',
    status: 'active',
    currentFocus:
      'Athletic performance enhancement and competition preparation',
    tasks: [
      {
        id: 1,
        title: 'Speed Training',
        description: 'Sprint intervals session',
        status: 'in-progress',
        dueDate: 'June 14, 2026',
      },
      {
        id: 2,
        title: 'Power Development',
        description: 'Plyometric exercises',
        status: 'pending',
        dueDate: 'June 17, 2026',
      },
    ],
    submissions: [
      {
        id: 1,
        type: 'Performance Metrics',
        date: 'June 11, 2026',
      },
      {
        id: 2,
        type: 'Competition Prep',
        date: 'June 5, 2026',
      },
    ],
    nextReview: 'June 20, 2026',
  },
};

export default function ClientProfilePage() {
  const params = useParams();
  const clientId = parseInt(params.id as string, 10);
  const client = clientsData[clientId];

  if (!client) {
    return (
      <div className="p-6 md:p-8">
        <div className="text-center py-12">
          <p className="text-gray-600 font-semibold">Client not found</p>
          <Link href="/coach/clients" className="text-[#FA0201] font-bold mt-4">
            Back to Clients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-start gap-4">
            <div>
              <h1 className="text-3xl font-bold uppercase text-[#000000] tracking-tight">
                {client.name}
              </h1>
            </div>
            <Badge variant={client.status === 'active' ? 'success' : 'warning'}>
              {client.status}
            </Badge>
          </div>
          <Link
            href="/coach/clients"
            className="text-sm font-semibold text-[#FA0201] uppercase hover:underline"
          >
            Back to Clients
          </Link>
        </div>
      </div>

      <div className="space-y-8">
        {/* Current Focus */}
        <div>
          <SectionHeader title="CURRENT FOCUS" accent />
          <Card variant="dark">
            <p className="text-white text-lg">{client.currentFocus}</p>
          </Card>
        </div>

        {/* Assigned Tasks */}
        <div>
          <SectionHeader title="ASSIGNED TASKS" accent />
          <div className="space-y-4">
            {client.tasks.map((task: any) => (
              <TaskCard
                key={task.id}
                title={task.title}
                description={task.description}
                status={task.status}
                dueDate={task.dueDate}
              />
            ))}
          </div>
        </div>

        {/* Recent Submissions */}
        <div>
          <SectionHeader title="RECENT SUBMISSIONS" accent />
          <Card>
            <div className="space-y-4">
              {client.submissions.map((submission: any) => (
                <div
                  key={submission.id}
                  className="flex items-center justify-between pb-4 border-b border-gray-200 last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="font-bold text-sm uppercase text-[#000000]">
                      {submission.type}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {submission.date}
                    </p>
                  </div>
                  <Badge variant="default">Submitted</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Next Review */}
        <div>
          <SectionHeader title="NEXT REVIEW" accent />
          <Card>
            <p className="text-2xl font-bold uppercase text-[#FA0201]">
              {client.nextReview}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
