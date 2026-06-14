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
type SetForm = { targetReps: string; targetWeightKg: string; notes: string };
type ExerciseForm = { exerciseName: string; notes: string; sets: SetForm[] };
type SessionRecord = { id: string; program_workout_id: string; completed_at: string | null; review_status: string; client_notes: string | null };
type WorkoutRecord = { id: string; title: string };
type PerformedSetRecord = {
  id: string;
  session_id: string;
  program_exercise_id: string;
  program_set_id: string | null;
  set_order: number;
  actual_weight_kg: number | null;
  actual_reps: number | null;
  actual_rpe: number | null;
  completed: boolean;
  notes: string | null;
};
type ProgramExerciseRecord = { id: string; exercise_order: number; exercise_name: string };
type ProgramSetRecord = { id: string; target_reps: string | null; target_weight_kg: number | null; notes: string | null };
type AnalysisSetRecord = {
  sessionId: string;
  exerciseOrder: number;
  exerciseName: string;
  setOrder: number;
  targetReps: string | null;
  targetWeightKg: number | null;
  prescribedNotes: string | null;
  actualWeightKg: number | null;
  actualReps: number | null;
  actualRpe: number | null;
  completed: boolean;
  clientSetNotes: string | null;
};

const blankSet = (): SetForm => ({ targetReps: '', targetWeightKg: '', notes: '' });
const blankExercise = (): ExerciseForm => ({ exerciseName: '', notes: '', sets: [blankSet(), blankSet(), blankSet()] });
const numberOrNull = (value: string) => (value.trim() ? Number(value) : null);
const textOrNull = (value: string) => value.trim() || null;

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
};

const formatWeight = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return `${value}kg`;
};

const formatReps = (value: string | number | null) => {
  if (value === null || value === undefined || value === '') return '-';
  return `${value} reps`;
};

const getRpeClassName = (rpe: number | null) => {
  if (rpe === null || rpe === undefined) return 'bg-gray-100 text-gray-600';
  if (rpe >= 9.5) return 'bg-red-100 text-red-700';
  if (rpe >= 9) return 'bg-orange-100 text-orange-700';
  if (rpe >= 8) return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
};

const getRpeLabel = (rpe: number | null) => {
  if (rpe === null || rpe === undefined) return 'No RPE';
  if (rpe >= 9.5) return 'Near max';
  if (rpe >= 9) return 'Very hard';
  if (rpe >= 8) return 'Hard';
  return 'Manageable';
};

export default function CoachClientTrainingPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [workoutTitles, setWorkoutTitles] = useState<Record<string, string>>({});
  const [analysisSetsBySession, setAnalysisSetsBySession] = useState<Record<string, AnalysisSetRecord[]>>({});
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
    const sessionIds = loadedSessions.map((session) => session.id);
    let titleMap: Record<string, string> = {};
    let groupedAnalysisSets: Record<string, AnalysisSetRecord[]> = {};

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

    if (sessionIds.length > 0) {
      const { data: performedData, error: performedError } = await supabase
        .from('performed_sets')
        .select('id, session_id, program_exercise_id, program_set_id, set_order, actual_weight_kg, actual_reps, actual_rpe, completed, notes')
        .in('session_id', sessionIds)
        .order('set_order', { ascending: true });

      if (performedError) {
        setError(performedError.message);
        setLoading(false);
        return;
      }

      const performedSets = (performedData ?? []) as PerformedSetRecord[];
      const exerciseIds = [...new Set(performedSets.map((set) => set.program_exercise_id))];
      const prescribedSetIds = [...new Set(performedSets.map((set) => set.program_set_id).filter(Boolean))] as string[];

      const [exerciseResult, prescribedSetResult] = await Promise.all([
        exerciseIds.length > 0
          ? supabase
              .from('program_exercises')
              .select('id, exercise_order, exercise_name')
              .in('id', exerciseIds)
          : Promise.resolve({ data: [], error: null }),
        prescribedSetIds.length > 0
          ? supabase
              .from('program_sets')
              .select('id, target_reps, target_weight_kg, notes')
              .in('id', prescribedSetIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (exerciseResult.error) {
        setError(exerciseResult.error.message);
        setLoading(false);
        return;
      }

      if (prescribedSetResult.error) {
        setError(prescribedSetResult.error.message);
        setLoading(false);
        return;
      }

      const exerciseMap = ((exerciseResult.data ?? []) as ProgramExerciseRecord[]).reduce<Record<string, ProgramExerciseRecord>>((acc, exercise) => {
        acc[exercise.id] = exercise;
        return acc;
      }, {});

      const prescribedSetMap = ((prescribedSetResult.data ?? []) as ProgramSetRecord[]).reduce<Record<string, ProgramSetRecord>>((acc, set) => {
        acc[set.id] = set;
        return acc;
      }, {});

      groupedAnalysisSets = performedSets.reduce<Record<string, AnalysisSetRecord[]>>((acc, performedSet) => {
        const exercise = exerciseMap[performedSet.program_exercise_id];
        const prescribedSet = performedSet.program_set_id ? prescribedSetMap[performedSet.program_set_id] : undefined;
        const row: AnalysisSetRecord = {
          sessionId: performedSet.session_id,
          exerciseOrder: exercise?.exercise_order ?? 999,
          exerciseName: exercise?.exercise_name ?? 'Exercise',
          setOrder: performedSet.set_order,
          targetReps: prescribedSet?.target_reps ?? null,
          targetWeightKg: prescribedSet?.target_weight_kg ?? null,
          prescribedNotes: prescribedSet?.notes ?? null,
          actualWeightKg: performedSet.actual_weight_kg,
          actualReps: performedSet.actual_reps,
          actualRpe: performedSet.actual_rpe,
          completed: performedSet.completed,
          clientSetNotes: performedSet.notes,
        };

        acc[performedSet.session_id] = [...(acc[performedSet.session_id] || []), row].sort((a, b) => {
          if (a.exerciseOrder !== b.exerciseOrder) return a.exerciseOrder - b.exerciseOrder;
          return a.setOrder - b.setOrder;
        });
        return acc;
      }, {});
    }

    setClient(clientData as ClientRecord);
    setSessions(loadedSessions);
    setWorkoutTitles(titleMap);
    setAnalysisSetsBySession(groupedAnalysisSets);
    setLoading(false);
  };

  useEffect(() => {
    loadPage();
  }, [clientId]);

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
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-bold uppercase text-[#000000]">Exercise {exerciseIndex + 1}</p>
                  {exercises.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeExercise(exerciseIndex)}
                      className="text-xs font-bold uppercase text-[#FA0201] hover:underline"
                    >
                      Remove exercise
                    </button>
                  )}
                </div>

                <Input value={exercise.exerciseName} onChange={(e) => updateExercise(exerciseIndex, { exerciseName: e.target.value })} placeholder="e.g. Bench press" />
                <Textarea label="Exercise notes" value={exercise.notes} onChange={(e) => updateExercise(exerciseIndex, { notes: e.target.value })} />

                <div className="overflow-x-auto rounded-lg bg-gray-50 p-3">
                  <div className="grid min-w-[640px] grid-cols-[80px_1fr_1fr_2fr] gap-3 px-1 pb-2 text-xs font-bold uppercase text-gray-600">
                    <div />
                    <p>Reps</p>
                    <p>Kg</p>
                    <p>Notes</p>
                  </div>
                  <div className="space-y-3">
                    {exercise.sets.map((set, setIndex) => (
                      <div key={setIndex} className="grid min-w-[640px] grid-cols-[80px_1fr_1fr_2fr] items-center gap-3">
                        <p className="text-sm font-bold uppercase text-[#000000]">Set {setIndex + 1}</p>
                        <Input value={set.targetReps} onChange={(e) => updateSet(exerciseIndex, setIndex, { targetReps: e.target.value })} placeholder="6-8" />
                        <Input type="number" step="0.5" value={set.targetWeightKg} onChange={(e) => updateSet(exerciseIndex, setIndex, { targetWeightKg: e.target.value })} />
                        <Input value={set.notes} onChange={(e) => updateSet(exerciseIndex, setIndex, { notes: e.target.value })} />
                      </div>
                    ))}
                  </div>
                </div>
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
        <SectionHeader title="COMPLETED WORKOUT ANALYSIS" accent />
        <Card>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-600">No completed workout companion sessions yet.</p>
          ) : (
            <div className="space-y-8">
              {sessions.map((session) => {
                const analysisRows = analysisSetsBySession[session.id] || [];
                const highRpeCount = analysisRows.filter((row) => (row.actualRpe ?? 0) >= 9).length;
                const missedSetCount = analysisRows.filter((row) => !row.completed).length;

                return (
                  <div key={session.id} className="border-b border-gray-200 pb-8 last:border-b-0 last:pb-0">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-bold uppercase text-[#000000]">{workoutTitles[session.program_workout_id] || 'Workout session'}</p>
                        <p className="text-xs text-gray-500">Completed: {formatDate(session.completed_at)} • Review: {session.review_status}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {highRpeCount > 0 && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase text-red-700">{highRpeCount} high RPE</span>}
                        {missedSetCount > 0 && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold uppercase text-gray-700">{missedSetCount} incomplete</span>}
                      </div>
                    </div>

                    {session.client_notes && <p className="mt-3 text-sm text-gray-700">Client notes: {session.client_notes}</p>}

                    <div className="mt-5 overflow-x-auto">
                      <div className="min-w-[820px] rounded-lg border border-gray-200">
                        <div className="grid grid-cols-[1.5fr_0.7fr_1.3fr_1.3fr_0.9fr_0.9fr_1.5fr] gap-3 bg-gray-100 px-4 py-3 text-xs font-bold uppercase text-gray-600">
                          <p>Exercise</p>
                          <p>Set</p>
                          <p>Prescribed</p>
                          <p>Performed</p>
                          <p>RPE</p>
                          <p>Status</p>
                          <p>Notes</p>
                        </div>

                        {analysisRows.length === 0 ? (
                          <p className="px-4 py-4 text-sm text-gray-600">No set data found for this session.</p>
                        ) : (
                          analysisRows.map((row, index) => (
                            <div key={`${session.id}-${index}`} className="grid grid-cols-[1.5fr_0.7fr_1.3fr_1.3fr_0.9fr_0.9fr_1.5fr] gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-800">
                              <p className="font-semibold">{row.exerciseName}</p>
                              <p>Set {row.setOrder}</p>
                              <p>{formatWeight(row.targetWeightKg)} × {formatReps(row.targetReps)}</p>
                              <p>{formatWeight(row.actualWeightKg)} × {formatReps(row.actualReps)}</p>
                              <p>
                                <span className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${getRpeClassName(row.actualRpe)}`}>
                                  {row.actualRpe ?? '-'} • {getRpeLabel(row.actualRpe)}
                                </span>
                              </p>
                              <p>{row.completed ? 'Complete' : 'Incomplete'}</p>
                              <p className="text-gray-600">{row.clientSetNotes || row.prescribedNotes || '-'}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
