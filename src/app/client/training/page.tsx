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

interface CompletedWorkoutIdRecord {
  program_workout_id: string;
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
  const [workouts, setWorkouts] = useState<ProgramWorkoutRecord[]>([]);
  const [programs, setPrograms] = useState<Record<string, TrainingProgramRecord>>({});
  const [completedSessions, setCompletedSessions] = useState<CompletedSessionRecord[]>([]);
  const [workoutTitles, setWorkoutTitles] = useState<Record<string, string>>({});
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadAssignedWorkouts = async () => {
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

      const [workoutResult, completedResult, completedIdsResult] = await Promise.all([
        supabase
          .from('program_workouts')
          .select('id, program_id, title, scheduled_date, workout_order')
          .eq('client_id', linkedClient.id)
          .eq('status', 'active')
          .order('scheduled_date', { ascending: true, nullsFirst: false })
          .order('workout_order', { ascending: true }),
        supabase
          .from('workout_sessions')
          .select('id, program_workout_id, completed_at, review_status')
          .eq('client_id', linkedClient.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(3),
        supabase
          .from('workout_sessions')
          .select('program_workout_id')
          .eq('client_id', linkedClient.id)
          .eq('status', 'completed'),
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

      if (completedIdsResult.error) {
        setMessage(completedIdsResult.error.message);
        setIsLoading(false);
        return;
      }

      const completedWorkoutIds = new Set(((completedIdsResult.data ?? []) as CompletedWorkoutIdRecord[]).map((session) => session.program_workout_id));
      const upcomingWorkouts = ((workoutResult.data ?? []) as ProgramWorkoutRecord[]).filter((workout) => !completedWorkoutIds.has(workout.id));
      const recentSessions = (completedResult.data ?? []) as CompletedSessionRecord[];
      setWorkouts(upcomingWorkouts);
      setCompletedSessions(recentSessions);

      const completedWorkoutIdsForTitles = [...new Set(recentSessions.map((session) => session.program_workout_id))];
      if (completedWorkoutIdsForTitles.length > 0) {
        const { data: titleData } = await supabase
          .from('program_workouts')
          .select('id, title')
          .in('id', completedWorkoutIdsForTitles);

        const titleMap = ((titleData ?? []) as WorkoutTitleRecord[]).reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = item.title;
          return acc;
        }, {});
        setWorkoutTitles(titleMap);
      }

      const programIds = [...new Set(upcomingWorkouts.map((workout) => workout.program_id))];
      if (programIds.length > 0) {
        const { data: programData, error: programError } = await supabase
          .from('training_programs')
          .select('id, title')
          .in('id', programIds);

        if (programError) {
          setMessage(programError.message);
          setIsLoading(false);
          return;
        }

        const programMap = ((programData ?? []) as TrainingProgramRecord[]).reduce<Record<string, TrainingProgramRecord>>((acc, program) => {
          acc[program.id] = program;
          return acc;
        }, {});
        setPrograms(programMap);
      }

      const workoutIds = upcomingWorkouts.map((workout) => workout.id);
      if (workoutIds.length > 0) {
        const { data: exerciseData, error: exerciseError } = await supabase
          .from('program_exercises')
          .select('workout_id')
          .in('workout_id', workoutIds);

        if (exerciseError) {
          setMessage(exerciseError.message);
          setIsLoading(false);
          return;
        }

        const counts = ((exerciseData ?? []) as ExerciseCountRecord[]).reduce<Record<string, number>>((acc, exercise) => {
          acc[exercise.workout_id] = (acc[exercise.workout_id] || 0) + 1;
          return acc;
        }, {});
        setExerciseCounts(counts);
      }

      setIsLoading(false);
    };

    loadAssignedWorkouts();
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
        <PageHeader title="WORKOUT" />
        <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto">
          <Card><p className="font-semibold text-gray-700">Loading your workouts...</p></Card>
        </div>
      </div>
    );
  }

  if (message || !client) {
    return (
      <div>
        <PageHeader title="WORKOUT" />
        <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto">
          <Card>
            <p className="font-bold uppercase text-[#000000]">Workout area not available</p>
            <p className="mt-2 text-sm text-gray-600">{message}</p>
          </Card>
        </div>
      </div>
    );
  }

  if (workouts.length === 0) {
    return (
      <div>
        <PageHeader title="WORKOUT" subtitle={`Welcome, ${client.full_name}`} />
        <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-8">
          {submitted && (
            <Card className="border-2 border-green-200 bg-green-50">
              <p className="text-sm font-bold uppercase text-green-700">Workout submitted successfully.</p>
            </Card>
          )}
          <Card>
            <p className="font-bold uppercase text-[#000000]">No workouts scheduled yet.</p>
            <p className="mt-2 text-sm text-gray-600">
              Your coach has not scheduled your next workout yet.
            </p>
          </Card>
          {completedWorkoutsSection}
        </div>
      </div>
    );
  }

  const nextWorkout = workouts[0];
  const nextProgram = programs[nextWorkout.program_id];

  return (
    <div>
      <PageHeader title="WORKOUT" subtitle={`Welcome, ${client.full_name}`} />
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
              {nextProgram?.title || 'Training programme'}
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-white uppercase tracking-tight">
              Ready to start {nextWorkout.title}?
            </h1>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-white/80">
              <div>
                <p className="text-xs font-bold uppercase text-white/50">Exercises</p>
                <p className="mt-1">{exerciseCounts[nextWorkout.id] || 0}</p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-white/50">Scheduled</p>
                <p className="mt-1">{formatDate(nextWorkout.scheduled_date)}</p>
              </div>
            </div>
            <div className="mt-8">
              <Link href={`/client/training/${nextWorkout.id}`}>
                <Button variant="primary" size="lg" className="bg-[#FA0201] hover:bg-red-700">
                  BEGIN WORKOUT
                </Button>
              </Link>
            </div>
          </Card>
        </section>

        {workouts.length > 1 && (
          <section>
            <SectionHeader title="UPCOMING WORKOUTS" accent />
            <Card>
              <div className="space-y-4">
                {workouts.slice(1).map((workout) => {
                  const program = programs[workout.program_id];
                  return (
                    <Link key={workout.id} href={`/client/training/${workout.id}`} className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
                      <p className="text-xs font-bold uppercase text-gray-500">{program?.title || 'Training programme'}</p>
                      <p className="mt-1 text-lg font-bold uppercase text-[#000000]">{workout.title}</p>
                      <p className="mt-1 text-sm text-gray-600">Scheduled: {formatDate(workout.scheduled_date)} • Exercises: {exerciseCounts[workout.id] || 0}</p>
                    </Link>
                  );
                })}
              </div>
            </Card>
          </section>
        )}

        {completedWorkoutsSection}
      </div>
    </div>
  );
}
