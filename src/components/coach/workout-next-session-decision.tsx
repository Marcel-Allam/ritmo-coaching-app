'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Textarea } from '@/components/ui/textarea';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type DecisionValue =
  | 'keep_as_planned'
  | 'increase_load'
  | 'reduce_load'
  | 'reduce_volume'
  | 'repeat_session'
  | 'swap_exercise'
  | 'add_technique_cue'
  | 'needs_follow_up';

type DecisionOption = {
  value: DecisionValue;
  label: string;
  priority: 'low' | 'medium' | 'high';
};

type WorkoutSessionRecord = {
  id: string;
  client_id: string;
  program_workout_id: string;
};

type ProgramWorkoutRecord = {
  id: string;
  program_id: string;
  title: string;
  scheduled_date: string | null;
  workout_order: number | null;
  instructions: string | null;
};

type FutureProgramExerciseRecord = {
  id: string;
  workout_id: string;
  exercise_name: string;
};

type CatalogueExerciseRecord = {
  id: string;
  name: string;
};

type WorkoutNextSessionDecisionProps = {
  clientId: string;
  sessionId: string;
};

const decisionOptions: DecisionOption[] = [
  { value: 'keep_as_planned', label: 'Keep as planned', priority: 'low' },
  { value: 'increase_load', label: 'Increase load', priority: 'medium' },
  { value: 'reduce_load', label: 'Reduce load', priority: 'medium' },
  { value: 'reduce_volume', label: 'Reduce volume', priority: 'medium' },
  { value: 'repeat_session', label: 'Repeat session', priority: 'medium' },
  { value: 'swap_exercise', label: 'Swap exercise', priority: 'medium' },
  { value: 'add_technique_cue', label: 'Add technique cue', priority: 'low' },
  { value: 'needs_follow_up', label: 'Needs follow-up', priority: 'high' },
];

const todayDate = () => new Date().toISOString().slice(0, 10);
const numberOrNull = (value: string) => (value.trim() ? Number(value) : null);

const formatDate = (value: string | null) => {
  if (!value) return 'No date set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const findCurrentWorkoutIndex = (currentWorkout: ProgramWorkoutRecord, workouts: ProgramWorkoutRecord[]) => {
  return workouts.findIndex((workout) => workout.id === currentWorkout.id);
};

const findFutureWorkouts = (currentWorkout: ProgramWorkoutRecord, workouts: ProgramWorkoutRecord[]) => {
  const currentIndex = findCurrentWorkoutIndex(currentWorkout, workouts);
  if (currentIndex >= 0) return workouts.slice(currentIndex + 1);

  return workouts.filter((workout) => workout.id !== currentWorkout.id);
};

export function WorkoutNextSessionDecision({ clientId, sessionId }: WorkoutNextSessionDecisionProps) {
  const [decision, setDecision] = useState<DecisionValue>('keep_as_planned');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [programId, setProgramId] = useState<string | null>(null);
  const [workoutTitle, setWorkoutTitle] = useState('Completed workout');
  const [futureWorkouts, setFutureWorkouts] = useState<ProgramWorkoutRecord[]>([]);
  const [futureExercises, setFutureExercises] = useState<FutureProgramExerciseRecord[]>([]);
  const [catalogueExercises, setCatalogueExercises] = useState<CatalogueExerciseRecord[]>([]);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [swapScope, setSwapScope] = useState<'programme_rule' | 'all_future_program'>('programme_rule');
  const [exerciseToReplace, setExerciseToReplace] = useState('');
  const [replacementExercise, setReplacementExercise] = useState('');
  const [replacementSetCount, setReplacementSetCount] = useState('3');
  const [replacementReps, setReplacementReps] = useState('');
  const [replacementKg, setReplacementKg] = useState('');
  const [replacementRpe, setReplacementRpe] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWorkoutContext = async () => {
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

      const session = sessionData as WorkoutSessionRecord;
      const { data: currentWorkoutData, error: workoutError } = await supabase
        .from('program_workouts')
        .select('id, program_id, title, scheduled_date, workout_order, instructions')
        .eq('id', session.program_workout_id)
        .single();

      if (workoutError || !currentWorkoutData) {
        setError(workoutError?.message || 'Workout not found.');
        setIsLoading(false);
        return;
      }

      const currentWorkout = currentWorkoutData as ProgramWorkoutRecord;
      setProgramId(currentWorkout.program_id);
      setWorkoutTitle(currentWorkout.title || 'Completed workout');

      const { data: workoutListData, error: workoutListError } = await supabase
        .from('program_workouts')
        .select('id, program_id, title, scheduled_date, workout_order, instructions')
        .eq('client_id', clientId)
        .eq('program_id', currentWorkout.program_id)
        .eq('status', 'active')
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .order('workout_order', { ascending: true });

      if (workoutListError) {
        setError(workoutListError.message);
        setIsLoading(false);
        return;
      }

      const orderedWorkouts = (workoutListData ?? []) as ProgramWorkoutRecord[];
      const upcomingWorkouts = findFutureWorkouts(currentWorkout, orderedWorkouts);
      setFutureWorkouts(upcomingWorkouts);

      const futureWorkoutIds = upcomingWorkouts.map((workout) => workout.id);
      const [exerciseResult, catalogueResult] = await Promise.all([
        futureWorkoutIds.length > 0
          ? supabase
              .from('program_exercises')
              .select('id, workout_id, exercise_name')
              .in('workout_id', futureWorkoutIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('exercise_catalogue')
          .select('id, name')
          .eq('is_active', true)
          .order('name', { ascending: true }),
      ]);

      if (exerciseResult.error || catalogueResult.error) {
        setError(exerciseResult.error?.message || catalogueResult.error?.message || 'Could not load swap exercise data.');
        setIsLoading(false);
        return;
      }

      setFutureExercises((exerciseResult.data ?? []) as FutureProgramExerciseRecord[]);
      setCatalogueExercises((catalogueResult.data ?? []) as CatalogueExerciseRecord[]);
      setIsLoading(false);
    };

    loadWorkoutContext();
  }, [clientId, sessionId]);

  const selectedDecision = decisionOptions.find((option) => option.value === decision) || decisionOptions[0];
  const scopedWorkoutIds = swapScope === 'all_future_program' ? futureWorkouts.map((workout) => workout.id) : [];

  const exerciseOptions = useMemo(() => {
    return Array.from(new Set(
      futureExercises
        .filter((exercise) => scopedWorkoutIds.includes(exercise.workout_id))
        .map((exercise) => exercise.exercise_name)
        .filter(Boolean)
    )).sort();
  }, [futureExercises, scopedWorkoutIds]);

  const previewWorkouts = futureWorkouts.filter((workout) => scopedWorkoutIds.includes(workout.id));

  const buildDecisionDescription = (extraLines: string[] = []) => [
    `Programme adjustment decision: ${selectedDecision.label}`,
    adjustmentNote.trim() ? `Adjustment note: ${adjustmentNote.trim()}` : null,
    ...extraLines,
  ]
    .filter(Boolean)
    .join('\n\n');

  const createProgrammeAction = async (extraLines: string[] = []) => {
    const supabase = createClient();

    return supabase.from('coach_actions').insert({
      client_id: clientId,
      action_type: 'programme_adjustment',
      description: buildDecisionDescription(extraLines),
      priority: selectedDecision.priority,
      due_date: todayDate(),
      status: 'new',
      notes: `Created from workout review. Programme ID: ${programId || 'unknown'}. Reviewed workout: ${workoutTitle}. Session ID: ${sessionId}.`,
    });
  };

  const saveDecision = async () => {
    if (!isSupabaseConfigured) return;

    setIsSaving(true);
    setMessage(null);
    setError(null);

    const { error: actionError } = await createProgrammeAction(['Saved for next programme planning.']);

    if (actionError) {
      setError(actionError.message);
      setIsSaving(false);
      return;
    }

    setMessage('Programme adjustment saved as a coach action.');
    setAdjustmentNote('');
    setIsSaving(false);
  };

  const applySwapExercise = async () => {
    if (!isSupabaseConfigured) return;

    if (!exerciseToReplace.trim() || !replacementExercise) {
      throw new Error('Choose or type the exercise to replace and choose the replacement exercise.');
    }

    const setCount = Math.max(1, Number(replacementSetCount) || 1);
    if (!replacementReps.trim()) {
      throw new Error('Add the target reps for the replacement exercise.');
    }

    const affectedExercises = futureExercises.filter((exercise) => (
      scopedWorkoutIds.includes(exercise.workout_id) && exercise.exercise_name === exerciseToReplace.trim()
    ));

    if (swapScope === 'all_future_program' && affectedExercises.length > 0) {
      const affectedExerciseIds = affectedExercises.map((exercise) => exercise.id);
      const supabase = createClient();

      const { error: exerciseUpdateError } = await supabase
        .from('program_exercises')
        .update({ exercise_name: replacementExercise })
        .in('id', affectedExerciseIds);

      if (exerciseUpdateError) throw exerciseUpdateError;

      const { error: deleteSetsError } = await supabase
        .from('program_sets')
        .delete()
        .in('exercise_id', affectedExerciseIds);

      if (deleteSetsError) throw deleteSetsError;

      const setRows = affectedExerciseIds.flatMap((exerciseId) => (
        Array.from({ length: setCount }, (_, index) => ({
          exercise_id: exerciseId,
          set_order: index + 1,
          target_reps: replacementReps.trim(),
          target_weight_kg: numberOrNull(replacementKg),
          target_rpe: numberOrNull(replacementRpe),
          target_rir: null,
          notes: null,
        }))
      ));

      const { error: insertSetsError } = await supabase.from('program_sets').insert(setRows);
      if (insertSetsError) throw insertSetsError;

      setFutureExercises((current) => current.map((exercise) => (
        affectedExerciseIds.includes(exercise.id) ? { ...exercise, exercise_name: replacementExercise } : exercise
      )));
    }

    const { error: actionError } = await createProgrammeAction([
      `Swap rule: ${exerciseToReplace.trim()} → ${replacementExercise}`,
      `Scope: ${swapScope === 'all_future_program' ? 'Updated matching future rows already planned' : 'Programme planning rule for next week'}`,
      `Prescription: ${setCount} sets x ${replacementReps}${replacementKg.trim() ? ` @ ${replacementKg}kg` : ''}${replacementRpe.trim() ? `, target RPE ${replacementRpe}` : ''}`,
      swapScope === 'all_future_program' && affectedExercises.length === 0 ? 'No existing future rows matched yet, so this has been saved as a programme planning action.' : '',
    ]);

    if (actionError) throw actionError;
  };

  const confirmApply = async () => {
    if (!isSupabaseConfigured) return;

    setIsApplying(true);
    setMessage(null);
    setError(null);

    try {
      if (decision === 'swap_exercise') {
        await applySwapExercise();
        setMessage('Exercise swap saved to the programme workflow.');
      } else {
        const { error: actionError } = await createProgrammeAction(['Saved for next programme planning.']);
        if (actionError) throw actionError;
        setMessage('Programme adjustment saved for next week planning.');
      }

      setAdjustmentNote('');
      setShowApplyModal(false);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Could not apply decision.');
    } finally {
      setIsApplying(false);
    }
  };

  const openApplyModal = () => {
    setError(null);
    setMessage(null);
    setShowApplyModal(true);
  };

  if (isLoading) return null;

  return (
    <div className="px-6 pt-4 md:px-8 md:pt-5">
      <section>
        <SectionHeader title="PROGRAMME ADJUSTMENT DECISION" accent />
        <Card className="space-y-4 p-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <p className="font-bold uppercase text-gray-500">Programme workflow</p>
            <p className="mt-1 font-semibold text-[#000000]">
              This decision is saved for week-to-week programme planning, not attached to one scheduled workout.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[240px_1fr]">
            <div>
              <label htmlFor="programme-adjustment-decision" className="text-xs font-bold uppercase text-gray-500">
                Coach decision
              </label>
              <select
                id="programme-adjustment-decision"
                value={decision}
                onChange={(event) => setDecision(event.target.value as DecisionValue)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-[#000000] outline-none focus:border-[#FA0201]"
              >
                {decisionOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <Textarea
              label="Adjustment note"
              value={adjustmentNote}
              onChange={(event) => setAdjustmentNote(event.target.value)}
              placeholder="Example: Bench Press — reduce next week loading and cue tighter pause."
            />
          </div>

          {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
          {message && <p className="text-xs font-semibold text-green-700">{message}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isSaving || isApplying}
              onClick={saveDecision}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50 disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save action only'}
            </button>
            <button
              type="button"
              disabled={isSaving || isApplying}
              onClick={openApplyModal}
              className="rounded-lg bg-[#000000] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-gray-900 disabled:opacity-60"
            >
              Apply to programme
            </button>
          </div>
        </Card>
      </section>

      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase text-[#FA0201]">Apply programme decision</p>
                <h2 className="text-2xl font-black uppercase text-[#000000]">{selectedDecision.label}</h2>
                <p className="mt-1 text-sm text-gray-600">No redirect. Save this against the programme workflow for next week planning.</p>
              </div>
              <button type="button" onClick={() => setShowApplyModal(false)} className="text-xl font-black text-gray-400 hover:text-[#000000]">×</button>
            </div>

            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
              <p className="font-bold uppercase text-gray-500">Programme impact preview</p>
              {swapScope === 'all_future_program' ? (
                <ul className="mt-2 space-y-1 font-semibold text-[#000000]">
                  {previewWorkouts.length > 0 ? previewWorkouts.map((workout) => (
                    <li key={workout.id}>{workout.title} • {formatDate(workout.scheduled_date)}</li>
                  )) : <li>No future workout rows exist yet. The decision will be saved as a programme planning action.</li>}
                </ul>
              ) : (
                <p className="mt-2 font-semibold text-[#000000]">Saved as a programme planning rule for the next week you build.</p>
              )}
            </div>

            {decision === 'swap_exercise' ? (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs font-bold uppercase text-gray-500">Apply behaviour</label>
                  <select value={swapScope} onChange={(event) => setSwapScope(event.target.value as 'programme_rule' | 'all_future_program')} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-[#000000] outline-none focus:border-[#FA0201]">
                    <option value="programme_rule">Programme planning rule for next week</option>
                    <option value="all_future_program">Update matching future rows already planned</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Exercise to swap out</label>
                    <input list="programme-exercises" value={exerciseToReplace} onChange={(event) => setExerciseToReplace(event.target.value)} placeholder="Type or choose exercise" className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-[#000000] outline-none focus:border-[#FA0201]" />
                    <datalist id="programme-exercises">
                      {exerciseOptions.map((exercise) => <option key={exercise} value={exercise} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Replace with</label>
                    <select value={replacementExercise} onChange={(event) => setReplacementExercise(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-[#000000] outline-none focus:border-[#FA0201]">
                      <option value="">Choose replacement</option>
                      {catalogueExercises.map((exercise) => <option key={exercise.id} value={exercise.name}>{exercise.name}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Sets</label>
                    <input type="number" min="1" step="1" value={replacementSetCount} onChange={(event) => setReplacementSetCount(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold outline-none focus:border-[#FA0201]" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Reps</label>
                    <input value={replacementReps} onChange={(event) => setReplacementReps(event.target.value)} placeholder="6-8" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold outline-none focus:border-[#FA0201]" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Kg</label>
                    <input type="number" step="2.5" value={replacementKg} onChange={(event) => setReplacementKg(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold outline-none focus:border-[#FA0201]" />
                  </div>
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-500">Target RPE</label>
                    <input type="number" min="1" max="10" step="0.5" value={replacementRpe} onChange={(event) => setReplacementRpe(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold outline-none focus:border-[#FA0201]" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-bold uppercase">Programme planning action</p>
                <p className="mt-1">This will save the decision as a programme adjustment for the next week you build. It will not attach a note to one scheduled workout.</p>
              </div>
            )}

            {error && <p className="mt-4 text-xs font-semibold text-red-700">{error}</p>}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setShowApplyModal(false)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50">Cancel</button>
              <button type="button" disabled={isApplying} onClick={confirmApply} className="rounded-lg bg-[#000000] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-gray-900 disabled:opacity-60">
                {isApplying ? 'Applying...' : 'Confirm change'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
