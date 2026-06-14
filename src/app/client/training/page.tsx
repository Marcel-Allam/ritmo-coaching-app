'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface ClientRecord {
  id: string;
  full_name: string;
}

interface TrainingProgramRecord {
  id: string;
  title: string;
}

interface ProgramWorkoutRecord {
  id: string;
  program_id: string;
  title: string;
  day_label: string | null;
  instructions: string | null;
  scheduled_date: string | null;
  workout_order: number;
}

interface ExerciseCountRecord {
  workout_id: string;
}

interface CompletedSessionRecord {
  id: string;
  program_workout_id: string;
  completed_at: string | null;
  review_status: string;
}

interface WorkoutTitleRecord {
  id: string;
  title: string;
}

const formatDate = (value: string | null) => {
  if (!value) return 'Not scheduled';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

export default function ClientTrainingPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const submitted = searchParams.get('submitted') === '1';

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workout, setWorkout] = useState<ProgramWorkoutRecord | null>(null);
  const [program, setProgram] = useState<TrainingProgramRecord | null>(null);
  const [completedSessions, setCompletedSessions] = useState<CompletedSessionRecord[]>([]);
  const [workoutTitles, setWorkoutTitles] = useState<Record<string, string>>({});
  const [exerciseCount, setExerciseCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadAssignedWorkout = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Account is not ready yet.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();

      // Client accounts are linked to their coaching record through clients.user_id.
      // This keeps the authentication identity separate from the coach-facing client profile.
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

      const [workoutResult, completedResult] = await Promise.all([
        supabase
          .from('program_workouts')
          .select('id, program_id, title, day_label, instructions, scheduled_date, workout_order')
          .eq('client_id', linkedClient.id)
          .eq('status', 'active')
          .order('scheduled_date', { ascending: true, nullsFirst: false })
          .order('workout_order', { ascending: true })
          .limit(1),
        supabase
          .from('workout_sessions')
          .select('id, program_workout_id, completed_at, review_status')
          .eq('client_id', linkedClient.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(3),
      ]);

      if (workoutResult.error) {
        setMessage(workoutResult.error.message);
        setIsLoading(false);
        return;
      }

      if (completedResult.error) {
        setMessage(completedResult.error.message);
        setIsLoading(false);
        return;
      }

      const recentSessions = (completedResult.data ?? []) as CompletedSessionRecord[];
      setCompletedSessions(recentSessions);

      const completedWorkoutIds = [...new Set(recentSessions.map((session) => session.program_workout_id))];
      if (completedWorkoutIds.length > 0) {
        const { data: titleData } = await supabase
          .from('program_workouts')
          .select('id, title')
          .in('id', completedWorkoutIds);

        const titleMap = ((titleData ?? []) as WorkoutTitleRecord[]).reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = item.title;
          return acc;
        }, {});
        setWorkoutTitles(titleMap);
      }

      const nextWorkout = (workoutResult.data?.[0] ?? null) as ProgramWorkoutRecord | null;
      setWorkout(nextWorkout);

      if (!nextWorkout) {
        setIsLoading(false);
        return;
      }

      const [programResult, exercisesResult] = await Promise.all([
        supabase
          .from('training_programs')
          .select('id, title')
          .eq('id', nextWorkout.program_id)
          .single(),
        supabase
          .from('program_exercises')
          .select('workout_id')
          .eq('workout_id', nextWorkout.id),
      ]);

      if (programResult.error) {
        setMessage(programResult.error.message);
        setIsLoading(false);
        return;
      }

      if (exercisesResult.error) {
        setMessage(exercisesResult.error.message);
        setIsLoading(false);
        return;
      }

      setProgram(programResult.data as TrainingProgramRecord);
      setExerciseCount(((exercisesResult.data ?? []) as ExerciseCountRecord[]).length);
      setIsLoading(false);
    };

    loadAssignedWorkout();
  }, [user]);

  const completedWorkoutsSection = (
    <section>
      <div className="flex items-center justify-between gap-4">
        <SectionHeader title="COMPLETED WORKOUTS" accent />
        <Link href="/client/training/history" className="mb-4 text-xs font-bold uppercase text-[#FA0201] hover:underline">
          View all
        </Link>
      </div>
      <Card>
        {completedSessions.length === 0 ? (
          <p className="text-sm text-gray-600">No completed workouts yet.</p>
        ) : (
          <div className="space-y-4">
            {completedSessions.map((session) => (
              <Link
                key={session.id}
                href="/client/training/history"
                className="block border-b border-gray-200 pb-4 last:border-b-0 last:pb-0 hover:bg-gray-50 rounded-lg"
              >
                <p className="font-bold uppercase text-[#000000]">
                  {workoutTitles[session.program_workout_id] || 'Workout session'}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Completed: {formatDate(session.completed_at)} • Review: {session.review_status}
                </p>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </section>
  );

  if (isLoading) {
    return (
      <div>
        <PageHeader title="START YOUR WORKOUT" />
        <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto">
          <Card><p className="font-semibold text-gray-700">Loading your assigned workout...</p></Card>
        </div>
      </div>
    );
  }

  if (message || !client) {
    return (
      <div>
        <PageHeader title="START YOUR WORKOUT" />
        <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto">
          <Card>
            <p className="font-bold uppercase text-[#000000]">Training not available</p>
            <p className="mt-2 text-sm text-gray-600">{message}</p>
          </Card>
        </div>
      </div>
    );
  }

  if (!workout) {
    return (
      <div>
        <PageHeader title="START YOUR WORKOUT" subtitle={`Welcome, ${client.full_name}`} />
        <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-8">
          {submitted && (
            <Card className="border-2 border-green-200 bg-green-50">
              <p className="text-sm font-bold uppercase text-green-700">Workout submitted successfully.</p>
            </Card>
          )}
          <Card>
            <p className="font-bold uppercase text-[#000000]">No workout assigned yet.</p>
            <p className="mt-2 text-sm text-gray-600">
              Your coach has not assigned an active workout companion session yet.
            </p>
          </Card>
          {completedWorkoutsSection}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="START YOUR WORKOUT" subtitle={`Welcome, ${client.full_name}`} />
      <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-8">
        {submitted && (
          <Card className="border-2 border-green-200 bg-green-50">
            <p className="text-sm font-bold uppercase text-green-700">Workout submitted successfully.</p>
          </Card>
        )}

        <section>
          <SectionHeader title="NEXT SESSION" accent />
          <Card variant="dark" className="p-8">
            <p className="text-sm font-bold uppercase text-[#FA0201] mb-3">
              {program?.title || 'Training programme'}
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-white uppercase tracking-tight">
              Ready to start {workout.title}?
            </h1>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-white/80">
              <div>
                <p className="text-xs font-bold uppercase text-white/50">Day</p>
                <p className="mt-1">{workout.day_label || 'Training day'}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-white/50">Exercises</p>
                <p className="mt-1">{exerciseCount}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-white/50">Scheduled</p>
                <p className="mt-1">{formatDate(workout.scheduled_date)}</p>
              </div>
            </div>
            {workout.instructions && (
              <p className="mt-6 border-t border-gray-700 pt-4 text-sm text-white/75">
                {workout.instructions}
              </p>
            )}
            <div className="mt-8">
              <Link href={`/client/training/${workout.id}`}>
                <Button variant="primary" size="lg" className="bg-[#FA0201] hover:bg-red-700">
                  BEGIN WORKOUT
                </Button>
              </Link>
            </div>
          </Card>
        </section>

        {completedWorkoutsSection}
      </div>
    </div>
  );
}
