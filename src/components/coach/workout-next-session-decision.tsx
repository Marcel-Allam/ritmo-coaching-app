'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Textarea } from '@/components/ui/textarea';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type FeedbackActionValue =
  | 'increase_load'
  | 'repeat_load'
  | 'reduce_load'
  | 'technique_issue'
  | 'programme_adjustment';

type FeedbackActionOption = {
  value: FeedbackActionValue;
  label: string;
  helpText: string;
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
};

type ProgramExerciseRecord = {
  id: string;
  workout_id: string;
  exercise_name: string;
};

type ProgramSetRecord = {
  exercise_id: string;
  target_weight_kg: number | null;
};

type WorkoutNextSessionDecisionProps = {
  clientId: string;
  sessionId: string;
};

const feedbackActions: FeedbackActionOption[] = [
  {
    value: 'increase_load',
    label: 'Increase load next time',
    helpText: 'Creates a programme adjustment action to increase the selected exercise load.',
    priority: 'medium',
  },
  {
    value: 'repeat_load',
    label: 'Repeat same load',
    helpText: 'Creates a programme adjustment action to keep the selected exercise load unchanged next time.',
    priority: 'low',
  },
  {
    value: 'reduce_load',
    label: 'Reduce load',
    helpText: 'Creates a programme adjustment action to reduce the selected exercise load.',
    priority: 'medium',
  },
  {
    value: 'technique_issue',
    label: 'Technique issue',
    helpText: 'Saves a coach-only technique note. It does not create a programme action.',
    priority: 'low',
  },
  {
    value: 'programme_adjustment',
    label: 'Create programme adjustment',
    helpText: 'Creates an action to edit the current workout and relevant future workouts manually.',
    priority: 'high',
  },
];

const loadChangeOptionsKg = Array.from({ length: 10 }, (_, index) => (index + 1) * 2.5);
const todayDate = () => new Date().toISOString().slice(0, 10);

const formatDate = (value: string | null) => {
  if (!value) return 'Unscheduled';

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

const formatLoadChange = (loadChangeKg: number, baseLoadKg: number | null) => {
  if (!baseLoadKg || baseLoadKg <= 0) return `${loadChangeKg}kg`;

  const percentage = Number(((loadChangeKg / baseLoadKg) * 100).toFixed(1));
  const cleanPercentage = Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(1);
  return `${loadChangeKg}kg / ${cleanPercentage}%`;
};

export function WorkoutNextSessionDecision({ clientId, sessionId }: WorkoutNextSessionDecisionProps) {
  const [action, setAction] = useState<FeedbackActionValue>('increase_load');
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [loadChangeKg, setLoadChangeKg] = useState('2.5');
  const [coachNote, setCoachNote] = useState('');
  const [currentWorkout, setCurrentWorkout] = useState<ProgramWorkoutRecord | null>(null);
  const [reviewedExercises, setReviewedExercises] = useState<ProgramExerciseRecord[]>([]);
  const [programSets, setProgramSets] = useState<ProgramSetRecord[]>([]);
  const [futureWorkouts, setFutureWorkouts] = useState<ProgramWorkoutRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
        .select('id, program_id, title, scheduled_date, workout_order')
        .eq('id', session.program_workout_id)
        .single();

      if (workoutError || !currentWorkoutData) {
        setError(workoutError?.message || 'Workout not found.');
        setIsLoading(false);
        return;
      }

      const loadedCurrentWorkout = currentWorkoutData as ProgramWorkoutRecord;
      setCurrentWorkout(loadedCurrentWorkout);

      const { data: workoutListData, error: workoutListError } = await supabase
        .from('program_workouts')
        .select('id, program_id, title, scheduled_date, workout_order')
        .eq('client_id', clientId)
        .eq('program_id', loadedCurrentWorkout.program_id)
        .eq('status', 'active')
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .order('workout_order', { ascending: true });

      if (workoutListError) {
        setError(workoutListError.message);
        setIsLoading(false);
        return;
      }

      const orderedWorkouts = (workoutListData ?? []) as ProgramWorkoutRecord[];
      setFutureWorkouts(findFutureWorkouts(loadedCurrentWorkout, orderedWorkouts));

      const { data: exerciseData, error: exerciseError } = await supabase
        .from('program_exercises')
        .select('id, workout_id, exercise_name')
        .eq('workout_id', loadedCurrentWorkout.id)
        .order('exercise_order', { ascending: true });

      if (exerciseError) {
        setError(exerciseError.message);
        setIsLoading(false);
        return;
      }

      const loadedExercises = (exerciseData ?? []) as ProgramExerciseRecord[];
      setReviewedExercises(loadedExercises);
      setSelectedExerciseId(loadedExercises[0]?.id || '');

      const exerciseIds = loadedExercises.map((exercise) => exercise.id);
      const setResult = exerciseIds.length
        ? await supabase
            .from('program_sets')
            .select('exercise_id, target_weight_kg')
            .in('exercise_id', exerciseIds)
        : { data: [], error: null };

      if (setResult.error) {
        setError(setResult.error.message);
        setIsLoading(false);
        return;
      }

      setProgramSets((setResult.data ?? []) as ProgramSetRecord[]);
      setIsLoading(false);
    };

    loadWorkoutContext();
  }, [clientId, sessionId]);

  const selectedAction = feedbackActions.find((option) => option.value === action) || feedbackActions[0];
  const selectedExercise = reviewedExercises.find((exercise) => exercise.id === selectedExerciseId) || reviewedExercises[0] || null;

  const baseLoadKg = useMemo(() => {
    if (!selectedExercise) return null;

    const exerciseLoads = programSets
      .filter((set) => set.exercise_id === selectedExercise.id && typeof set.target_weight_kg === 'number')
      .map((set) => set.target_weight_kg as number);

    if (exerciseLoads.length === 0) return null;
    return Math.max(...exerciseLoads);
  }, [programSets, selectedExercise]);

  const loadChangeNumber = Number(loadChangeKg) || 2.5;
  const loadChangeSummary = formatLoadChange(loadChangeNumber, baseLoadKg);
  const futureWorkoutSummary = futureWorkouts.length > 0
    ? futureWorkouts.map((workout) => `${workout.title} (${formatDate(workout.scheduled_date)})`).join(', ')
    : 'No future workouts are currently scheduled; apply this when building/editing the next sessions.';

  const markReviewNeedsAction = async () => {
    const supabase = createClient();
    await Promise.all([
      supabase
        .from('workout_sessions')
        .update({ review_status: 'needs_action' })
        .eq('id', sessionId)
        .eq('client_id', clientId),
      supabase
        .from('task_submissions')
        .update({ review_status: 'needs_action', followup_required: true })
        .eq('client_id', clientId)
        .eq('submission_type', 'workout_session')
        .eq('answer_text', sessionId),
    ]);
  };

  const createActionDescription = () => {
    const exerciseName = selectedExercise?.exercise_name || 'selected exercise';
    const noteLine = coachNote.trim() ? `Coach note: ${coachNote.trim()}` : null;
    const baseLine = baseLoadKg ? `Current prescribed top set/reference load: ${baseLoadKg}kg.` : 'No prescribed reference load found, so percentage could not be calculated.';

    if (action === 'increase_load') {
      return [
        `Increase load next time for ${exerciseName} by ${loadChangeSummary}.`,
        baseLine,
        noteLine,
      ].filter(Boolean).join('\n\n');
    }

    if (action === 'repeat_load') {
      return [
        `Repeat the same load next time for ${exerciseName}.`,
        baseLine,
        noteLine,
      ].filter(Boolean).join('\n\n');
    }

    if (action === 'reduce_load') {
      return [
        `Reduce load next time for ${exerciseName} by ${loadChangeSummary}.`,
        baseLine,
        noteLine,
      ].filter(Boolean).join('\n\n');
    }

    return [
      `Create programme adjustment for ${exerciseName}.`,
      'Edit the current workout and any relevant future workouts manually from the client programme/workout editor.',
      `Future workout context: ${futureWorkoutSummary}`,
      noteLine,
    ].filter(Boolean).join('\n\n');
  };

  const saveTechniqueNote = async () => {
    if (!selectedExercise) throw new Error('Choose an exercise first.');

    const note = coachNote.trim() || `Technique issue noted for ${selectedExercise.exercise_name}. Review cueing before the next exposure.`;
    const supabase = createClient();
    const { error: noteError } = await supabase.from('feedback_notes').insert({
      client_id: clientId,
      feedback_date: todayDate(),
      main_win: null,
      main_focus: `Technique issue — ${selectedExercise.exercise_name}`,
      agreed_action: note,
      plan_change: `Coach-only note from workout review: ${currentWorkout?.title || 'completed workout'}. Session ID: ${sessionId}.`,
      client_visible: false,
    });

    if (noteError) throw noteError;
  };

  const saveStructuredFeedbackAction = async () => {
    if (!isSupabaseConfigured) return;
    if (!selectedExercise) {
      setError('Choose an exercise before saving an action.');
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      if (action === 'technique_issue') {
        await saveTechniqueNote();
        setMessage(`Technique note saved for ${selectedExercise.exercise_name}.`);
        setCoachNote('');
        setIsSaving(false);
        return;
      }

      const supabase = createClient();
      const { error: actionError } = await supabase.from('coach_actions').insert({
        client_id: clientId,
        action_type: 'programme_adjustment',
        description: createActionDescription(),
        priority: selectedAction.priority,
        due_date: todayDate(),
        status: 'new',
        notes: `Created from workout review. Reviewed workout: ${currentWorkout?.title || 'unknown workout'}. Session ID: ${sessionId}. Action type: ${selectedAction.label}.`,
      });

      if (actionError) throw actionError;

      await markReviewNeedsAction();
      setMessage(`${selectedAction.label} saved as a programme action for ${selectedExercise.exercise_name}.`);
      setCoachNote('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save structured feedback action.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <div className="px-6 pt-4 md:px-8 md:pt-5">
      <section>
        <SectionHeader title="NEXT WORKOUT ACTION" accent />
        <Card className="space-y-5 p-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <p className="font-bold uppercase text-gray-500">Structured feedback → action</p>
            <p className="mt-1 font-semibold text-[#000000]">
              Choose the exercise, choose the feedback decision, then create the next programme action. Technique issues are saved as notes only.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr]">
            <div>
              <label htmlFor="next-action-exercise" className="text-xs font-bold uppercase text-gray-500">Exercise</label>
              <select
                id="next-action-exercise"
                value={selectedExerciseId}
                onChange={(event) => setSelectedExerciseId(event.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-[#000000] outline-none focus:border-[#FA0201]"
              >
                {reviewedExercises.length === 0 ? (
                  <option value="">No exercises found</option>
                ) : reviewedExercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>{exercise.exercise_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="next-action-type" className="text-xs font-bold uppercase text-gray-500">Feedback decision</label>
              <select
                id="next-action-type"
                value={action}
                onChange={(event) => setAction(event.target.value as FeedbackActionValue)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-[#000000] outline-none focus:border-[#FA0201]"
              >
                {feedbackActions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-700">
            <p className="font-bold uppercase text-gray-500">Action logic</p>
            <p className="mt-1 font-semibold text-[#000000]">{selectedAction.helpText}</p>
            {baseLoadKg ? (
              <p className="mt-1">Reference load for calculation: <span className="font-bold">{baseLoadKg}kg</span></p>
            ) : (
              <p className="mt-1">No prescribed reference load found for this exercise, so percentage will not be shown.</p>
            )}
          </div>

          {(action === 'increase_load' || action === 'reduce_load') && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr] md:items-end">
              <div>
                <label htmlFor="load-change" className="text-xs font-bold uppercase text-gray-500">Load change</label>
                <select
                  id="load-change"
                  value={loadChangeKg}
                  onChange={(event) => setLoadChangeKg(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-[#000000] outline-none focus:border-[#FA0201]"
                >
                  {loadChangeOptionsKg.map((option) => (
                    <option key={option} value={option}>{formatLoadChange(option, baseLoadKg)}</option>
                  ))}
                </select>
              </div>
              <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs font-semibold text-gray-700">
                Preview: {action === 'increase_load' ? 'Increase' : 'Reduce'} {selectedExercise?.exercise_name || 'exercise'} by {loadChangeSummary}.
              </p>
            </div>
          )}

          {action === 'programme_adjustment' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-bold uppercase">Manual programme editing</p>
              <p className="mt-1 font-semibold">This creates an action, but the actual adjustment is done by editing the workout and relevant future workouts.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {currentWorkout && (
                  <Link href={`/coach/clients/${clientId}/current-workouts/${currentWorkout.id}/edit`} className="rounded-lg bg-[#000000] px-3 py-2 text-xs font-bold uppercase text-white hover:bg-gray-900">
                    Edit current workout
                  </Link>
                )}
                <Link href={`/coach/clients/${clientId}/program`} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50">
                  Client programme
                </Link>
              </div>
            </div>
          )}

          <Textarea
            label={action === 'technique_issue' ? 'Technique note' : 'Coach note for action'}
            value={coachNote}
            onChange={(event) => setCoachNote(event.target.value)}
            placeholder={
              action === 'technique_issue'
                ? 'Example: Cue tighter brace before descent; knees drifting in on final reps.'
                : 'Optional context for why this action is needed.'
            }
          />

          {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
          {message && <p className="text-xs font-semibold text-green-700">{message}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isSaving || !selectedExercise}
              onClick={saveStructuredFeedbackAction}
              className="rounded-lg bg-[#FA0201] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : action === 'technique_issue' ? 'Save technique note' : 'Create action'}
            </button>
            <Link
              href={`/coach/clients/${clientId}/program`}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50"
            >
              Programme page
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
