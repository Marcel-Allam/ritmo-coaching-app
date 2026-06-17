'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { WorkoutFlagsPanel } from '@/components/coach/workout-flags-panel';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ProgramExerciseRecord = { id: string; exercise_order: number; exercise_name: string; notes: string | null };
type ProgramSetRecord = { id: string; exercise_id: string; set_order: number; target_reps: string | null; target_weight_kg: number | null; target_rpe: number | null; notes: string | null };
type PerformedSetRecord = { id: string; program_exercise_id: string; program_set_id: string | null; set_order: number; actual_weight_kg: number | null; actual_reps: number | null; actual_rpe: number | null; completed: boolean; notes: string | null };

type WorkoutFlagsLoaderProps = {
  clientId: string;
  sessionId: string;
};

export function WorkoutFlagsLoader({ clientId, sessionId }: WorkoutFlagsLoaderProps) {
  const [workoutNote, setWorkoutNote] = useState<string | null>(null);
  const [exercises, setExercises] = useState<ProgramExerciseRecord[]>([]);
  const [programSets, setProgramSets] = useState<ProgramSetRecord[]>([]);
  const [performedSets, setPerformedSets] = useState<PerformedSetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadFlagsData = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: sessionData, error: sessionError } = await supabase
        .from('workout_sessions')
        .select('id, client_id, program_workout_id, client_notes')
        .eq('id', sessionId)
        .eq('client_id', clientId)
        .single();

      if (sessionError || !sessionData) {
        setError(sessionError?.message || 'Workout session not found.');
        setIsLoading(false);
        return;
      }

      const { data: exerciseData, error: exerciseError } = await supabase
        .from('program_exercises')
        .select('id, exercise_order, exercise_name, notes')
        .eq('workout_id', sessionData.program_workout_id)
        .order('exercise_order', { ascending: true });

      if (exerciseError) {
        setError(exerciseError.message);
        setIsLoading(false);
        return;
      }

      const loadedExercises = (exerciseData ?? []) as ProgramExerciseRecord[];
      const exerciseIds = loadedExercises.map((exercise) => exercise.id);

      const [setResult, performedResult] = await Promise.all([
        exerciseIds.length > 0
          ? supabase
              .from('program_sets')
              .select('id, exercise_id, set_order, target_reps, target_weight_kg, target_rpe, notes')
              .in('exercise_id', exerciseIds)
              .order('set_order', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('performed_sets')
          .select('id, program_exercise_id, program_set_id, set_order, actual_weight_kg, actual_reps, actual_rpe, completed, notes')
          .eq('session_id', sessionId)
          .order('set_order', { ascending: true }),
      ]);

      if (setResult.error || performedResult.error) {
        setError(setResult.error?.message || performedResult.error?.message || 'Could not load workout flag data.');
        setIsLoading(false);
        return;
      }

      setWorkoutNote(sessionData.client_notes || null);
      setExercises(loadedExercises);
      setProgramSets((setResult.data ?? []) as ProgramSetRecord[]);
      setPerformedSets((performedResult.data ?? []) as PerformedSetRecord[]);
      setIsLoading(false);
    };

    loadFlagsData();
  }, [clientId, sessionId]);

  const setsByExercise = exercises.reduce<Record<string, ProgramSetRecord[]>>((acc, exercise) => {
    acc[exercise.id] = programSets.filter((set) => set.exercise_id === exercise.id).sort((a, b) => a.set_order - b.set_order);
    return acc;
  }, {});

  const performedByProgramSetId = performedSets.reduce<Record<string, PerformedSetRecord>>((acc, set) => {
    if (set.program_set_id) acc[set.program_set_id] = set;
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="px-6 pt-6 md:px-8 md:pt-8">
        <Card>Loading workout flags...</Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 pt-6 md:px-8 md:pt-8">
        <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>
      </div>
    );
  }

  return (
    <div className="px-6 pt-6 md:px-8 md:pt-8">
      <WorkoutFlagsPanel
        exercises={exercises}
        setsByExercise={setsByExercise}
        performedByProgramSetId={performedByProgramSetId}
        performedSets={performedSets}
        workoutNote={workoutNote}
      />
    </div>
  );
}
