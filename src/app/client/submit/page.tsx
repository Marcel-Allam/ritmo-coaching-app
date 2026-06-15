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

type ClientSettingsRecord = {
  nutrition_enabled: boolean;
  bodyweight_enabled: boolean;
  training_availability_enabled: boolean;
};

type AssignedTaskRecord = {
  task_type: string;
};

type SubmissionCard = {
  id: string;
  taskTypes: string[];
  title: string;
  description: string;
  href: string;
  icon: string;
  alwaysShow?: boolean;
  isEnabledBySettings?: (settings: ClientSettingsRecord) => boolean;
};

const defaultSettings: ClientSettingsRecord = {
  nutrition_enabled: false,
  bodyweight_enabled: true,
  training_availability_enabled: true,
};

const submissionTypes: SubmissionCard[] = [
  {
    id: 'weekly-checkin',
    taskTypes: ['weekly_checkin'],
    title: 'Weekly Check-in',
    description:
      'Submit your short pre-call check-in so your coach can review wins, challenges, pain/issues, and what you need help with.',
    href: '/client/submit/weekly-checkin',
    icon: '01',
    alwaysShow: true,
  },
  {
    id: 'training-availability',
    taskTypes: ['training_availability'],
    title: 'Training Availability',
    description:
      'Pick the days you can realistically train next week so your coach can schedule your workouts around your actual availability.',
    href: '/client/submit/training-availability',
    icon: '02',
    isEnabledBySettings: (settings) => settings.training_availability_enabled,
  },
  {
    id: 'workout-checkin',
    taskTypes: ['workout_checkin'],
    title: 'Workout Check-in',
    description:
      'Log your session details including date, name, RPE rating, volume completion, and any notes.',
    href: '/client/submit/workout-checkin',
    icon: '03',
  },
  {
    id: 'key-lift',
    taskTypes: ['key_lift'],
    title: 'Key Lift / Top Set',
    description:
      'Record your top lifts with weight, reps, and estimated strength so your coach can track performance progress.',
    href: '/client/submit/key-lift',
    icon: '04',
  },
  {
    id: 'nutrition-bodyweight',
    taskTypes: ['nutrition', 'bodyweight'],
    title: 'Nutrition & Bodyweight',
    description:
      'Log the nutrition/bodyweight data your coach has enabled for you. The form adapts to your assigned tracking mode.',
    href: '/client/submit/nutrition-bodyweight',
    icon: '05',
    isEnabledBySettings: (settings) => settings.nutrition_enabled || settings.bodyweight_enabled,
  },
];

export default function SubmitHub() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [settings, setSettings] = useState<ClientSettingsRecord>(defaultSettings);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadSubmitContext = async () => {
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

      const [settingsResult, taskResult] = await Promise.all([
        supabase
          .from('client_settings')
          .select('nutrition_enabled, bodyweight_enabled, training_availability_enabled')
          .eq('client_id', linkedClient.id)
          .maybeSingle(),
        supabase
          .from('assigned_tasks')
          .select('task_type')
          .eq('client_id', linkedClient.id)
          .eq('active', true),
      ]);

      if (settingsResult.error) {
        setMessage(settingsResult.error.message);
        setLoading(false);
        return;
      }

      if (taskResult.error) {
        setMessage(taskResult.error.message);
        setLoading(false);
        return;
      }

      setSettings((settingsResult.data as ClientSettingsRecord | null) ?? defaultSettings);
      setTasks((taskResult.data ?? []) as AssignedTaskRecord[]);
      setLoading(false);
    };

    loadSubmitContext();
  }, [user]);

  const activeTaskTypes = useMemo(() => new Set(tasks.map((task) => task.task_type)), [tasks]);

  const visibleSubmissionTypes = useMemo(() => {
    return submissionTypes.filter((submissionType) => {
      const hasAssignedTask = submissionType.taskTypes.some((taskType) => activeTaskTypes.has(taskType));
      const enabledBySettings = submissionType.isEnabledBySettings?.(settings) ?? false;

      // Weekly check-in remains visible as the core RITMO delivery anchor even if
      // the assigned task has not been created yet during early client setup.
      return submissionType.alwaysShow || hasAssignedTask || enabledBySettings;
    });
  }, [activeTaskTypes, settings]);

  if (loading) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <PageHeader title="SUBMIT" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="px-4 py-6 md:px-8 max-w-4xl mx-auto">
            <Card><p className="font-semibold text-gray-700">Loading your submission options...</p></Card>
          </div>
        </main>
      </div>
    );
  }

  if (message || !client) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <PageHeader title="SUBMIT" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="px-4 py-6 md:px-8 max-w-4xl mx-auto">
            <Card>
              <p className="font-bold uppercase text-[#000000]">Submission hub unavailable</p>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="SUBMIT" />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-4xl mx-auto">
          {visibleSubmissionTypes.length === 0 ? (
            <Card>
              <p className="font-bold uppercase text-[#000000]">No active submissions</p>
              <p className="mt-2 text-sm text-gray-600">Your coach has not assigned any active submissions yet.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {visibleSubmissionTypes.map((item) => (
                <Link key={item.id} href={item.href}>
                  <Card className="h-full p-8 cursor-pointer hover:shadow-lg transition-shadow">
                    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-black text-sm font-black text-[#FA0201]">
                      {item.icon}
                    </div>
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
          )}
        </div>
      </main>
    </div>
  );
}
