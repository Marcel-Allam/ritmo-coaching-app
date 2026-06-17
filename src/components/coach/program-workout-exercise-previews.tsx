'use client';

import { useEffect } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ProgramExerciseRow = {
  id: string;
  workout_id: string;
  exercise_name: string;
  exercise_order: number;
};

type ProgramSetRow = {
  exercise_id: string;
  target_reps: string | null;
  set_order: number;
};

const getWorkoutIdFromHref = (href: string) => {
  const match = href.match(/\/current-workouts\/([^/]+)\/edit/);
  return match?.[1] || null;
};

const getRepresentativeReps = (sets: ProgramSetRow[]) => {
  const firstReps = sets.find((set) => set.target_reps?.trim())?.target_reps?.trim();
  return firstReps || '?';
};

const buildExerciseSummary = (exercise: ProgramExerciseRow, sets: ProgramSetRow[]) => {
  const setCount = sets.length;
  const reps = getRepresentativeReps(sets);
  return `${exercise.exercise_name} × ${setCount || '?'} × ${reps}`;
};

export function ProgramWorkoutExercisePreviews() {
  useEffect(() => {
    let cancelled = false;

    const injectPreviews = async () => {
      if (!isSupabaseConfigured) return;

      const editLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/current-workouts/"][href$="/edit"]'));
      const workoutIds = Array.from(new Set(editLinks.map((link) => getWorkoutIdFromHref(link.href)).filter(Boolean))) as string[];

      if (workoutIds.length === 0) return;

      const supabase = createClient();
      const { data: exerciseData, error: exerciseError } = await supabase
        .from('program_exercises')
        .select('id, workout_id, exercise_name, exercise_order')
        .in('workout_id', workoutIds)
        .order('exercise_order', { ascending: true });

      if (cancelled || exerciseError) return;

      const exercises = (exerciseData ?? []) as ProgramExerciseRow[];
      const exerciseIds = exercises.map((exercise) => exercise.id);
      const { data: setData, error: setError } = exerciseIds.length
        ? await supabase
            .from('program_sets')
            .select('exercise_id, target_reps, set_order')
            .in('exercise_id', exerciseIds)
            .order('set_order', { ascending: true })
        : { data: [], error: null };

      if (cancelled || setError) return;

      const sets = (setData ?? []) as ProgramSetRow[];
      const exercisesByWorkout = exercises.reduce<Record<string, ProgramExerciseRow[]>>((acc, exercise) => {
        acc[exercise.workout_id] = [...(acc[exercise.workout_id] || []), exercise];
        return acc;
      }, {});
      const setsByExercise = sets.reduce<Record<string, ProgramSetRow[]>>((acc, set) => {
        acc[set.exercise_id] = [...(acc[set.exercise_id] || []), set];
        return acc;
      }, {});

      editLinks.forEach((link) => {
        const workoutId = getWorkoutIdFromHref(link.href);
        if (!workoutId) return;

        const workoutCard = link.closest('div.rounded-xl.border.border-gray-200.bg-white.p-4');
        if (!workoutCard || workoutCard.querySelector('[data-ritmo-exercise-preview="true"]')) return;

        const workoutExercises = exercisesByWorkout[workoutId] || [];
        if (workoutExercises.length === 0) return;

        const preview = document.createElement('details');
        preview.dataset.ritmoExercisePreview = 'true';
        preview.className = 'mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3';

        const summary = document.createElement('summary');
        summary.className = 'cursor-pointer text-xs font-black uppercase text-[#000000]';
        summary.textContent = `Show exercises (${workoutExercises.length})`;
        preview.appendChild(summary);

        const list = document.createElement('div');
        list.className = 'mt-3 grid grid-cols-1 gap-2 md:grid-cols-2';

        workoutExercises
          .sort((a, b) => a.exercise_order - b.exercise_order)
          .forEach((exercise) => {
            const item = document.createElement('div');
            item.className = 'rounded-md bg-white px-3 py-2 text-xs font-bold uppercase text-gray-700';
            item.textContent = buildExerciseSummary(exercise, setsByExercise[exercise.id] || []);
            list.appendChild(item);
          });

        preview.appendChild(list);
        workoutCard.appendChild(preview);
      });
    };

    const timeoutId = window.setTimeout(injectPreviews, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  return null;
}
