'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type DecisionType = 'no_change' | 'increase_load' | 'repeat_load' | 'reduce_load' | 'technique_issue' | 'custom_note';

type ExerciseReviewDecisionPanelProps = {
  clientId: string;
  currentWorkoutId: string;
  exerciseName: string;
  exerciseCatalogueId: string | null;
};

type ProgramWorkoutLookup = {
  id: string;
  title: string;
  scheduled_date: string | null;
  source_library_workout_id: string | null;
  created_at: string;
};

type ProgramExerciseLookup = {
  id: string;
  exercise_name: string;
  exercise_catalogue_id: string | null;
  notes: string | null;
};

type ProgramSetLookup = {
  id: string;
  target_weight_kg: number | null;
};

type CompletedSessionLookup = { program_workout_id: string };

const decisionLabels: Record<DecisionType, string> = {
  no_change: 'No change',
  increase_load: 'Increase load',
  repeat_load: 'Repeat same load',
  reduce_load: 'Reduce load',
  technique_issue: 'Technique issue',
  custom_note: 'Custom note only',
};

const requiresLoadChange = (decision: DecisionType) => decision === 'increase_load' || decision === 'reduce_load';

const buildFutureNote = (existingNote: string | null, coachNote: string) => {
  const datedNote = `Coach review note (${new Date().toISOString().slice(0, 10)}): ${coachNote}`;
  return existingNote?.trim() ? `${existingNote.trim()}\n\n${datedNote}` : datedNote;
};

export function ExerciseReviewDecisionPanel({
  clientId,
  currentWorkoutId,
  exerciseName,
  exerciseCatalogueId,
}: ExerciseReviewDecisionPanelProps) {
  const [decision, setDecision] = useState<DecisionType>('no_change');
  const [loadChangeKg, setLoadChangeKg] = useState('2.5');
  const [coachNote, setCoachNote] = useState('');
  const [applyToNext, setApplyToNext] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveDecision = async () => {
    if (!isSupabaseConfigured) return;

    const note = coachNote.trim();
    if (requiresLoadChange(decision) && (!loadChangeKg.trim() || Number(loadChangeKg) <= 0)) {
      setError('Enter a positive KG change. The direction is controlled by the decision.');
      return;
    }

    if ((decision === 'technique_issue' || decision === 'custom_note') && !note) {
      setError('Add a note for technique issues or custom notes.');
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { data: currentWorkoutData, error: currentWorkoutError } = await supabase
      .from('program_workouts')
      .select('id, title, scheduled_date, source_library_workout_id, created_at')
      .eq('id', currentWorkoutId)
      .eq('client_id', clientId)
      .single();

    if (currentWorkoutError || !currentWorkoutData) {
      setError(currentWorkoutError?.message || 'Current workout could not be found.');
      setSaving(false);
      return;
    }

    const currentWorkout = currentWorkoutData as ProgramWorkoutLookup;
    const { error: actionError } = await supabase.from('coach_actions').insert({
      client_id: clientId,
      action_type: 'exercise_review_decision',
      description: `${exerciseName}: ${decisionLabels[decision]}${requiresLoadChange(decision) ? ` by ${loadChangeKg}kg` : ''}`,
      priority: decision === 'technique_issue' ? 'high' : 'medium',
      status: 'done',
      completed_at: new Date().toISOString(),
      notes: note || null,
    });

    if (actionError) {
      setError(actionError.message);
      setSaving(false);
      return;
    }

    if (!applyToNext || decision === 'no_change') {
      setMessage('Exercise review decision saved.');
      setSaving(false);
      return;
    }

    const { data: candidateWorkoutData, error: candidateWorkoutError } = await supabase
      .from('program_workouts')
      .select('id, title, scheduled_date, source_library_workout_id, created_at')
      .eq('client_id', clientId)
      .neq('id', currentWorkoutId)
      .neq('status', 'archived')
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (candidateWorkoutError) {
      setError(candidateWorkoutError.message);
      setSaving(false);
      return;
    }

    const candidateWorkouts = (candidateWorkoutData ?? []) as ProgramWorkoutLookup[];
    const matchingWorkouts = candidateWorkouts.filter((workout) => {
      const sameWorkoutContext = currentWorkout.source_library_workout_id
        ? workout.source_library_workout_id === currentWorkout.source_library_workout_id
        : workout.title.trim().toLowerCase() === currentWorkout.title.trim().toLowerCase();

      if (!sameWorkoutContext) return false;
      if (!currentWorkout.scheduled_date || !workout.scheduled_date) return true;
      return workout.scheduled_date > currentWorkout.scheduled_date;
    });

    if (matchingWorkouts.length === 0) {
      setMessage('Decision saved. No future matching workout was found to update yet.');
      setSaving(false);
      return;
    }

    const candidateIds = matchingWorkouts.map((workout) => workout.id);
    const { data: completedSessionData, error: completedSessionError } = await supabase
      .from('workout_sessions')
      .select('program_workout_id')
      .in('program_workout_id', candidateIds)
      .eq('status', 'completed');

    if (completedSessionError) {
      setError(completedSessionError.message);
      setSaving(false);
      return;
    }

    const completedWorkoutIds = new Set(((completedSessionData ?? []) as CompletedSessionLookup[]).map((session) => session.program_workout_id));
    const nextWorkout = matchingWorkouts.find((workout) => !completedWorkoutIds.has(workout.id));

    if (!nextWorkout) {
      setMessage('Decision saved. Matching future workouts were already completed, so no prescription was changed.');
      setSaving(false);
      return;
    }

    const { data: nextExerciseData, error: nextExerciseError } = await supabase
      .from('program_exercises')
      .select('id, exercise_name, exercise_catalogue_id, notes')
      .eq('workout_id', nextWorkout.id)
      .order('exercise_order', { ascending: true });

    if (nextExerciseError) {
      setError(nextExerciseError.message);
      setSaving(false);
      return;
    }

    const nextExercises = (nextExerciseData ?? []) as ProgramExerciseLookup[];
    const nextExercise = nextExercises.find((exercise) => {
      if (exerciseCatalogueId && exercise.exercise_catalogue_id) return exercise.exercise_catalogue_id === exerciseCatalogueId;
      return exercise.exercise_name.trim().toLowerCase() === exerciseName.trim().toLowerCase();
    });

    if (!nextExercise) {
      setMessage(`Decision saved. ${nextWorkout.title} was found, but no matching ${exerciseName} exercise was found.`);
      setSaving(false);
      return;
    }

    if (note) {
      const { error: noteUpdateError } = await supabase
        .from('program_exercises')
        .update({ notes: buildFutureNote(nextExercise.notes, note) })
        .eq('id', nextExercise.id);

      if (noteUpdateError) {
        setError(noteUpdateError.message);
        setSaving(false);
        return;
      }
    }

    if (requiresLoadChange(decision)) {
      const direction = decision === 'increase_load' ? 1 : -1;
      const signedChange = Math.abs(Number(loadChangeKg)) * direction;
      const { data: nextSetData, error: nextSetError } = await supabase
        .from('program_sets')
        .select('id, target_weight_kg')
        .eq('exercise_id', nextExercise.id)
        .order('set_order', { ascending: true });

      if (nextSetError) {
        setError(nextSetError.message);
        setSaving(false);
        return;
      }

      const nextSets = (nextSetData ?? []) as ProgramSetLookup[];
      for (const set of nextSets) {
        if (set.target_weight_kg === null || set.target_weight_kg === undefined) continue;
        const nextWeight = Math.max(0, Number((set.target_weight_kg + signedChange).toFixed(2)));
        const { error: setUpdateError } = await supabase
          .from('program_sets')
          .update({ target_weight_kg: nextWeight })
          .eq('id', set.id);

        if (setUpdateError) {
          setError(setUpdateError.message);
          setSaving(false);
          return;
        }
      }
    }

    setMessage(`Decision applied to next ${nextWorkout.title} → ${nextExercise.exercise_name}.`);
    setSaving(false);
  };

  return (
    <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-black uppercase text-[#000000]">Next occurrence decision</p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold uppercase">Decision</span>
          <select
            value={decision}
            onChange={(event) => setDecision(event.target.value as DecisionType)}
            className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black"
          >
            {Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <Input
          label="KG change"
          type="number"
          step="0.5"
          min="0"
          value={loadChangeKg}
          onChange={(event) => setLoadChangeKg(event.target.value)}
          disabled={!requiresLoadChange(decision)}
          placeholder="2.5"
        />
        <label className="flex items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-700">
          <input type="checkbox" checked={applyToNext} onChange={(event) => setApplyToNext(event.target.checked)} />
          Apply to next matching workout
        </label>
      </div>
      <Textarea
        label="Note for next time"
        value={coachNote}
        onChange={(event) => setCoachNote(event.target.value)}
        placeholder={`Optional note that will appear on the next matching ${exerciseName} prescription.`}
      />
      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-xs font-semibold uppercase text-gray-500">
          Applies within the same workout context first, e.g. next Full Body B version of this exercise.
        </p>
        <Button type="button" disabled={saving} onClick={saveDecision} className="bg-[#000000] hover:bg-gray-900">
          {saving ? 'Applying...' : 'Save exercise decision'}
        </Button>
      </div>
      {message && <p className="mt-3 text-sm font-semibold text-green-700">{message}</p>}
      {error && <p className="mt-3 text-sm font-semibold text-red-700">{error}</p>}
    </div>
  );
}
