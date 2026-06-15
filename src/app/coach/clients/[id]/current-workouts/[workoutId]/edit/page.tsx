'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = { id: string; full_name: string; email: string | null };
type WorkoutRecord = {
  id: string;
  title: string;
  client_id: string;
  program_id: string;
  scheduled_date: string | null;
  status: string;
};
type SessionRecord = { id: string };
type ExerciseRecord = { id: string; exercise_order: number; exercise_name: string; notes: string | null };
type ProgramSetRecord = {
  id: string;
  exercise_id: string;
  set_order: number;
  target_reps: string | null;
  target_weight_kg: number | null;
  notes: string | null;
};
type SetForm = { targetReps: string; targetWeightKg: string; notes: string };
type ExerciseForm = { exerciseName: string; notes: string; sets: SetForm[] };

const blankSet = (): SetForm => ({ targetReps: '', targetWeightKg: '', notes: '' });
const blankExercise = (): ExerciseForm => ({ exerciseName: '', notes: '', sets: [blankSet(), blankSet(), blankSet()] });
const numberOrNull = (value: string) => (value.trim() ? Number(value) : null);
const textOrNull = (value: string) => value.trim() || null;

export default function EditAssignedWorkoutPage() {
  const params = useParams();
  const clientId = params.id as string;
  const workoutId = params.workoutId as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workout, setWorkout] = useState<WorkoutRecord | null>(null);
  const [workoutTitle, setWorkoutTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [exercises, setExercises] = useState<ExerciseForm[]>([]);
  const [originalExerciseIds, setOriginalExerciseIds] = useState<string[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkout = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const [clientResult, workoutResult, sessionResult] = await Promise.all([
      supabase
        .from('clients')
        .select('id, full_name, email')
        .eq('id', clientId)
        .single(),
      supabase
        .from('program_workouts')
        .select('id, title, client_id, program_id, scheduled_date, status')
        .eq('id', workoutId)
        .eq('client_id', clientId)
        .single(),
      supabase
        .from('workout_sessions')
        .select('id')
        .eq('program_workout_id', workoutId)
        .eq('status', 'completed')
        .limit(1),
    ]);

    if (clientResult.error || !clientResult.data) {
      setError(clientResult.error?.message || 'Client not found.');
      setLoading(false);
      return;
    }

    if (workoutResult.error || !workoutResult.data) {
      setError(workoutResult.error?.message || 'Workout not found.');
      setLoading(false);
      return;
    }

    if (sessionResult.error) {
      setError(sessionResult.error.message);
      setLoading(false);
      return;
    }

    const loadedWorkout = workoutResult.data as WorkoutRecord;
    const completedSessions = (sessionResult.data ?? []) as SessionRecord[];
    const locked = loadedWorkout.status === 'completed' || completedSessions.length > 0;

    const { data: exerciseData, error: exerciseError } = await supabase
      .from('program_exercises')
      .select('id, exercise_order, exercise_name, notes')
      .eq('workout_id', workoutId)
      .order('exercise_order', { ascending: true });

    if (exerciseError) {
      setError(exerciseError.message);
      setLoading(false);
      return;
    }

    const loadedExercises = (exerciseData ?? []) as ExerciseRecord[];
    const exerciseIds = loadedExercises.map((exercise) => exercise.id);
    const { data: setData, error: setError } = exerciseIds.length > 0
      ? await supabase
          .from('program_sets')
          .select('id, exercise_id, set_order, target_reps, target_weight_kg, notes')
          .in('exercise_id', exerciseIds)
          .order('set_order', { ascending: true })
      : { data: [], error: null };

    if (setError) {
      setError(setError.message);
      setLoading(false);
      return;
    }

    const loadedSets = (setData ?? []) as ProgramSetRecord[];
    const formExercises = loadedExercises.map((exercise) => ({
      exerciseName: exercise.exercise_name,
      notes: exercise.notes || '',
      sets: loadedSets
        .filter((set) => set.exercise_id === exercise.id)
        .sort((a, b) => a.set_order - b.set_order)
        .map((set) => ({
          targetReps: set.target_reps || '',
          targetWeightKg: set.target_weight_kg?.toString() || '',
          notes: set.notes || '',
        })),
    }));

    setClient(clientResult.data as ClientRecord);
    setWorkout(loadedWorkout);
    setWorkoutTitle(loadedWorkout.title);
    setScheduledDate(loadedWorkout.scheduled_date || '');
    setExercises(formExercises.length > 0 ? formExercises : [blankExercise()]);
    setOriginalExerciseIds(exerciseIds);
    setIsLocked(locked);
    setLoading(false);
  };

  useEffect(() => {
    loadWorkout();
  }, [clientId, workoutId]);

  const updateExercise = (index: number, updates: Partial<ExerciseForm>) => {
    setExercises((current) => current.map((exercise, i) => (i === index ? { ...exercise, ...updates } : exercise)));
  };

  const removeExercise = (index: number) => {
    setExercises((current) => current.filter((_, i) => i !== index));
  };

  const updateSet = (exerciseIndex: number, setIndex: number, updates: Partial<SetForm>) => {
    setExercises((current) => current.map((exercise, i) => {
      if (i !== exerciseIndex) return exercise;
      return {
        ...exercise,
        sets: exercise.sets.map((set, j) => (j === setIndex ? { ...set, ...updates } : set)),
      };
    }));
  };

  const saveWorkout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workout || !isSupabaseConfigured) return;

    if (isLocked) {
      setError('This workout is locked because the client has already completed it. Duplicate it to create a new editable version.');
      return;
    }

    if (!workoutTitle.trim()) {
      setError('Workout title is required.');
      return;
    }

    const validExercises = exercises.filter((exercise) => exercise.exerciseName.trim());
    if (validExercises.length === 0) {
      setError('Add at least one exercise.');
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: workoutError } = await supabase
      .from('program_workouts')
      .update({
        title: workoutTitle.trim(),
        scheduled_date: scheduledDate || null,
      })
      .eq('id', workout.id);

    if (workoutError) {
      setError(workoutError.message);
      setSaving(false);
      return;
    }

    if (originalExerciseIds.length > 0) {
      const { error: deleteSetsError } = await supabase
        .from('program_sets')
        .delete()
        .in('exercise_id', originalExerciseIds);

      if (deleteSetsError) {
        setError(deleteSetsError.message);
        setSaving(false);
        return;
      }

      const { error: deleteExercisesError } = await supabase
        .from('program_exercises')
        .delete()
        .in('id', originalExerciseIds);

      if (deleteExercisesError) {
        setError(deleteExercisesError.message);
        setSaving(false);
        return;
      }
    }

    const newExerciseIds: string[] = [];
    for (const [exerciseIndex, exercise] of validExercises.entries()) {
      const { data: exerciseData, error: exerciseError } = await supabase
        .from('program_exercises')
        .insert({
          workout_id: workout.id,
          exercise_order: exerciseIndex + 1,
          exercise_name: exercise.exerciseName.trim(),
          notes: textOrNull(exercise.notes),
        })
        .select('id')
        .single();

      if (exerciseError || !exerciseData) {
        setError(exerciseError?.message || 'Could not save exercise.');
        setSaving(false);
        return;
      }

      const newExerciseId = (exerciseData as { id: string }).id;
      newExerciseIds.push(newExerciseId);
      const setRows = exercise.sets.map((set, setIndex) => ({
        exercise_id: newExerciseId,
        set_order: setIndex + 1,
        target_reps: textOrNull(set.targetReps),
        target_weight_kg: numberOrNull(set.targetWeightKg),
        target_rpe: null,
        target_rir: null,
        notes: textOrNull(set.notes),
      }));

      const { error: setsError } = await supabase.from('program_sets').insert(setRows);
      if (setsError) {
        setError(setsError.message);
        setSaving(false);
        return;
      }
    }

    setOriginalExerciseIds(newExerciseIds);
    setMessage('Workout updated.');
    setSaving(false);
  };

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading workout editor...</Card></div>;
  }

  if (error && !workout) {
    return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;
  }

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold uppercase text-[#000000] tracking-tight">Edit workout</h1>
          <p className="mt-1 text-sm text-gray-600">{client?.full_name} • {workout?.title}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href={`/coach/clients/${clientId}/current-workouts`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to current workouts</Link>
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
        </div>
      </div>

      {isLocked && (
        <Card className="border-2 border-yellow-200 bg-yellow-50">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <Badge variant="warning">Locked</Badge>
              <p className="mt-2 text-sm font-semibold text-yellow-800">
                This workout is locked because the client has completed it. Duplicate it from Current Workouts to make a new editable copy.
              </p>
            </div>
          </div>
        </Card>
      )}

      {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      <section>
        <SectionHeader title="WORKOUT DETAILS" accent />
        <Card>
          <form onSubmit={saveWorkout} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Workout title" value={workoutTitle} onChange={(e) => setWorkoutTitle(e.target.value)} required disabled={isLocked} />
              <Input label="Scheduled date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} disabled={isLocked} />
            </div>

            {exercises.map((exercise, exerciseIndex) => (
              <div key={exerciseIndex} className="rounded-xl border border-gray-200 p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-bold uppercase text-[#000000]">Exercise {exerciseIndex + 1}</p>
                  {!isLocked && exercises.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeExercise(exerciseIndex)}
                      className="text-xs font-bold uppercase text-[#FA0201] hover:underline"
                    >
                      Remove exercise
                    </button>
                  )}
                </div>

                <Input value={exercise.exerciseName} onChange={(e) => updateExercise(exerciseIndex, { exerciseName: e.target.value })} placeholder="e.g. Bench press" disabled={isLocked} />
                <Textarea label="Exercise notes" value={exercise.notes} onChange={(e) => updateExercise(exerciseIndex, { notes: e.target.value })} disabled={isLocked} />

                <div className="overflow-x-auto rounded-lg bg-gray-50 p-3">
                  <div className="grid min-w-[640px] grid-cols-[80px_1fr_1fr_2fr] gap-3 px-1 pb-2 text-xs font-bold uppercase text-gray-600">
                    <div />
                    <p>Kg</p>
                    <p>Reps</p>
                    <p>Notes</p>
                  </div>
                  <div className="space-y-3">
                    {exercise.sets.map((set, setIndex) => (
                      <div key={setIndex} className="grid min-w-[640px] grid-cols-[80px_1fr_1fr_2fr] items-center gap-3">
                        <p className="text-sm font-bold uppercase text-[#000000]">Set {setIndex + 1}</p>
                        <Input type="number" step="0.5" value={set.targetWeightKg} onChange={(e) => updateSet(exerciseIndex, setIndex, { targetWeightKg: e.target.value })} disabled={isLocked} />
                        <Input value={set.targetReps} onChange={(e) => updateSet(exerciseIndex, setIndex, { targetReps: e.target.value })} placeholder="6-8" disabled={isLocked} />
                        <Input value={set.notes} onChange={(e) => updateSet(exerciseIndex, setIndex, { notes: e.target.value })} disabled={isLocked} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex flex-col md:flex-row gap-3">
              {!isLocked && <Button type="button" variant="outline" onClick={() => setExercises((current) => [...current, blankExercise()])}>Add exercise</Button>}
              <Button type="submit" variant="primary" isLoading={saving} className="bg-[#FA0201] hover:bg-red-700" disabled={isLocked || saving}>Save changes</Button>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}
