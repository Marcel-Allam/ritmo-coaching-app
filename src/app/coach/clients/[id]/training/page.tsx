'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = { id: string; full_name: string; email: string | null };
type SetForm = { targetReps: string; targetWeightKg: string; targetRpe: string; targetRir: string; notes: string };
type ExerciseForm = { exerciseName: string; notes: string; sets: SetForm[] };
type SessionRecord = { id: string; program_workout_id: string; completed_at: string | null; review_status: string; client_notes: string | null };
type WorkoutRecord = { id: string; title: string };

const blankSet = (): SetForm => ({ targetReps: '', targetWeightKg: '', targetRpe: '', targetRir: '', notes: '' });
const blankExercise = (): ExerciseForm => ({ exerciseName: '', notes: '', sets: [blankSet(), blankSet(), blankSet()] });
const numberOrNull = (value: string) => (value.trim() ? Number(value) : null);
const textOrNull = (value: string) => value.trim() || null;

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
};

export default function CoachClientTrainingPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [workoutTitles, setWorkoutTitles] = useState<Record<string, string>>({});
  const [programTitle, setProgramTitle] = useState('RITMO Programme');
  const [workoutTitle, setWorkoutTitle] = useState('Upper Day');
  const [dayLabel, setDayLabel] = useState('');
  const [instructions, setInstructions] = useState('');
  const [exercises, setExercises] = useState<ExerciseForm[]>([blankExercise()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPage = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('id, full_name, email')
      .eq('id', clientId)
      .single();

    if (clientError || !clientData) {
      setError(clientError?.message || 'Client not found.');
      setLoading(false);
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from('workout_sessions')
      .select('id, program_workout_id, completed_at, review_status, client_notes')
      .eq('client_id', clientId)
      .order('completed_at', { ascending: false })
      .limit(10);

    if (sessionError) {
      setError(sessionError.message);
      setLoading(false);
      return;
    }

    const loadedSessions = (sessionData ?? []) as SessionRecord[];
    const workoutIds = [...new Set(loadedSessions.map((session) => session.program_workout_id))];
    let titleMap: Record<string, string> = {};

    if (workoutIds.length > 0) {
      const { data: workoutData } = await supabase
        .from('program_workouts')
        .select('id, title')
        .in('id', workoutIds);

      titleMap = ((workoutData ?? []) as WorkoutRecord[]).reduce<Record<string, string>>((acc, workout) => {
        acc[workout.id] = workout.title;
        return acc;
      }, {});
    }

    setClient(clientData as ClientRecord);
    setSessions(loadedSessions);
    setWorkoutTitles(titleMap);
    setLoading(false);
  };

  useEffect(() => {
    loadPage();
  }, [clientId]);

  const updateExercise = (index: number, updates: Partial<ExerciseForm>) => {
    setExercises((current) => current.map((exercise, i) => (i === index ? { ...exercise, ...updates } : exercise)));
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

  const handleSaveWorkout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSupabaseConfigured) return;
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
    setError(null);
    setMessage(null);
    const supabase = createClient();

    let programId: string | null = null;
    const { data: existingProgram } = await supabase
      .from('training_programs')
      .select('id')
      .eq('client_id', clientId)
      .eq('title', programTitle.trim())
      .eq('status', 'active')
      .limit(1);

    programId = (existingProgram?.[0] as { id: string } | undefined)?.id ?? null;

    if (!programId) {
      const { data: newProgram, error: programError } = await supabase
        .from('training_programs')
        .insert({ client_id: clientId, title: programTitle.trim(), status: 'active' })
        .select('id')
        .single();

      if (programError || !newProgram) {
        setError(programError?.message || 'Could not create programme.');
        setSaving(false);
        return;
      }
      programId = (newProgram as { id: string }).id;
    }

    const { data: workoutData, error: workoutError } = await supabase
      .from('program_workouts')
      .insert({
        client_id: clientId,
        program_id: programId,
        title: workoutTitle.trim(),
        day_label: textOrNull(dayLabel),
        instructions: textOrNull(instructions),
        status: 'active',
      })
      .select('id')
      .single();

    if (workoutError || !workoutData) {
      setError(workoutError?.message || 'Could not create workout.');
      setSaving(false);
      return;
    }

    const newWorkoutId = (workoutData as { id: string }).id;

    for (const [exerciseIndex, exercise] of validExercises.entries()) {
      const { data: exerciseData, error: exerciseError } = await supabase
        .from('program_exercises')
        .insert({
          workout_id: newWorkoutId,
          exercise_order: exerciseIndex + 1,
          exercise_name: exercise.exerciseName.trim(),
          notes: textOrNull(exercise.notes),
        })
        .select('id')
        .single();

      if (exerciseError || !exerciseData) {
        setError(exerciseError?.message || 'Could not create exercise.');
        setSaving(false);
        return;
      }

      const newExerciseId = (exerciseData as { id: string }).id;
      const setRows = exercise.sets.map((set, setIndex) => ({
        exercise_id: newExerciseId,
        set_order: setIndex + 1,
        target_reps: textOrNull(set.targetReps),
        target_weight_kg: numberOrNull(set.targetWeightKg),
        target_rpe: numberOrNull(set.targetRpe),
        target_rir: numberOrNull(set.targetRir),
        notes: textOrNull(set.notes),
      }));

      const { error: setsError } = await supabase.from('program_sets').insert(setRows);
      if (setsError) {
        setError(setsError.message);
        setSaving(false);
        return;
      }
    }

    setMessage('Workout saved. The client can now open Start your workout.');
    setWorkoutTitle('Upper Day');
    setDayLabel('');
    setInstructions('');
    setExercises([blankExercise()]);
    setSaving(false);
    await loadPage();
  };

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading training builder...</Card></div>;
  }

  if (error && !client) {
    return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;
  }

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold uppercase text-[#000000] tracking-tight">Training for {client?.full_name}</h1>
          {client?.email && <p className="mt-1 text-sm text-gray-600">{client.email}</p>}
        </div>
        <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
      </div>

      {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      <section>
        <SectionHeader title="CREATE WORKOUT" accent />
        <Card>
          <form onSubmit={handleSaveWorkout} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Programme title" value={programTitle} onChange={(e) => setProgramTitle(e.target.value)} required />
              <Input label="Workout title" value={workoutTitle} onChange={(e) => setWorkoutTitle(e.target.value)} required />
              <Input label="Day label" value={dayLabel} onChange={(e) => setDayLabel(e.target.value)} placeholder="e.g. Week 1 Day 1" />
              <Textarea label="Instructions" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </div>

            {exercises.map((exercise, exerciseIndex) => (
              <div key={exerciseIndex} className="rounded-xl border border-gray-200 p-4 space-y-4">
                <Input label={`Exercise ${exerciseIndex + 1}`} value={exercise.exerciseName} onChange={(e) => updateExercise(exerciseIndex, { exerciseName: e.target.value })} placeholder="e.g. Bench press" />
                <Textarea label="Exercise notes" value={exercise.notes} onChange={(e) => updateExercise(exerciseIndex, { notes: e.target.value })} />

                {exercise.sets.map((set, setIndex) => (
                  <div key={setIndex} className="grid grid-cols-1 md:grid-cols-5 gap-3 rounded-lg bg-gray-50 p-3">
                    <Input label={`Set ${setIndex + 1} reps`} value={set.targetReps} onChange={(e) => updateSet(exerciseIndex, setIndex, { targetReps: e.target.value })} placeholder="6-8" />
                    <Input label="Kg" type="number" step="0.5" value={set.targetWeightKg} onChange={(e) => updateSet(exerciseIndex, setIndex, { targetWeightKg: e.target.value })} />
                    <Input label="RPE" type="number" step="0.5" value={set.targetRpe} onChange={(e) => updateSet(exerciseIndex, setIndex, { targetRpe: e.target.value })} />
                    <Input label="RIR" type="number" step="0.5" value={set.targetRir} onChange={(e) => updateSet(exerciseIndex, setIndex, { targetRir: e.target.value })} />
                    <Input label="Notes" value={set.notes} onChange={(e) => updateSet(exerciseIndex, setIndex, { notes: e.target.value })} />
                  </div>
                ))}
              </div>
            ))}

            <div className="flex flex-col md:flex-row gap-3">
              <Button type="button" variant="outline" onClick={() => setExercises((current) => [...current, blankExercise()])}>Add exercise</Button>
              <Button type="submit" variant="primary" isLoading={saving} className="bg-[#FA0201] hover:bg-red-700">Save workout</Button>
            </div>
          </form>
        </Card>
      </section>

      <section>
        <SectionHeader title="COMPLETED WORKOUTS" accent />
        <Card>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-600">No completed workout companion sessions yet.</p>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div key={session.id} className="border-b border-gray-200 pb-4 last:border-b-0 last:pb-0">
                  <p className="font-bold uppercase text-[#000000]">{workoutTitles[session.program_workout_id] || 'Workout session'}</p>
                  <p className="text-xs text-gray-500">Completed: {formatDate(session.completed_at)} • Review: {session.review_status}</p>
                  {session.client_notes && <p className="mt-2 text-sm text-gray-700">{session.client_notes}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
