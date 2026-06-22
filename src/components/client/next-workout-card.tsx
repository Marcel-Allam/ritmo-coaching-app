'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ProgramWorkoutRecord = {
  id: string;
  program_id: string;
  title: string;
  workout_order: number;
};

type TrainingProgramRecord = {
  id: string;
  title: string;
};

type ExerciseCountRecord = {
  workout_id: string;
};

type CompletedSessionRecord = {
  program_workout_id: string;
  completed_at: string | null;
};

type WorkoutHistoryStats = {
  count: number;
  lastCompletedAt: string | null;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not logged yet';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

export function NextWorkoutCard({ clientId }: { clientId: string }) {
  const [workouts, setWorkouts] = useState<ProgramWorkoutRecord[]>([]);
  const [programs, setPrograms] = useState<Record<string, TrainingProgramRecord>>({});
  const [completedSessions, setCompletedSessions] = useState<CompletedSessionRecord[]>([]);
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadNextWorkout = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const [workoutResult, completedResult] = await Promise.all([
        supabase
          .from('program_workouts')
          .select('id, program_id, title, workout_order')
          .eq('client_id', clientId)
          .eq('status', 'active')
          .order('workout_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('workout_sessions')
          .select('program_workout_id, completed_at')
          .eq('client_id', clientId)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false }),
      ]);

      if (workoutResult.error || completedResult.error) {
        setError(workoutResult.error?.message || completedResult.error?.message || 'Could not load next workout.');
        setLoading(false);
        return;
      }

      const loadedWorkouts = (workoutResult.data ?? []) as ProgramWorkoutRecord[];
      const loadedCompletedSessions = (completedResult.data ?? []) as CompletedSessionRecord[];
      setWorkouts(loadedWorkouts);
      setCompletedSessions(loadedCompletedSessions);

      const programIds = [...new Set(loadedWorkouts.map((workout) => workout.program_id))];
      if (programIds.length > 0) {
        const { data: programData, error: programError } = await supabase
          .from('training_programs')
          .select('id, title')
          .in('id', programIds);

        if (programError) {
          setError(programError.message);
          setLoading(false);
          return;
        }

        const programMap = ((programData ?? []) as TrainingProgramRecord[]).reduce<Record<string, TrainingProgramRecord>>((acc, program) => {
          acc[program.id] = program;
          return acc;
        }, {});
        setPrograms(programMap);
      }

      const workoutIds = loadedWorkouts.map((workout) => workout.id);
      if (workoutIds.length > 0) {
        const { data: exerciseData, error: exerciseError } = await supabase
          .from('program_exercises')
          .select('workout_id')
          .in('workout_id', workoutIds);

        if (exerciseError) {
          setError(exerciseError.message);
          setLoading(false);
          return;
        }

        const counts = ((exerciseData ?? []) as ExerciseCountRecord[]).reduce<Record<string, number>>((acc, exercise) => {
          acc[exercise.workout_id] = (acc[exercise.workout_id] || 0) + 1;
          return acc;
        }, {});
        setExerciseCounts(counts);
      }

      setLoading(false);
    };

    loadNextWorkout();
  }, [clientId]);

  const workoutHistoryStats = useMemo(() => {
    return completedSessions.reduce<Record<string, WorkoutHistoryStats>>((acc, session) => {
      const current = acc[session.program_workout_id] || { count: 0, lastCompletedAt: null };
      const sessionTime = session.completed_at ? new Date(session.completed_at).getTime() : 0;
      const currentTime = current.lastCompletedAt ? new Date(current.lastCompletedAt).getTime() : 0;

      acc[session.program_workout_id] = {
        count: current.count + 1,
        lastCompletedAt: sessionTime > currentTime ? session.completed_at : current.lastCompletedAt,
      };
      return acc;
    }, {});
  }, [completedSessions]);

  const latestCompletedWorkoutId = completedSessions.find((session) => workouts.some((workout) => workout.id === session.program_workout_id))?.program_workout_id ?? null;
  const latestCompletedWorkoutIndex = workouts.findIndex((workout) => workout.id === latestCompletedWorkoutId);
  const nextWorkout = workouts.length > 0 ? workouts[(latestCompletedWorkoutIndex + 1) % workouts.length] : null;

  if (loading) {
    return <Card><p className="text-sm font-semibold text-gray-700">Loading next workout...</p></Card>;
  }

  if (error) {
    return <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>;
  }

  if (!nextWorkout) {
    return (
      <Card className="h-full border-2 border-dashed border-gray-300 bg-gray-50">
        <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Next workout</p>
        <h2 className="mt-2 text-2xl font-black uppercase text-[#000000]">No workout assigned</h2>
        <p className="mt-3 text-sm text-gray-700">Your coach has not assigned an active programme workout yet.</p>
      </Card>
    );
  }

  const program = programs[nextWorkout.program_id];
  const stats = workoutHistoryStats[nextWorkout.id];
  const exerciseCount = exerciseCounts[nextWorkout.id] || 0;

  return (
    <Card className="flex h-full flex-col justify-between p-6">
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Next workout</p>
        <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-[#000000]">{nextWorkout.title}</h2>
        <p className="mt-2 text-sm font-bold uppercase text-gray-500">{program?.title || 'Training programme'}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-gray-100 p-3">
            <p className="text-[10px] font-bold uppercase text-gray-500">Exercises</p>
            <p className="mt-1 text-lg font-black text-[#000000]">{exerciseCount}</p>
          </div>
          <div className="rounded-lg bg-gray-100 p-3">
            <p className="text-[10px] font-bold uppercase text-gray-500">Sessions logged</p>
            <p className="mt-1 text-lg font-black text-[#000000]">{stats?.count || 0}</p>
          </div>
        </div>
        <p className="mt-4 text-xs font-bold uppercase text-gray-500">Last done: {formatDate(stats?.lastCompletedAt ?? null)}</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href={`/client/training/${nextWorkout.id}?view=focus`} className="rounded-lg bg-[#FA0201] px-4 py-3 text-xs font-black uppercase text-white hover:bg-red-700">
          Start workout
        </Link>
        <Link href={`/client/training/${nextWorkout.id}/view`} className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-xs font-black uppercase text-[#000000] hover:bg-gray-50">
          View workout
        </Link>
      </div>
    </Card>
  );
}
