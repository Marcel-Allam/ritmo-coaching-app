'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = {
  id: string;
};

type AssignedTaskRecord = {
  task_type: string;
};

type CheckInCard = {
  id: string;
  taskTypes: string[];
  title: string;
  description: string;
  href: string;
  icon: string;
  alwaysShow?: boolean;
};

const checkInTypes: CheckInCard[] = [
  {
    id: 'weekly-checkin',
    taskTypes: ['weekly_checkin'],
    title: 'Weekly Check-in',
    description:
      'Tell your coach what actually happened this week: wins, challenges, pain/issues, and where you need support.',
    href: '/client/submit/weekly-checkin',
    icon: '01',
    alwaysShow: true,
  },
  {
    id: 'key-lift',
    taskTypes: ['key_lift'],
    title: 'Key Lift / Top Set',
    description:
      'Record a top set or key lift update so your coach can track performance and adjust progression.',
    href: '/client/submit/key-lift',
    icon: '02',
  },
  {
    id: 'workout-checkin',
    taskTypes: ['workout_checkin'],
    title: 'Workout Check-in',
    description:
      'Use this only if your coach asks for a standalone workout check-in outside the full workout logging flow.',
    href: '/client/submit/workout-checkin',
    icon: '03',
  },
];

export default function ClientCheckInHub() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadCheckInContext = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Client login is not ready.');
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        setMessage('This login is not linked to a client profile yet.');
        setLoading(false);
        return;
      }

      const linkedClient = clientData as ClientRecord;
      setClient(linkedClient);

      const { data: taskData, error: taskError } = await supabase
        .from('assigned_tasks')
        .select('task_type')
        .eq('client_id', linkedClient.id)
        .eq('active', true);

      if (taskError) {
        setMessage(taskError.message);
        setLoading(false);
        return;
      }

      setTasks((taskData ?? []) as AssignedTaskRecord[]);
      setLoading(false);
    };

    loadCheckInContext();
  }, [user]);

  const activeTaskTypes = useMemo(() => new Set(tasks.map((task) => task.task_type)), [tasks]);

  const visibleCheckInTypes = useMemo(() => {
    return checkInTypes.filter((checkInType) => {
      const hasAssignedTask = checkInType.taskTypes.some((taskType) => activeTaskTypes.has(taskType));

      // Weekly check-in remains visible as the core RITMO accountability anchor.
      // Other cards appear only when the coach assigns them.
      return checkInType.alwaysShow || hasAssignedTask;
    });
  }, [activeTaskTypes]);

  if (loading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <PageHeader title="CHECK IN" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
            <Card><p className="font-semibold text-gray-700">Loading your check-in options...</p></Card>
          </div>
        </main>
      </div>
    );
  }

  if (message || !client) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <PageHeader title="CHECK IN" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
            <Card>
              <p className="font-bold uppercase text-[#000000]">Check-in hub unavailable</p>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader title="CHECK IN" subtitle="Weekly coaching check-in and coach-requested updates." />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-4xl px-4 py-6 md:px-8">
          <Card className="mb-6 border-2 border-gray-200 bg-gray-50">
            <p className="text-xs font-bold uppercase text-gray-500">RITMO accountability</p>
            <h2 className="mt-1 text-xl font-black uppercase text-[#000000]">Use this for coach review, not routine calendar tasks.</h2>
            <p className="mt-2 text-sm text-gray-700">
              Training availability and bodyweight check-ins now live on your Hub weekly calendar. This page stays focused on your weekly coaching check-in and any extra updates your coach requests.
            </p>
          </Card>

          {visibleCheckInTypes.length === 0 ? (
            <Card>
              <p className="font-bold uppercase text-[#000000]">No active check-ins</p>
              <p className="mt-2 text-sm text-gray-600">Your coach has not assigned any active check-ins yet.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {visibleCheckInTypes.map((item) => (
                <Link key={item.id} href={item.href}>
                  <Card className="h-full cursor-pointer p-8 transition-shadow hover:shadow-lg">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-black text-sm font-black text-[#FA0201]">
                      {item.icon}
                    </div>
                    <h2 className="mb-3 text-xl font-bold uppercase">
                      {item.title}
                    </h2>
                    <p className="text-sm leading-relaxed text-gray-700">
                      {item.description}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
