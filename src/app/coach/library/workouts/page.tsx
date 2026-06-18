'use client';

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type Workout = {
  id: string;
  name: string;
  category: string;
  goal: string | null;
  instructions: string | null;
};

type CatalogueExercise = {
  id: string;
  name: string;
  category: string;
  equipment: string | null;
  default_notes: string | null;
};

type WorkoutExercise = {
  id: string;
  library_workout_id: string;
  exercise_catalogue_id: string | null;
  exercise_name: string;
  exercise_order: number;
  notes: string | null;
};

type WorkoutSet = {
  id: string;
  library_workout_exercise_id: string;
  set_order: number;
  target_reps: string | null;
  target_weight_kg: number | null;
  target_rpe: number | null;
  notes: string | null;
};

type WorkoutForm = {
  name: string;
  category: string;
  goal: string;
  instructions: string;
};

type SetForm = {
  setOrder: string;
  targetReps: string;
  targetWeightKg: string;
  targetRpe: string;
  notes: string;
};

const blankWorkoutForm: WorkoutForm = {
  name: '',
  category: 'Custom',
  goal: '',
  instructions: '',
};

const toNumberOrNull = (value: string) => {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toIntegerOrFallback = (value: string, fallback: number) => {
  if (!value.trim()) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const setToForm = (set: WorkoutSet): SetForm => ({
  setOrder: String(set.set_order),
  targetReps: set.target_reps || '',
  targetWeightKg: set.target_weight_kg === null || set.target_weight_kg === undefined ? '' : String(set.target_weight_kg),
  targetRpe: set.target_rpe === null || set.target_rpe === undefined ? '' : String(set.target_rpe),
  notes: set.notes || '',
});

const emptySetForm = (order: number): SetForm => ({
  setOrder: String(order),
  targetReps: '',
  targetWeightKg: '',
  targetRpe: '',
  notes: '',
});

const newSetFormFromPrevious = (sets: WorkoutSet[]): SetForm => {
  const nextOrder = sets.length + 1;
  const previousSet = sets[sets.length - 1];

  if (!previousSet) return emptySetForm(nextOrder);

  return {
    ...setToForm(previousSet),
    setOrder: String(nextOrder),
  };
};

const summariseSets = (sets: WorkoutSet[]) => {
  if (sets.length === 0) return 'No prescribed sets yet';

  const reps = Array.from(new Set(sets.map((set) => set.target_reps).filter(Boolean))).join('/');
  const kg = Array.from(new Set(sets.map((set) => set.target_weight_kg).filter((value) => value !== null && value !== undefined))).join('/');
  const rpe = Array.from(new Set(sets.map((set) => set.target_rpe).filter((value) => value !== null && value !== undefined))).join('/');

  return [
    `${sets.length} set${sets.length === 1 ? '' : 's'}`,
    reps ? `${reps} reps` : null,
    kg ? `${kg}kg` : null,
    rpe ? `RPE ${rpe}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
};

export default function ManageWorkoutLibraryPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueExercise[]>([]);
  const [exercises, setExercises] = useState<WorkoutExercise[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [isCreatingWorkout, setIsCreatingWorkout] = useState(false);
  const [workoutForm, setWorkoutForm] = useState<WorkoutForm>(blankWorkoutForm);
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [exerciseOrder, setExerciseOrder] = useState('1');
  const [exerciseNotes, setExerciseNotes] = useState('');
  const [exerciseEdits, setExerciseEdits] = useState<Record<string, { name: string; order: string; notes: string }>>({});
  const [setEdits, setSetEdits] = useState<Record<string, SetForm>>({});
  const [newSetForms, setNewSetForms] = useState<Record<string, SetForm>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkout = workouts.find((workout) => workout.id === selectedWorkoutId) || null;

  const selectedWorkoutExercises = useMemo(() => {
    if (!selectedWorkoutId) return [];

    return exercises
      .filter((exercise) => exercise.library_workout_id === selectedWorkoutId)
      .sort((a, b) => a.exercise_order - b.exercise_order);
  }, [exercises, selectedWorkoutId]);

  const setsByExercise = useMemo(() => {
    return sets.reduce<Record<string, WorkoutSet[]>>((accumulator, set) => {
      accumulator[set.library_workout_exercise_id] = [
        ...(accumulator[set.library_workout_exercise_id] || []),
        set,
      ];
      return accumulator;
    }, {});
  }, [sets]);

  const loadManager = async (preferredWorkoutId?: string | null) => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const [workoutResult, catalogueResult] = await Promise.all([
      supabase
        .from('library_workouts')
        .select('id, name, category, goal, instructions')
        .eq('is_active', true)
        .order('category')
        .order('name'),
      supabase
        .from('exercise_catalogue')
        .select('id, name, category, equipment, default_notes')
        .eq('is_active', true)
        .order('name'),
    ]);

    if (workoutResult.error || catalogueResult.error) {
      setError(workoutResult.error?.message || catalogueResult.error?.message || 'Could not load workout library.');
      setLoading(false);
      return;
    }

    const loadedWorkouts = (workoutResult.data ?? []) as Workout[];
    const loadedCatalogue = (catalogueResult.data ?? []) as CatalogueExercise[];
    const workoutIds = loadedWorkouts.map((workout) => workout.id);

    const exerciseResult = workoutIds.length
      ? await supabase
          .from('library_workout_exercises')
          .select('id, library_workout_id, exercise_catalogue_id, exercise_name, exercise_order, notes')
          .in('library_workout_id', workoutIds)
          .order('exercise_order')
      : { data: [], error: null };

    if (exerciseResult.error) {
      setError(exerciseResult.error.message);
      setLoading(false);
      return;
    }

    const loadedExercises = (exerciseResult.data ?? []) as WorkoutExercise[];
    const exerciseIds = loadedExercises.map((exercise) => exercise.id);

    const setResult = exerciseIds.length
      ? await supabase
          .from('library_workout_sets')
          .select('id, library_workout_exercise_id, set_order, target_reps, target_weight_kg, target_rpe, notes')
          .in('library_workout_exercise_id', exerciseIds)
          .order('set_order')
      : { data: [], error: null };

    if (setResult.error) {
      setError(setResult.error.message);
      setLoading(false);
      return;
    }

    const nextSelectedId =
      preferredWorkoutId && loadedWorkouts.some((workout) => workout.id === preferredWorkoutId)
        ? preferredWorkoutId
        : selectedWorkoutId;
    const nextSelectedWorkout = loadedWorkouts.find((workout) => workout.id === nextSelectedId) || null;
    const loadedSets = (setResult.data ?? []) as WorkoutSet[];

    setWorkouts(loadedWorkouts);
    setCatalogue(loadedCatalogue);
    setExercises(loadedExercises);
    setSets(loadedSets);
    setSelectedWorkoutId(nextSelectedWorkout ? nextSelectedWorkout.id : null);

    if (nextSelectedWorkout) {
      setWorkoutForm({
        name: nextSelectedWorkout.name,
        category: nextSelectedWorkout.category,
        goal: nextSelectedWorkout.goal || '',
        instructions: nextSelectedWorkout.instructions || '',
      });
    }

    setSelectedExerciseId(loadedCatalogue[0]?.id || '');
    setExerciseOrder(String((loadedExercises.filter((exercise) => exercise.library_workout_id === nextSelectedWorkout?.id).length || 0) + 1));
    setExerciseNotes('');
    setExerciseEdits(
      loadedExercises.reduce<Record<string, { name: string; order: string; notes: string }>>((accumulator, exercise) => {
        accumulator[exercise.id] = {
          name: exercise.exercise_name,
          order: String(exercise.exercise_order),
          notes: exercise.notes || '',
        };
        return accumulator;
      }, {})
    );
    setSetEdits(
      loadedSets.reduce<Record<string, SetForm>>((accumulator, set) => {
        accumulator[set.id] = setToForm(set);
        return accumulator;
      }, {})
    );
    setNewSetForms({});
    setLoading(false);
  };

  useEffect(() => {
    loadManager();
  }, []);

  const chooseWorkout = (workout: Workout) => {
    setIsCreatingWorkout(false);
    setEditingExerciseId(null);
    setSelectedWorkoutId(workout.id);
    setWorkoutForm({
      name: workout.name,
      category: workout.category,
      goal: workout.goal || '',
      instructions: workout.instructions || '',
    });
    setExerciseOrder(String(exercises.filter((exercise) => exercise.library_workout_id === workout.id).length + 1));
    setMessage(null);
    setError(null);
  };

  const startNewWorkout = () => {
    setIsCreatingWorkout(true);
    setEditingExerciseId(null);
    setSelectedWorkoutId(null);
    setWorkoutForm(blankWorkoutForm);
    setMessage(null);
    setError(null);
  };

  const saveWorkout = async () => {
    if (!isSupabaseConfigured) return;
    if (!workoutForm.name.trim()) {
      setError('Workout name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { data, error: saveError } = await supabase.rpc('upsert_library_workout', {
      p_workout_id: selectedWorkoutId,
      p_name: workoutForm.name,
      p_category: workoutForm.category,
      p_goal: workoutForm.goal,
      p_instructions: workoutForm.instructions,
    });

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    const nextWorkoutId = (data as string) || selectedWorkoutId;
    setIsCreatingWorkout(false);
    setMessage(selectedWorkoutId ? 'Workout template updated.' : 'Workout template created.');
    setSaving(false);
    await loadManager(nextWorkoutId);
  };

  const archiveWorkout = async () => {
    if (!isSupabaseConfigured || !selectedWorkout) return;
    if (!window.confirm(`Archive ${selectedWorkout.name}? Assigned client programmes will not be changed.`)) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: archiveError } = await supabase.rpc('archive_library_workout', {
      p_workout_id: selectedWorkout.id,
    });

    if (archiveError) {
      setError(archiveError.message);
      setSaving(false);
      return;
    }

    setMessage('Workout template archived.');
    setSaving(false);
    setSelectedWorkoutId(null);
    setEditingExerciseId(null);
    await loadManager(null);
  };

  const addExercise = async () => {
    if (!isSupabaseConfigured || !selectedWorkoutId) return;
    const selectedExercise = catalogue.find((exercise) => exercise.id === selectedExerciseId);

    if (!selectedExercise) {
      setError('Choose an exercise from the Exercise Library.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: addError } = await supabase.rpc('upsert_library_workout_exercise', {
      p_exercise_id: null,
      p_library_workout_id: selectedWorkoutId,
      p_exercise_catalogue_id: selectedExercise.id,
      p_exercise_name: selectedExercise.name,
      p_exercise_order: toIntegerOrFallback(exerciseOrder, selectedWorkoutExercises.length + 1),
      p_notes: exerciseNotes || selectedExercise.default_notes || null,
    });

    if (addError) {
      setError(addError.message);
      setSaving(false);
      return;
    }

    setMessage('Exercise added to workout template.');
    setSaving(false);
    await loadManager(selectedWorkoutId);
  };

  const saveExercise = async (exercise: WorkoutExercise) => {
    if (!isSupabaseConfigured) return;
    const edit = exerciseEdits[exercise.id];

    if (!edit?.name.trim()) {
      setError('Exercise name is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: saveError } = await supabase.rpc('upsert_library_workout_exercise', {
      p_exercise_id: exercise.id,
      p_library_workout_id: exercise.library_workout_id,
      p_exercise_catalogue_id: exercise.exercise_catalogue_id,
      p_exercise_name: edit.name,
      p_exercise_order: toIntegerOrFallback(edit.order, exercise.exercise_order),
      p_notes: edit.notes,
    });

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setMessage('Exercise updated.');
    setSaving(false);
    await loadManager(selectedWorkoutId);
  };

  const saveSet = async (exerciseId: string, setId: string | null, form: SetForm) => {
    if (!isSupabaseConfigured) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: saveError } = await supabase.rpc('upsert_library_workout_set', {
      p_set_id: setId,
      p_library_workout_exercise_id: exerciseId,
      p_set_order: toIntegerOrFallback(form.setOrder, 1),
      p_target_reps: form.targetReps,
      p_target_weight_kg: toNumberOrNull(form.targetWeightKg),
      p_target_rpe: toNumberOrNull(form.targetRpe),
      p_notes: form.notes,
    });

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setMessage(setId ? 'Set updated.' : 'Set added.');
    setSaving(false);
    await loadManager(selectedWorkoutId);
  };

  const renderWorkoutEditor = () => (
    <Card className="space-y-5 border-2 border-gray-200 bg-gray-50">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-black uppercase text-[#000000]">
            {isCreatingWorkout ? 'Create workout template' : 'Edit workout template'}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Library edits affect future assignments only, not already-assigned client programmes.
          </p>
        </div>
        {selectedWorkout && (
          <button
            type="button"
            onClick={archiveWorkout}
            disabled={saving}
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-xs font-bold uppercase text-[#FA0201] hover:bg-red-100 disabled:opacity-60"
          >
            Archive template
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label>
          <span className="text-xs font-black uppercase text-gray-500">Name</span>
          <input
            value={workoutForm.name}
            onChange={(event) => setWorkoutForm((current) => ({ ...current, name: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
          />
        </label>
        <label>
          <span className="text-xs font-black uppercase text-gray-500">Category</span>
          <input
            value={workoutForm.category}
            onChange={(event) => setWorkoutForm((current) => ({ ...current, category: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
          />
        </label>
        <label className="md:col-span-2">
          <span className="text-xs font-black uppercase text-gray-500">Goal</span>
          <input
            value={workoutForm.goal}
            onChange={(event) => setWorkoutForm((current) => ({ ...current, goal: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
          />
        </label>
        <label className="md:col-span-2">
          <span className="text-xs font-black uppercase text-gray-500">Instructions</span>
          <textarea
            value={workoutForm.instructions}
            onChange={(event) => setWorkoutForm((current) => ({ ...current, instructions: event.target.value }))}
            className="mt-1 min-h-20 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
          />
        </label>
      </div>
      <div className="flex justify-end">
        <Button type="button" disabled={saving} onClick={saveWorkout} className="bg-[#FA0201] hover:bg-red-700">
          {saving ? 'Saving...' : isCreatingWorkout ? 'Create workout' : 'Save workout'}
        </Button>
      </div>
    </Card>
  );

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <Card>Loading Workout Library manager...</Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeader
          title="MANAGE WORKOUT LIBRARY"
          subtitle="Create, edit and organise reusable workout templates for RITMO programmes."
        />
        <button
          type="button"
          onClick={() => window.history.back()}
          className="rounded-lg bg-[#FA0201] px-4 py-3 text-sm font-bold uppercase text-white hover:bg-red-700"
        >
          Back to Library
        </button>
      </div>

      {message && (
        <Card className="border-2 border-green-200 bg-green-50 text-sm font-semibold text-green-700">
          {message}
        </Card>
      )}
      {error && (
        <Card className="border-2 border-red-200 bg-red-50 text-sm font-semibold text-red-700">
          {error}
        </Card>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black uppercase text-[#000000]">Workout templates</h2>
          <Button type="button" onClick={startNewWorkout} className="bg-[#FA0201] hover:bg-red-700">
            Create Workout
          </Button>
        </div>

        {isCreatingWorkout && renderWorkoutEditor()}

        <div className="space-y-4">
          {workouts.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-600">No workout templates yet.</p>
            </Card>
          ) : (
            workouts.map((workout) => {
              const workoutExercises = exercises.filter((exercise) => exercise.library_workout_id === workout.id);
              const isSelected = selectedWorkoutId === workout.id && !isCreatingWorkout;

              return (
                <div key={workout.id} className="space-y-4">
                  <Card className={`border-2 ${isSelected ? 'border-[#FA0201] bg-red-50' : 'border-gray-200 bg-white'}`}>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_0.18fr] md:items-center">
                      <div>
                        <p className="text-xs font-bold uppercase text-gray-500">{workout.category}</p>
                        <h3 className="mt-1 text-xl font-black uppercase text-[#000000]">{workout.name}</h3>
                        {workout.goal && <p className="mt-2 text-sm text-gray-600">{workout.goal}</p>}
                      </div>
                      <div className="flex flex-col gap-3 md:items-end">
                        <Badge variant="default">{workoutExercises.length} exercises</Badge>
                        <button
                          type="button"
                          onClick={() => chooseWorkout(workout)}
                          className="rounded-lg bg-[#FA0201] px-6 py-3 text-sm font-bold uppercase text-white hover:bg-red-700"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </Card>

                  {isSelected && (
                    <div className="space-y-5">
                      {renderWorkoutEditor()}
                      <Card className="space-y-5">
                        <div>
                          <h2 className="text-xl font-black uppercase text-[#000000]">Exercises and prescribed sets</h2>
                          <p className="mt-1 text-sm text-gray-600">
                            Exercises stay compact by default. Open only the one you want to edit.
                          </p>
                        </div>

                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_0.18fr] md:items-end">
                            <label>
                              <span className="text-xs font-black uppercase text-gray-500">Exercise Library item</span>
                              <select
                                value={selectedExerciseId}
                                onChange={(event) => setSelectedExerciseId(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
                              >
                                {catalogue.map((exercise) => (
                                  <option key={exercise.id} value={exercise.id}>
                                    {exercise.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span className="text-xs font-black uppercase text-gray-500">Order</span>
                              <input
                                value={exerciseOrder}
                                onChange={(event) => setExerciseOrder(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                              />
                            </label>
                            <label className="md:col-span-2">
                              <span className="text-xs font-black uppercase text-gray-500">Notes</span>
                              <input
                                value={exerciseNotes}
                                onChange={(event) => setExerciseNotes(event.target.value)}
                                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm"
                              />
                            </label>
                          </div>
                          <div className="mt-3 flex justify-end">
                            <Button
                              type="button"
                              disabled={saving || catalogue.length === 0}
                              onClick={addExercise}
                              className="bg-[#FA0201] hover:bg-red-700"
                            >
                              Add exercise
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          {selectedWorkoutExercises.length === 0 ? (
                            <p className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
                              No exercises in this workout yet.
                            </p>
                          ) : (
                            selectedWorkoutExercises.map((exercise) => {
                              const edit =
                                exerciseEdits[exercise.id] ||
                                { name: exercise.exercise_name, order: String(exercise.exercise_order), notes: exercise.notes || '' };
                              const exerciseSets = (setsByExercise[exercise.id] || []).sort((a, b) => a.set_order - b.set_order);
                              const newSetForm = newSetForms[exercise.id] || newSetFormFromPrevious(exerciseSets);
                              const isEditingExercise = editingExerciseId === exercise.id;

                              return (
                                <div key={exercise.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[0.12fr_1fr_0.22fr] md:items-center">
                                    <Badge variant="default">#{exercise.exercise_order}</Badge>
                                    <div>
                                      <p className="text-sm font-black uppercase text-[#000000]">{exercise.exercise_name}</p>
                                      <p className="mt-1 text-xs font-bold uppercase text-gray-500">{summariseSets(exerciseSets)}</p>
                                      {exercise.notes && <p className="mt-1 text-xs text-gray-600">{exercise.notes}</p>}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setEditingExerciseId(isEditingExercise ? null : exercise.id)}
                                      className="rounded-lg bg-[#FA0201] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-red-700"
                                    >
                                      {isEditingExercise ? 'Close' : 'Edit'}
                                    </button>
                                  </div>

                                  {isEditingExercise && (
                                    <div className="mt-4 space-y-4 rounded-xl border border-gray-200 bg-white p-4">
                                      <div className="grid grid-cols-1 gap-3 md:grid-cols-[0.16fr_1fr] md:items-end">
                                        <label>
                                          <span className="text-xs font-black uppercase text-gray-500">Order</span>
                                          <input
                                            value={edit.order}
                                            onChange={(event) => setExerciseEdits((current) => ({ ...current, [exercise.id]: { ...edit, order: event.target.value } }))}
                                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                          />
                                        </label>
                                        <label>
                                          <span className="text-xs font-black uppercase text-gray-500">Exercise</span>
                                          <input
                                            value={edit.name}
                                            onChange={(event) => setExerciseEdits((current) => ({ ...current, [exercise.id]: { ...edit, name: event.target.value } }))}
                                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                          />
                                        </label>
                                        <label className="md:col-span-2">
                                          <span className="text-xs font-black uppercase text-gray-500">Notes</span>
                                          <input
                                            value={edit.notes}
                                            onChange={(event) => setExerciseEdits((current) => ({ ...current, [exercise.id]: { ...edit, notes: event.target.value } }))}
                                            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                          />
                                        </label>
                                      </div>
                                      <div className="flex justify-end">
                                        <button
                                          type="button"
                                          disabled={saving}
                                          onClick={() => saveExercise(exercise)}
                                          className="rounded-lg bg-black px-3 py-2 text-xs font-bold uppercase text-white hover:bg-gray-900 disabled:opacity-60"
                                        >
                                          Save exercise
                                        </button>
                                      </div>
                                      <div className="space-y-3">
                                        <p className="text-sm font-black uppercase text-[#000000]">Sets</p>
                                        {[
                                          ...exerciseSets.map((set) => ({ id: set.id, form: setEdits[set.id] || setToForm(set), isNew: false })),
                                          { id: 'new', form: newSetForm, isNew: true },
                                        ].map((item) => (
                                          <div
                                            key={item.id}
                                            className={`grid grid-cols-1 gap-2 rounded-lg border p-3 md:grid-cols-6 md:items-end ${
                                              item.isNew ? 'border-dashed border-gray-300 bg-gray-50/40' : 'border-gray-200 bg-gray-50'
                                            }`}
                                          >
                                            <label>
                                              <span className="text-[10px] font-black uppercase text-gray-500">Set</span>
                                              <input
                                                value={item.form.setOrder}
                                                onChange={(event) =>
                                                  item.isNew
                                                    ? setNewSetForms((current) => ({ ...current, [exercise.id]: { ...item.form, setOrder: event.target.value } }))
                                                    : setSetEdits((current) => ({ ...current, [item.id]: { ...item.form, setOrder: event.target.value } }))
                                                }
                                                className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm"
                                              />
                                            </label>
                                            <label>
                                              <span className="text-[10px] font-black uppercase text-gray-500">Reps</span>
                                              <input
                                                value={item.form.targetReps}
                                                onChange={(event) =>
                                                  item.isNew
                                                    ? setNewSetForms((current) => ({ ...current, [exercise.id]: { ...item.form, targetReps: event.target.value } }))
                                                    : setSetEdits((current) => ({ ...current, [item.id]: { ...item.form, targetReps: event.target.value } }))
                                                }
                                                className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm"
                                              />
                                            </label>
                                            <label>
                                              <span className="text-[10px] font-black uppercase text-gray-500">Kg</span>
                                              <input
                                                value={item.form.targetWeightKg}
                                                onChange={(event) =>
                                                  item.isNew
                                                    ? setNewSetForms((current) => ({ ...current, [exercise.id]: { ...item.form, targetWeightKg: event.target.value } }))
                                                    : setSetEdits((current) => ({ ...current, [item.id]: { ...item.form, targetWeightKg: event.target.value } }))
                                                }
                                                className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm"
                                              />
                                            </label>
                                            <label>
                                              <span className="text-[10px] font-black uppercase text-gray-500">RPE</span>
                                              <input
                                                value={item.form.targetRpe}
                                                onChange={(event) =>
                                                  item.isNew
                                                    ? setNewSetForms((current) => ({ ...current, [exercise.id]: { ...item.form, targetRpe: event.target.value } }))
                                                    : setSetEdits((current) => ({ ...current, [item.id]: { ...item.form, targetRpe: event.target.value } }))
                                                }
                                                className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm"
                                              />
                                            </label>
                                            <label className="md:col-span-2">
                                              <span className="text-[10px] font-black uppercase text-gray-500">Notes</span>
                                              <input
                                                value={item.form.notes}
                                                onChange={(event) =>
                                                  item.isNew
                                                    ? setNewSetForms((current) => ({ ...current, [exercise.id]: { ...item.form, notes: event.target.value } }))
                                                    : setSetEdits((current) => ({ ...current, [item.id]: { ...item.form, notes: event.target.value } }))
                                                }
                                                className="mt-1 w-full rounded border border-gray-300 px-2 py-2 text-sm"
                                              />
                                            </label>
                                            <div className="flex justify-end md:col-span-6">
                                              <button
                                                type="button"
                                                disabled={saving}
                                                onClick={() => saveSet(exercise.id, item.isNew ? null : item.id, item.form)}
                                                className={`rounded-lg px-3 py-2 text-xs font-bold uppercase text-white disabled:opacity-60 ${
                                                  item.isNew ? 'bg-[#FA0201] hover:bg-red-700' : 'bg-black hover:bg-gray-900'
                                                }`}
                                              >
                                                {item.isNew ? 'Add set' : 'Save set'}
                                              </button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </Card>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
