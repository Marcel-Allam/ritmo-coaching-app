'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = { id: string; full_name: string; email: string | null };
type ProgramRecord = { id: string; title: string; goal: string | null; status: string };
type WorkoutRecord = { id: string; program_id: string; title: string; scheduled_date: string | null; workout_order: number; status: string };
type SessionRecord = { program_workout_id: string };
type ExerciseCountRecord = { workout_id: string };
type CoachActionRecord = {
  id: string;
  action_type: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | string;
  due_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};
type TemplateSet = { reps: string; weightKg?: number | null; rpe?: number | null; notes?: string };
type TemplateExercise = { name: string; notes?: string; sets: TemplateSet[] };
type ProgramTemplate = {
  id: string;
  name: string;
  category: string;
  defaultProgramTitle: string;
  defaultWorkoutTitle: string;
  goal: string;
  instructions: string;
  exercises: TemplateExercise[];
};
type PrescribedSetForm = { reps: string; weightKg: string; rpe: string; notes: string };

const templates: ProgramTemplate[] = [
  {
    id: 'upper-a',
    name: 'Upper A',
    category: 'Upper Body',
    defaultProgramTitle: 'RITMO Upper Lower Programme',
    defaultWorkoutTitle: 'Upper A',
    goal: 'Upper-body session with horizontal push and pull emphasis.',
    instructions: 'Coach should edit exercise choices and loads before publishing if needed.',
    exercises: [
      { name: 'Bench Press', sets: [{ reps: '5' }, { reps: '5' }, { reps: '5' }] },
      { name: 'Row', sets: [{ reps: '6-8' }, { reps: '6-8' }, { reps: '6-8' }] },
      { name: 'Incline Dumbbell Press', sets: [{ reps: '8-10' }, { reps: '8-10' }, { reps: '8-10' }] },
      { name: 'Lat Pulldown', sets: [{ reps: '10-12' }, { reps: '10-12' }, { reps: '10-12' }] },
    ],
  },
  {
    id: 'full-body',
    name: 'Full Body',
    category: 'Full Body',
    defaultProgramTitle: 'RITMO Full Body Programme',
    defaultWorkoutTitle: 'Full Body',
    goal: 'Balanced session for clients training two to three times per week.',
    instructions: 'Use as a simple full-body session. Loads are coach-set for now.',
    exercises: [
      { name: 'Squat', sets: [{ reps: '5' }, { reps: '5' }, { reps: '5' }] },
      { name: 'Bench Press', sets: [{ reps: '5' }, { reps: '5' }, { reps: '5' }] },
      { name: 'Romanian Deadlift', sets: [{ reps: '8' }, { reps: '8' }, { reps: '8' }] },
      { name: 'Seated Row', sets: [{ reps: '10-12' }, { reps: '10-12' }, { reps: '10-12' }] },
    ],
  },
  {
    id: 'squat-base',
    name: 'Squat Strength Base',
    category: 'Strength Block',
    defaultProgramTitle: 'RITMO Squat Strength Base',
    defaultWorkoutTitle: 'Squat Strength Session',
    goal: 'Squat-focused structure before progression rules are added.',
    instructions: 'This is a fixed structure. Coach manually sets loads for v1.',
    exercises: [
      { name: 'Back Squat', sets: [{ reps: '5' }, { reps: '5' }, { reps: '5' }] },
      { name: 'Paused Squat', sets: [{ reps: '3' }, { reps: '3' }, { reps: '3' }] },
      { name: 'Romanian Deadlift', sets: [{ reps: '8' }, { reps: '8' }, { reps: '8' }] },
      { name: 'Leg Press', sets: [{ reps: '10-12' }, { reps: '10-12' }, { reps: '10-12' }] },
    ],
  },
];

const formatDate = (value: string | null) => {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
};

const numberOrNull = (value: string) => (value.trim() ? Number(value) : null);
const statusForWorkout = (workout: WorkoutRecord, completedIds: Set<string>) => {
  if (completedIds.has(workout.id)) return 'completed';
  if (workout.scheduled_date) return 'scheduled';
  return 'unscheduled';
};
const statusVariant = (status: string) => (status === 'completed' ? 'success' : status === 'scheduled' ? 'default' : 'warning');
const priorityVariant = (priority: string) => (priority === 'high' ? 'danger' : priority === 'medium' ? 'warning' : 'default');

// Convert the selected template into editable prescription rows.
// This keeps templates reusable while letting the coach manually prescribe load/RPE per client.
const buildPrescriptionForm = (template: ProgramTemplate) => {
  return template.exercises.map((exercise) =>
    exercise.sets.map((set) => ({
      reps: set.reps,
      weightKg: typeof set.weightKg === 'number' ? set.weightKg.toString() : '',
      rpe: typeof set.rpe === 'number' ? set.rpe.toString() : '',
      notes: set.notes || '',
    }))
  );
};

export default function CoachClientProgramPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutRecord[]>([]);
  const [pendingAdjustments, setPendingAdjustments] = useState<CoachActionRecord[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({});
  const [templateId, setTemplateId] = useState(templates[0].id);
  const [programTitle, setProgramTitle] = useState(templates[0].defaultProgramTitle);
  const [workoutTitle, setWorkoutTitle] = useState(templates[0].defaultWorkoutTitle);
  const [scheduledDate, setScheduledDate] = useState('');
  const [instructions, setInstructions] = useState(templates[0].instructions);
  const [prescription, setPrescription] = useState<PrescribedSetForm[][]>(buildPrescriptionForm(templates[0]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingActionId, setUpdatingActionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = useMemo(() => templates.find((template) => template.id === templateId) || templates[0], [templateId]);
  const programById = useMemo(() => programs.reduce<Record<string, ProgramRecord>>((acc, program) => ({ ...acc, [program.id]: program }), {}), [programs]);

  const loadPage = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const [clientResult, programResult, workoutResult, sessionResult, actionResult] = await Promise.all([
      supabase.from('clients').select('id, full_name, email').eq('id', clientId).single(),
      supabase.from('training_programs').select('id, title, goal, status').eq('client_id', clientId).eq('status', 'active').order('created_at', { ascending: false }),
      supabase.from('program_workouts').select('id, program_id, title, scheduled_date, workout_order, status').eq('client_id', clientId).neq('status', 'archived').order('scheduled_date', { ascending: true, nullsFirst: false }).order('workout_order', { ascending: true }),
      supabase.from('workout_sessions').select('program_workout_id').eq('client_id', clientId).eq('status', 'completed'),
      supabase
        .from('coach_actions')
        .select('id, action_type, description, priority, due_date, status, notes, created_at')
        .eq('client_id', clientId)
        .eq('action_type', 'programme_adjustment')
        .not('status', 'in', '(done,no_action_needed)')
        .order('created_at', { ascending: false }),
    ]);

    if (clientResult.error || !clientResult.data) {
      setError(clientResult.error?.message || 'Client not found.');
      setLoading(false);
      return;
    }
    if (programResult.error || workoutResult.error || sessionResult.error || actionResult.error) {
      setError(programResult.error?.message || workoutResult.error?.message || sessionResult.error?.message || actionResult.error?.message || 'Could not load programme.');
      setLoading(false);
      return;
    }

    const loadedWorkouts = (workoutResult.data ?? []) as WorkoutRecord[];
    const workoutIds = loadedWorkouts.map((workout) => workout.id);
    let counts: Record<string, number> = {};
    if (workoutIds.length > 0) {
      const { data: exerciseData, error: exerciseError } = await supabase.from('program_exercises').select('workout_id').in('workout_id', workoutIds);
      if (exerciseError) {
        setError(exerciseError.message);
        setLoading(false);
        return;
      }
      counts = ((exerciseData ?? []) as ExerciseCountRecord[]).reduce<Record<string, number>>((acc, exercise) => {
        acc[exercise.workout_id] = (acc[exercise.workout_id] || 0) + 1;
        return acc;
      }, {});
    }

    setClient(clientResult.data as ClientRecord);
    setPrograms((programResult.data ?? []) as ProgramRecord[]);
    setWorkouts(loadedWorkouts);
    setPendingAdjustments((actionResult.data ?? []) as CoachActionRecord[]);
    setCompletedIds(new Set(((sessionResult.data ?? []) as SessionRecord[]).map((session) => session.program_workout_id)));
    setExerciseCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    loadPage();
  }, [clientId]);

  const chooseTemplate = (id: string) => {
    const template = templates.find((item) => item.id === id) || templates[0];
    setTemplateId(template.id);
    setProgramTitle(template.defaultProgramTitle);
    setWorkoutTitle(template.defaultWorkoutTitle);
    setInstructions(template.instructions);
    setPrescription(buildPrescriptionForm(template));
  };

  const updatePrescriptionSet = (exerciseIndex: number, setIndex: number, updates: Partial<PrescribedSetForm>) => {
    setPrescription((current) =>
      current.map((exerciseSets, currentExerciseIndex) => {
        if (currentExerciseIndex !== exerciseIndex) return exerciseSets;
        return exerciseSets.map((set, currentSetIndex) => (currentSetIndex === setIndex ? { ...set, ...updates } : set));
      })
    );
  };

  const markAdjustmentHandled = async (actionId: string) => {
    if (!isSupabaseConfigured) return;

    setUpdatingActionId(actionId);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: actionError } = await supabase
      .from('coach_actions')
      .update({ status: 'done' })
      .eq('id', actionId)
      .eq('client_id', clientId);

    if (actionError) {
      setError(actionError.message);
      setUpdatingActionId(null);
      return;
    }

    setPendingAdjustments((current) => current.filter((action) => action.id !== actionId));
    setMessage('Programme adjustment marked as handled.');
    setUpdatingActionId(null);
  };

  const assignTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSupabaseConfigured) return;
    if (!programTitle.trim() || !workoutTitle.trim()) {
      setError('Programme title and workout title are required.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    let programId = programs.find((program) => program.title === programTitle.trim())?.id || null;

    if (!programId) {
      const { data: newProgram, error: programError } = await supabase.from('training_programs').insert({
        client_id: clientId,
        title: programTitle.trim(),
        goal: selectedTemplate.goal,
        status: 'active',
        start_date: scheduledDate || new Date().toISOString().slice(0, 10),
      }).select('id').single();

      if (programError || !newProgram) {
        setError(programError?.message || 'Could not create programme.');
        setSaving(false);
        return;
      }
      programId = (newProgram as { id: string }).id;
    }

    const { count } = await supabase.from('program_workouts').select('id', { count: 'exact', head: true }).eq('program_id', programId);
    const { data: workoutData, error: workoutError } = await supabase.from('program_workouts').insert({
      client_id: clientId,
      program_id: programId,
      title: workoutTitle.trim(),
      day_label: selectedTemplate.name,
      workout_order: (count ?? 0) + 1,
      scheduled_date: scheduledDate || null,
      instructions: instructions.trim() || selectedTemplate.instructions,
      status: 'active',
    }).select('id').single();

    if (workoutError || !workoutData) {
      setError(workoutError?.message || 'Could not assign workout.');
      setSaving(false);
      return;
    }

    const workoutId = (workoutData as { id: string }).id;
    for (const [exerciseIndex, exercise] of selectedTemplate.exercises.entries()) {
      const { data: exerciseData, error: exerciseError } = await supabase.from('program_exercises').insert({
        workout_id: workoutId,
        exercise_order: exerciseIndex + 1,
        exercise_name: exercise.name,
        notes: exercise.notes || null,
      }).select('id').single();

      if (exerciseError || !exerciseData) {
        setError(exerciseError?.message || 'Workout created, but exercise creation failed.');
        setSaving(false);
        return;
      }

      const exerciseId = (exerciseData as { id: string }).id;
      const setRows = (prescription[exerciseIndex] || []).map((set, setIndex) => ({
        exercise_id: exerciseId,
        set_order: setIndex + 1,
        target_reps: set.reps.trim() || null,
        target_weight_kg: numberOrNull(set.weightKg),
        target_rpe: numberOrNull(set.rpe),
        target_rir: null,
        notes: set.notes.trim() || null,
      }));

      const { error: setsError } = await supabase.from('program_sets').insert(setRows);
      if (setsError) {
        setError(setsError.message);
        setSaving(false);
        return;
      }
    }

    setMessage('Programme workout assigned with prescribed reps, KG and target RPE.');
    setSaving(false);
    setLoading(true);
    await loadPage();
  };

  if (loading) return <div className="p-6 md:p-8"><Card>Loading client programme...</Card></div>;
  if (error && !client) return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Client Program</h1>
          <p className="mt-1 text-sm text-gray-600">{client?.full_name}{client?.email ? ` • ${client.email}` : ''}</p>
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">Assign sessions, prescribe starting loads, and keep progression rules for later.</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
          <Link href={`/coach/clients/${clientId}/current-workouts`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Current workouts</Link>
        </div>
      </div>

      {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      <section>
        <SectionHeader title="PENDING PROGRAMME ADJUSTMENTS" accent />
        <Card>
          {pendingAdjustments.length === 0 ? (
            <p className="text-sm text-gray-600">No pending programme adjustments from workout review.</p>
          ) : (
            <div className="space-y-4">
              {pendingAdjustments.map((action) => (
                <div key={action.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={priorityVariant(action.priority) as any}>{action.priority}</Badge>
                        <Badge variant="default">{action.status}</Badge>
                      </div>
                      <p className="whitespace-pre-line text-sm font-semibold text-[#000000]">{action.description}</p>
                      {action.notes && <p className="whitespace-pre-line text-xs text-gray-500">{action.notes}</p>}
                      <p className="text-xs font-semibold uppercase text-gray-400">Created: {formatDate(action.created_at)}{action.due_date ? ` • Due: ${formatDate(action.due_date)}` : ''}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => markAdjustmentHandled(action.id)}
                      disabled={updatingActionId === action.id}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50 disabled:opacity-60"
                    >
                      {updatingActionId === action.id ? 'Updating...' : 'Mark handled'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader title="ASSIGN TEMPLATE" accent />
        <Card>
          <form onSubmit={assignTemplate} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold uppercase">Template</label>
                <select value={templateId} onChange={(event) => chooseTemplate(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black">
                  {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                </select>
              </div>
              <Input label="Scheduled date" type="date" value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
              <Input label="Programme title" value={programTitle} onChange={(event) => setProgramTitle(event.target.value)} required />
              <Input label="Workout title" value={workoutTitle} onChange={(event) => setWorkoutTitle(event.target.value)} required />
            </div>
            <Textarea label="Client-facing instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} />

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="default">{selectedTemplate.category}</Badge>
                <p className="text-sm font-bold uppercase text-[#000000]">{selectedTemplate.name}</p>
              </div>
              <p className="mb-4 text-sm text-gray-700">{selectedTemplate.goal}</p>
              <div className="space-y-4">
                {selectedTemplate.exercises.map((exercise, exerciseIndex) => (
                  <div key={`${exercise.name}-${exerciseIndex}`} className="rounded-lg bg-white p-4">
                    <p className="text-sm font-bold uppercase text-[#000000]">{exerciseIndex + 1}. {exercise.name}</p>
                    <div className="mt-3 space-y-3">
                      {(prescription[exerciseIndex] || []).map((set, setIndex) => (
                        <div key={`${exercise.name}-${setIndex}`} className="grid grid-cols-1 gap-3 md:grid-cols-[70px_1fr_1fr_1fr_2fr] md:items-end">
                          <p className="pb-2 text-xs font-bold uppercase text-gray-500">Set {setIndex + 1}</p>
                          <Input label="Reps" value={set.reps} onChange={(event) => updatePrescriptionSet(exerciseIndex, setIndex, { reps: event.target.value })} />
                          <Input label="KG" type="number" step="2.5" value={set.weightKg} onChange={(event) => updatePrescriptionSet(exerciseIndex, setIndex, { weightKg: event.target.value })} placeholder="Optional" />
                          <Input label="Target RPE" type="number" step="0.5" min="1" max="10" value={set.rpe} onChange={(event) => updatePrescriptionSet(exerciseIndex, setIndex, { rpe: event.target.value })} placeholder="Optional" />
                          <Input label="Set notes" value={set.notes} onChange={(event) => updatePrescriptionSet(exerciseIndex, setIndex, { notes: event.target.value })} placeholder="Optional" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <Button type="submit" isLoading={saving} className="bg-[#FA0201] hover:bg-red-700">Assign to client</Button>
          </form>
        </Card>
      </section>

      <section>
        <SectionHeader title="CURRENT PROGRAMME DELIVERY" accent />
        <Card>
          {workouts.length === 0 ? (
            <p className="text-sm text-gray-600">No active workouts assigned yet.</p>
          ) : (
            <div className="space-y-4">
              {workouts.map((workout) => {
                const status = statusForWorkout(workout, completedIds);
                const program = programById[workout.program_id];
                return (
                  <div key={workout.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase text-gray-500">{program?.title || 'Programme'}</p>
                        <p className="mt-1 text-lg font-bold uppercase text-[#000000]">{workout.title}</p>
                        <p className="mt-1 text-sm text-gray-600">Scheduled: {formatDate(workout.scheduled_date)} • Exercises: {exerciseCounts[workout.id] || 0}</p>
                      </div>
                      <div className="flex flex-col gap-2 md:items-end">
                        <Badge variant={statusVariant(status) as any}>{status}</Badge>
                        <Link href={`/coach/clients/${clientId}/current-workouts/${workout.id}/edit`} className="text-xs font-bold uppercase text-[#FA0201] hover:underline">Edit workout</Link>
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
