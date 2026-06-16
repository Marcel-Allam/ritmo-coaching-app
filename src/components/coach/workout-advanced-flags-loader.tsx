'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type FlagTone = 'warning' | 'positive' | 'info';

type ProgramExerciseRecord = {
  id: string;
  exercise_order: number;
  exercise_name: string;
};

type ProgramSetRecord = {
  id: string;
  exercise_id: string;
  set_order: number;
  target_reps: string | null;
  target_weight_kg: number | null;
  target_rpe: number | null;
};

type PerformedSetRecord = {
  id: string;
  program_exercise_id: string;
  program_set_id: string | null;
  set_order: number;
  actual_weight_kg: number | null;
  actual_reps: number | null;
  actual_rpe: number | null;
  completed: boolean;
};

type AdvancedFlag = {
  id: string;
  tone: FlagTone;
  label: string;
  exerciseName?: string;
  detail: string;
  impact: string;
};

type WorkoutAdvancedFlagsLoaderProps = {
  clientId: string;
  sessionId: string;
};

const flagClasses: Record<FlagTone, string> = {
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  positive: 'border-green-200 bg-green-50 text-green-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
};

const flagLabelClasses: Record<FlagTone, string> = {
  warning: 'bg-amber-100 text-amber-700',
  positive: 'bg-green-100 text-green-700',
  info: 'bg-blue-100 text-blue-700',
};

const parseTargetReps = (value: string | null) => {
  if (!value) return { min: null as number | null, max: null as number | null };

  const rangeMatch = value.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };

  const singleMatch = value.match(/\d+/);
  if (!singleMatch) return { min: null, max: null };

  const parsed = Number(singleMatch[0]);
  return { min: parsed, max: parsed };
};

const getActualSet = (set: ProgramSetRecord, exercise: ProgramExerciseRecord, performedSets: PerformedSetRecord[]) => {
  return performedSets.find((performed) => performed.program_set_id === set.id)
    || performedSets.find((performed) => performed.program_exercise_id === exercise.id && performed.set_order === set.set_order);
};

const buildAdvancedFlags = (
  exercises: ProgramExerciseRecord[],
  programSets: ProgramSetRecord[],
  performedSets: PerformedSetRecord[]
) => {
  const flags: AdvancedFlag[] = [];
  let workoutIssueCount = 0;
  const exercisesWithIssues = new Set<string>();

  exercises.forEach((exercise) => {
    const exerciseSets = programSets
      .filter((set) => set.exercise_id === exercise.id)
      .sort((a, b) => a.set_order - b.set_order);

    const loggedSets = exerciseSets
      .map((set) => ({ target: set, actual: getActualSet(set, exercise, performedSets) }))
      .filter((item) => item.actual);

    exerciseSets.forEach((set) => {
      const actual = getActualSet(set, exercise, performedSets);
      const targetReps = parseTargetReps(set.target_reps);

      // Missing data does not always mean poor performance. It means the coach has less reliable data to review.
      if (!actual || actual.actual_reps === null || actual.actual_reps === undefined || actual.actual_weight_kg === null || actual.actual_weight_kg === undefined || actual.actual_rpe === null || actual.actual_rpe === undefined) {
        flags.push({
          id: `${exercise.id}-${set.id}-missing-data`,
          tone: 'info',
          label: 'Missing data',
          exerciseName: exercise.exercise_name,
          detail: `Set ${set.set_order} is missing reps, load, RPE, or the full set log.`,
          impact: 'Coaching decisions are less precise. Ask the client to log this field properly next time.',
        });
      }

      if (!actual) return;

      const repsAboveTarget = targetReps.max !== null && actual.actual_reps !== null && actual.actual_reps !== undefined && actual.actual_reps > targetReps.max;
      const loadAboveTarget = set.target_weight_kg !== null && set.target_weight_kg !== undefined && actual.actual_weight_kg !== null && actual.actual_weight_kg !== undefined && actual.actual_weight_kg > set.target_weight_kg;
      const rpeAboveTarget = set.target_rpe !== null && set.target_rpe !== undefined && actual.actual_rpe !== null && actual.actual_rpe !== undefined && actual.actual_rpe - set.target_rpe >= 1;
      const rpeBelowTarget = set.target_rpe !== null && set.target_rpe !== undefined && actual.actual_rpe !== null && actual.actual_rpe !== undefined && set.target_rpe - actual.actual_rpe >= 1;

      if (repsAboveTarget) {
        flags.push({
          id: `${exercise.id}-${set.id}-extra-reps`,
          tone: 'positive',
          label: 'Extra reps',
          exerciseName: exercise.exercise_name,
          detail: `Set ${set.set_order}: ${actual.actual_reps} reps completed vs ${targetReps.max} planned.`,
          impact: 'Positive performance signal if execution was controlled. Consider progressing load or reps next exposure.',
        });
      }

      if (rpeBelowTarget && actual.completed) {
        flags.push({
          id: `${exercise.id}-${set.id}-rpe-below`,
          tone: 'positive',
          label: 'RPE below target',
          exerciseName: exercise.exercise_name,
          detail: `Set ${set.set_order}: RPE ${actual.actual_rpe} vs target RPE ${set.target_rpe}.`,
          impact: 'The prescription may be too easy. Consider a small progression if reps and load were also completed well.',
        });
      }

      if ((repsAboveTarget || loadAboveTarget) && rpeAboveTarget) {
        workoutIssueCount += 1;
        exercisesWithIssues.add(exercise.id);
        flags.push({
          id: `${exercise.id}-${set.id}-overshooting`,
          tone: 'warning',
          label: 'Overshooting',
          exerciseName: exercise.exercise_name,
          detail: `Set ${set.set_order}: performance exceeded the target, but effort was also above target.`,
          impact: 'Strength is there, but the client may be pushing past the plan. Reinforce controlled progression if needed.',
        });
      }
    });

    // Performance drop compares the first logged set against later sets in the same exercise.
    // This highlights fatigue inside the exercise rather than a single isolated miss.
    if (loggedSets.length >= 2) {
      const firstActual = loggedSets[0].actual;
      if (firstActual?.actual_reps !== null && firstActual?.actual_reps !== undefined) {
        loggedSets.slice(1).forEach((item) => {
          const laterActual = item.actual;
          if (!laterActual || laterActual.actual_reps === null || laterActual.actual_reps === undefined) return;

          const repDrop = firstActual.actual_reps! - laterActual.actual_reps;
          const rpeJump = firstActual.actual_rpe !== null && firstActual.actual_rpe !== undefined && laterActual.actual_rpe !== null && laterActual.actual_rpe !== undefined
            ? laterActual.actual_rpe - firstActual.actual_rpe
            : 0;

          if (repDrop >= 2 || rpeJump >= 1.5) {
            workoutIssueCount += 1;
            exercisesWithIssues.add(exercise.id);
            flags.push({
              id: `${exercise.id}-${item.target.id}-performance-drop`,
              tone: 'warning',
              label: 'Performance drop',
              exerciseName: exercise.exercise_name,
              detail: `Set ${item.target.set_order}: performance dropped from the first logged set by ${repDrop > 0 ? `${repDrop} reps` : `RPE ${rpeJump.toFixed(1)}`}.`,
              impact: 'Fatigue may be accumulating too quickly. Review rest time, load, set count, and exercise order.',
            });
          }
        });
      }
    }
  });

  const warningOrIssueFlags = flags.filter((flag) => flag.tone === 'warning').length + workoutIssueCount;
  if (warningOrIssueFlags >= 4 || exercisesWithIssues.size >= 2) {
    flags.unshift({
      id: 'workout-level-issue',
      tone: 'warning',
      label: 'Workout-level issue',
      detail: `${warningOrIssueFlags} issue signals found across ${exercisesWithIssues.size || 1} exercise area${exercisesWithIssues.size === 1 ? '' : 's'}.`,
      impact: 'This may be broader than one lift. Review recovery, sleep, food, schedule, total session difficulty, and next-week loading.',
    });
  }

  return flags;
};

export function WorkoutAdvancedFlagsLoader({ clientId, sessionId }: WorkoutAdvancedFlagsLoaderProps) {
  const [exercises, setExercises] = useState<ProgramExerciseRecord[]>([]);
  const [programSets, setProgramSets] = useState<ProgramSetRecord[]>([]);
  const [performedSets, setPerformedSets] = useState<PerformedSetRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAdvancedFlags = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: sessionData, error: sessionError } = await supabase
        .from('workout_sessions')
        .select('id, client_id, program_workout_id')
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
        .select('id, exercise_order, exercise_name')
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
              .select('id, exercise_id, set_order, target_reps, target_weight_kg, target_rpe')
              .in('exercise_id', exerciseIds)
              .order('set_order', { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('performed_sets')
          .select('id, program_exercise_id, program_set_id, set_order, actual_weight_kg, actual_reps, actual_rpe, completed')
          .eq('session_id', sessionId)
          .order('set_order', { ascending: true }),
      ]);

      if (setResult.error || performedResult.error) {
        setError(setResult.error?.message || performedResult.error?.message || 'Could not load advanced flag data.');
        setIsLoading(false);
        return;
      }

      setExercises(loadedExercises);
      setProgramSets((setResult.data ?? []) as ProgramSetRecord[]);
      setPerformedSets((performedResult.data ?? []) as PerformedSetRecord[]);
      setIsLoading(false);
    };

    loadAdvancedFlags();
  }, [clientId, sessionId]);

  if (isLoading) return null;

  if (error) {
    return (
      <div className="px-6 pt-6 md:px-8 md:pt-8">
        <Card className="border-2 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </Card>
      </div>
    );
  }

  const flags = buildAdvancedFlags(exercises, programSets, performedSets);
  if (flags.length === 0) return null;

  return (
    <div className="px-6 pt-6 md:px-8 md:pt-8">
      <section>
        <SectionHeader title="ADVANCED WORKOUT FLAGS" accent />
        <Card>
          <div className="space-y-3">
            {flags.map((flag) => (
              <div key={flag.id} className={`rounded-xl border p-4 ${flagClasses[flag.tone]}`}>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase">{flag.label}</p>
                    {flag.exerciseName && <p className="mt-1 text-xs font-bold uppercase opacity-70">{flag.exerciseName}</p>}
                  </div>
                  <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${flagLabelClasses[flag.tone]}`}>{flag.tone}</span>
                </div>
                <p className="mt-3 text-sm font-semibold">{flag.detail}</p>
                <p className="mt-1 text-xs opacity-80"><span className="font-bold">Impact:</span> {flag.impact}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
