'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type AssignmentMode = 'programme' | 'workout';
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
type WorkoutTemplate = {
  id: string;
  name: string;
  category: string;
  defaultWorkoutTitle: string;
  dayLabel: string;
  goal: string;
  instructions: string;
  exercises: TemplateExercise[];
};
type ProgrammeTemplate = {
  id: string;
  name: string;
  category: string;
  defaultProgramTitle: string;
  goal: string;
  description: string;
  workoutTemplateIds: string[];
};
type PrescribedSetForm = { reps: string; weightKg: string; rpe: string; notes: string };

type ExerciseIdRecord = { id: string };

const workoutTemplates: WorkoutTemplate[] = [
  {
    id: 'squat-focus',
    name: 'Squat Focus',
    category: 'Strength',
    defaultWorkoutTitle: 'Squat Focus',
    dayLabel: 'Squat Focus',
    goal: 'Lower-body strength session built around squat progression.',
    instructions: 'Prioritise squat quality, controlled warm-ups, and strong bracing. Keep accessories clean rather than maximal.',
    exercises: [
      { name: 'Back Squat', sets: [{ reps: '5', rpe: 7 }, { reps: '5', rpe: 7.5 }, { reps: '5', rpe: 8 }] },
      { name: 'Paused Squat', sets: [{ reps: '3', rpe: 7 }, { reps: '3', rpe: 7 }, { reps: '3', rpe: 7 }] },
      { name: 'Romanian Deadlift', sets: [{ reps: '8', rpe: 7 }, { reps: '8', rpe: 7 }, { reps: '8', rpe: 7 }] },
      { name: 'Leg Press', sets: [{ reps: '10-12' }, { reps: '10-12' }, { reps: '10-12' }] },
    ],
  },
  {
    id: 'bench-focus',
    name: 'Bench Focus',
    category: 'Strength',
    defaultWorkoutTitle: 'Bench Focus',
    dayLabel: 'Bench Focus',
    goal: 'Upper-body strength session built around bench press progression.',
    instructions: 'Bench comes first. Keep technique consistent and use accessories to build pressing volume without grinding.',
    exercises: [
      { name: 'Bench Press', sets: [{ reps: '5', rpe: 7 }, { reps: '5', rpe: 7.5 }, { reps: '5', rpe: 8 }] },
      { name: 'Paused Bench Press', sets: [{ reps: '3', rpe: 7 }, { reps: '3', rpe: 7 }, { reps: '3', rpe: 7 }] },
      { name: 'Chest-Supported Row', sets: [{ reps: '8-10' }, { reps: '8-10' }, { reps: '8-10' }] },
      { name: 'Incline Dumbbell Press', sets: [{ reps: '8-10' }, { reps: '8-10' }, { reps: '8-10' }] },
      { name: 'Lat Pulldown', sets: [{ reps: '10-12' }, { reps: '10-12' }, { reps: '10-12' }] },
    ],
  },
  {
    id: 'deadlift-focus',
    name: 'Deadlift Focus',
    category: 'Strength',
    defaultWorkoutTitle: 'Deadlift Focus',
    dayLabel: 'Deadlift Focus',
    goal: 'Posterior-chain strength session built around deadlift progression.',
    instructions: 'Deadlift quality is the priority. Stop sets before form breaks and keep accessories controlled.',
    exercises: [
      { name: 'Deadlift', sets: [{ reps: '3', rpe: 7 }, { reps: '3', rpe: 7.5 }, { reps: '3', rpe: 8 }] },
      { name: 'Block Pull or Deficit Deadlift', sets: [{ reps: '4', rpe: 7 }, { reps: '4', rpe: 7 }, { reps: '4', rpe: 7 }] },
      { name: 'Front Squat', sets: [{ reps: '5', rpe: 7 }, { reps: '5', rpe: 7 }, { reps: '5', rpe: 7 }] },
      { name: 'Hamstring Curl', sets: [{ reps: '10-12' }, { reps: '10-12' }, { reps: '10-12' }] },
    ],
  },
  {
    id: 'upper-a',
    name: 'Upper A',
    category: 'Upper / Lower',
    defaultWorkoutTitle: 'Upper A',
    dayLabel: 'Upper A',
    goal: 'Upper-body session with horizontal push and pull emphasis.',
    instructions: 'Balanced upper-body session. Keep main press strong and accessories controlled.',
    exercises: [
      { name: 'Bench Press', sets: [{ reps: '5' }, { reps: '5' }, { reps: '5' }] },
      { name: 'Row', sets: [{ reps: '6-8' }, { reps: '6-8' }, { reps: '6-8' }] },
      { name: 'Incline Dumbbell Press', sets: [{ reps: '8-10' }, { reps: '8-10' }, { reps: '8-10' }] },
      { name: 'Lat Pulldown', sets: [{ reps: '10-12' }, { reps: '10-12' }, { reps: '10-12' }] },
    ],
  },
  {
    id: 'lower-a',
    name: 'Lower A',
    category: 'Upper / Lower',
    defaultWorkoutTitle: 'Lower A',
    dayLabel: 'Lower A',
    goal: 'Lower-body session with squat emphasis and posterior-chain accessories.',
    instructions: 'Squat pattern first, then posterior-chain and leg volume. Do not turn accessories into max-effort work.',
    exercises: [
      { name: 'Squat', sets: [{ reps: '5' }, { reps: '5' }, { reps: '5' }] },
      { name: 'Romanian Deadlift', sets: [{ reps: '8' }, { reps: '8' }, { reps: '8' }] },
      { name: 'Leg Press', sets: [{ reps: '10-12' }, { reps: '10-12' }, { reps: '10-12' }] },
      { name: 'Calf Raise', sets: [{ reps: '12-15' }, { reps: '12-15' }, { reps: '12-15' }] },
    ],
  },
  {
    id: 'full-body',
    name: 'Full Body',
    category: 'Full Body',
    defaultWorkoutTitle: 'Full Body',
    dayLabel: 'Full Body',
    goal: 'Balanced session for clients training two to three times per week.',
    instructions: 'Use this as a simple full-body session. Loads are coach-set for now.',
    exercises: [
      { name: 'Squat', sets: [{ reps: '5' }, { reps: '5' }, { reps: '5' }] },
      { name: 'Bench Press', sets: [{ reps: '5' }, { reps: '5' }, { reps: '5' }] },
      { name: 'Romanian Deadlift', sets: [{ reps: '8' }, { reps: '8' }, { reps: '8' }] },
      { name: 'Seated Row', sets: [{ reps: '10-12' }, { reps: '10-12' }, { reps: '10-12' }] },
    ],
  },
];

const programmeTemplates: ProgrammeTemplate[] = [
  {
    id: 'strength-big-three',
    name: 'Strength Programme — Big 3 Split',
    category: 'Strength',
    defaultProgramTitle: 'RITMO Strength Programme',
    goal: 'Three-session strength split built around squat, bench, and deadlift focus days.',
    description: 'Creates Squat Focus, Bench Focus, and Deadlift Focus workouts as one programme. Best for strength-focused clients training three days per week.',
    workoutTemplateIds: ['squat-focus', 'bench-focus', 'deadlift-focus'],
  },
  {
    id: 'upper-lower-base',
    name: 'Upper / Lower Base',
    category: 'Strength & Physique',
    defaultProgramTitle: 'RITMO Upper / Lower Programme',
    goal: 'Simple upper/lower structure for clients training two to four days per week.',
    description: 'Creates Upper A and Lower A as a base. Duplicate/edit workouts later for Upper B and Lower B if needed.',
    workoutTemplateIds: ['upper-a', 'lower-a'],
  },
  {
    id: 'full-body-3x',
    name: 'Full Body 3x Base',
    category: 'General Strength',
    defaultProgramTitle: 'RITMO Full Body Programme',
    goal: 'Repeatable full-body base for busy lifters training two to three days per week.',
    description: 'Creates three Full Body sessions. Edit each copy after assigning if you want different exercise emphasis.',
    workoutTemplateIds: ['full-body', 'full-body', 'full-body'],
  },
];

const workoutTemplateById = workoutTemplates.reduce<Record<string, WorkoutTemplate>>((acc, template) => {
  acc[template.id] = template;
  return acc;
}, {});

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

const buildPrescriptionForm = (template: WorkoutTemplate) => {
  return template.exercises.map((exercise) =>
    exercise.sets.map((set) => ({
      reps: set.reps,
      weightKg: typeof set.weightKg === 'number' ? set.weightKg.toString() : '',
      rpe: typeof set.rpe === 'number' ? set.rpe.toString() : '',
      notes: set.notes || '',
    }))
  );
};

const getSetLabel = (set: TemplateSet | PrescribedSetForm) => {
  const reps = 'reps' in set ? set.reps : '';
  const weight = 'weightKg' in set && set.weightKg ? `${set.weightKg}kg` : null;
  const rpe = 'rpe' in set && set.rpe ? `RPE ${set.rpe}` : null;
  return [reps ? `${reps} reps` : null, weight, rpe].filter(Boolean).join(' • ') || 'Set';
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
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('programme');
  const [programmeTemplateId, setProgrammeTemplateId] = useState(programmeTemplates[0].id);
  const [workoutTemplateId, setWorkoutTemplateId] = useState(workoutTemplates[0].id);
  const [programTitle, setProgramTitle] = useState(programmeTemplates[0].defaultProgramTitle);
  const [singleWorkoutTitle, setSingleWorkoutTitle] = useState(workoutTemplates[0].defaultWorkoutTitle);
  const [singleScheduledDate, setSingleScheduledDate] = useState('');
  const [singleInstructions, setSingleInstructions] = useState(workoutTemplates[0].instructions);
  const [singlePrescription, setSinglePrescription] = useState<PrescribedSetForm[][]>(buildPrescriptionForm(workoutTemplates[0]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingActionId, setUpdatingActionId] = useState<string | null>(null);
  const [deletingWorkoutId, setDeletingWorkoutId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProgrammeTemplate = useMemo(() => programmeTemplates.find((template) => template.id === programmeTemplateId) || programmeTemplates[0], [programmeTemplateId]);
  const selectedWorkoutTemplate = useMemo(() => workoutTemplates.find((template) => template.id === workoutTemplateId) || workoutTemplates[0], [workoutTemplateId]);
  const selectedProgrammeWorkouts = useMemo(() => selectedProgrammeTemplate.workoutTemplateIds.map((id) => workoutTemplateById[id]).filter(Boolean), [selectedProgrammeTemplate]);
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

  const chooseProgrammeTemplate = (id: string) => {
    const template = programmeTemplates.find((item) => item.id === id) || programmeTemplates[0];
    setProgrammeTemplateId(template.id);
    setProgramTitle(template.defaultProgramTitle);
    setMessage(null);
    setError(null);
  };

  const chooseWorkoutTemplate = (id: string) => {
    const template = workoutTemplates.find((item) => item.id === id) || workoutTemplates[0];
    setWorkoutTemplateId(template.id);
    setSingleWorkoutTitle(template.defaultWorkoutTitle);
    setSingleInstructions(template.instructions);
    setSinglePrescription(buildPrescriptionForm(template));
    setMessage(null);
    setError(null);
  };

  const updatePrescriptionSet = (exerciseIndex: number, setIndex: number, updates: Partial<PrescribedSetForm>) => {
    setSinglePrescription((current) =>
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

  const deleteWorkout = async (workout: WorkoutRecord) => {
    if (!isSupabaseConfigured) return;

    const currentStatus = statusForWorkout(workout, completedIds);
    if (currentStatus === 'completed') {
      setError('Completed workouts are locked. Keep them as history and duplicate future work instead.');
      return;
    }

    const confirmed = window.confirm(`Delete ${workout.title} from this client's programme? This removes the workout, exercises and prescribed sets. This should only be used before the client completes it.`);
    if (!confirmed) return;

    setDeletingWorkoutId(workout.id);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { data: exerciseData, error: exerciseLoadError } = await supabase
      .from('program_exercises')
      .select('id')
      .eq('workout_id', workout.id);

    if (exerciseLoadError) {
      setError(exerciseLoadError.message);
      setDeletingWorkoutId(null);
      return;
    }

    const exerciseIds = ((exerciseData ?? []) as ExerciseIdRecord[]).map((exercise) => exercise.id);

    if (exerciseIds.length > 0) {
      const { error: setDeleteError } = await supabase
        .from('program_sets')
        .delete()
        .in('exercise_id', exerciseIds);

      if (setDeleteError) {
        setError(setDeleteError.message);
        setDeletingWorkoutId(null);
        return;
      }
    }

    const { error: exerciseDeleteError } = await supabase
      .from('program_exercises')
      .delete()
      .eq('workout_id', workout.id);

    if (exerciseDeleteError) {
      setError(exerciseDeleteError.message);
      setDeletingWorkoutId(null);
      return;
    }

    const { error: workoutDeleteError } = await supabase
      .from('program_workouts')
      .delete()
      .eq('id', workout.id)
      .eq('client_id', clientId);

    if (workoutDeleteError) {
      setError(workoutDeleteError.message);
      setDeletingWorkoutId(null);
      return;
    }

    setWorkouts((current) => current.filter((currentWorkout) => currentWorkout.id !== workout.id));
    setMessage(`${workout.title} deleted from this client's programme.`);
    setDeletingWorkoutId(null);
  };

  const getOrCreateProgramId = async (supabase: ReturnType<typeof createClient>, goal: string) => {
    const existingProgram = programs.find((program) => program.title === programTitle.trim());
    if (existingProgram) return existingProgram.id;

    const { data: newProgram, error: programError } = await supabase.from('training_programs').insert({
      client_id: clientId,
      title: programTitle.trim(),
      goal,
      status: 'active',
      start_date: new Date().toISOString().slice(0, 10),
    }).select('id').single();

    if (programError || !newProgram) {
      throw new Error(programError?.message || 'Could not create programme.');
    }

    return (newProgram as { id: string }).id;
  };

  const createWorkoutFromTemplate = async ({
    supabase,
    programId,
    template,
    workoutOrder,
    workoutTitle,
    scheduledDate,
    instructions,
    prescription,
  }: {
    supabase: ReturnType<typeof createClient>;
    programId: string;
    template: WorkoutTemplate;
    workoutOrder: number;
    workoutTitle: string;
    scheduledDate: string | null;
    instructions: string;
    prescription?: PrescribedSetForm[][];
  }) => {
    const { data: workoutData, error: workoutError } = await supabase.from('program_workouts').insert({
      client_id: clientId,
      program_id: programId,
      title: workoutTitle,
      day_label: template.dayLabel,
      workout_order: workoutOrder,
      scheduled_date: scheduledDate,
      instructions,
      status: 'active',
    }).select('id').single();

    if (workoutError || !workoutData) {
      throw new Error(workoutError?.message || `Could not create ${workoutTitle}.`);
    }

    const workoutId = (workoutData as { id: string }).id;
    for (const [exerciseIndex, exercise] of template.exercises.entries()) {
      const { data: exerciseData, error: exerciseError } = await supabase.from('program_exercises').insert({
        workout_id: workoutId,
        exercise_order: exerciseIndex + 1,
        exercise_name: exercise.name,
        notes: exercise.notes || null,
      }).select('id').single();

      if (exerciseError || !exerciseData) {
        throw new Error(exerciseError?.message || `Workout created, but ${exercise.name} could not be added.`);
      }

      const exerciseId = (exerciseData as { id: string }).id;
      const setRows = exercise.sets.map((templateSet, setIndex) => {
        const overrideSet = prescription?.[exerciseIndex]?.[setIndex];
        return {
          exercise_id: exerciseId,
          set_order: setIndex + 1,
          target_reps: overrideSet?.reps?.trim() || templateSet.reps || null,
          target_weight_kg: overrideSet ? numberOrNull(overrideSet.weightKg) : templateSet.weightKg ?? null,
          target_rpe: overrideSet ? numberOrNull(overrideSet.rpe) : templateSet.rpe ?? null,
          target_rir: null,
          notes: overrideSet?.notes?.trim() || templateSet.notes || null,
        };
      });

      const { error: setsError } = await supabase.from('program_sets').insert(setRows);
      if (setsError) throw new Error(setsError.message);
    }
  };

  const assignProgrammeTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSupabaseConfigured) return;
    if (!programTitle.trim()) {
      setError('Programme title is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = createClient();
      const programId = await getOrCreateProgramId(supabase, selectedProgrammeTemplate.goal);
      const { count } = await supabase.from('program_workouts').select('id', { count: 'exact', head: true }).eq('program_id', programId);
      const startingOrder = count ?? 0;

      for (const [index, template] of selectedProgrammeWorkouts.entries()) {
        await createWorkoutFromTemplate({
          supabase,
          programId,
          template,
          workoutOrder: startingOrder + index + 1,
          workoutTitle: template.defaultWorkoutTitle,
          scheduledDate: null,
          instructions: template.instructions,
        });
      }

      setMessage(`${selectedProgrammeTemplate.name} assigned. Workouts are unscheduled so they can be mapped to the client's availability.`);
      setSaving(false);
      setLoading(true);
      await loadPage();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not assign programme template.');
      setSaving(false);
    }
  };

  const assignSingleWorkoutTemplate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSupabaseConfigured) return;
    if (!programTitle.trim() || !singleWorkoutTitle.trim()) {
      setError('Programme title and workout title are required.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = createClient();
      const programId = await getOrCreateProgramId(supabase, selectedWorkoutTemplate.goal);
      const { count } = await supabase.from('program_workouts').select('id', { count: 'exact', head: true }).eq('program_id', programId);

      await createWorkoutFromTemplate({
        supabase,
        programId,
        template: selectedWorkoutTemplate,
        workoutOrder: (count ?? 0) + 1,
        workoutTitle: singleWorkoutTitle.trim(),
        scheduledDate: singleScheduledDate || null,
        instructions: singleInstructions.trim() || selectedWorkoutTemplate.instructions,
        prescription: singlePrescription,
      });

      setMessage('Single workout template assigned with prescribed reps, KG and target RPE.');
      setSaving(false);
      setLoading(true);
      await loadPage();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not assign workout template.');
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 md:p-8"><Card>Loading client programme...</Card></div>;
  if (error && !client) return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Client Program</h1>
          <p className="mt-1 text-sm text-gray-600">{client?.full_name}{client?.email ? ` • ${client.email}` : ''}</p>
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">Programme templates create full splits. Workout templates create one reusable session.</p>
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
        <SectionHeader title="ASSIGN FROM TEMPLATE" accent />
        <Card className="space-y-6">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <button type="button" onClick={() => setAssignmentMode('programme')} className={`rounded-xl border p-4 text-left ${assignmentMode === 'programme' ? 'border-[#FA0201] bg-red-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
              <p className="text-sm font-black uppercase text-[#000000]">Programme template</p>
              <p className="mt-1 text-xs font-semibold text-gray-600">Creates a full split made from multiple workout templates.</p>
            </button>
            <button type="button" onClick={() => setAssignmentMode('workout')} className={`rounded-xl border p-4 text-left ${assignmentMode === 'workout' ? 'border-[#FA0201] bg-red-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
              <p className="text-sm font-black uppercase text-[#000000]">Single workout template</p>
              <p className="mt-1 text-xs font-semibold text-gray-600">Creates one session. Useful for adding or replacing one day.</p>
            </button>
          </div>

          {assignmentMode === 'programme' ? (
            <form onSubmit={assignProgrammeTemplate} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold uppercase">Programme template</label>
                  <select value={programmeTemplateId} onChange={(event) => chooseProgrammeTemplate(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black">
                    {programmeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                </div>
                <Input label="Programme title" value={programTitle} onChange={(event) => setProgramTitle(event.target.value)} required />
              </div>

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge variant="default">{selectedProgrammeTemplate.category}</Badge>
                  <p className="text-sm font-bold uppercase text-[#000000]">{selectedProgrammeTemplate.name}</p>
                </div>
                <p className="text-sm text-gray-700">{selectedProgrammeTemplate.description}</p>
                <p className="mt-2 text-xs font-bold uppercase text-gray-500">Creates {selectedProgrammeWorkouts.length} workout{selectedProgrammeWorkouts.length === 1 ? '' : 's'} unscheduled for later mapping to client availability.</p>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {selectedProgrammeWorkouts.map((template, index) => (
                  <div key={`${template.id}-${index}`} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="default">Workout {index + 1}</Badge>
                      <Badge variant="warning">{template.category}</Badge>
                    </div>
                    <p className="mt-3 text-lg font-black uppercase text-[#000000]">{template.defaultWorkoutTitle}</p>
                    <p className="mt-1 text-xs font-semibold text-gray-600">{template.goal}</p>
                    <div className="mt-4 space-y-3">
                      {template.exercises.map((exercise) => (
                        <div key={`${template.id}-${exercise.name}`} className="rounded-lg bg-gray-50 p-3">
                          <p className="text-xs font-black uppercase text-[#000000]">{exercise.name}</p>
                          <p className="mt-1 text-xs text-gray-600">{exercise.sets.map(getSetLabel).join(' / ')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <Button type="submit" isLoading={saving} className="bg-[#FA0201] hover:bg-red-700">Assign programme split</Button>
            </form>
          ) : (
            <form onSubmit={assignSingleWorkoutTemplate} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold uppercase">Workout template</label>
                  <select value={workoutTemplateId} onChange={(event) => chooseWorkoutTemplate(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black">
                    {workoutTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                </div>
                <Input label="Scheduled date" type="date" value={singleScheduledDate} onChange={(event) => setSingleScheduledDate(event.target.value)} />
                <Input label="Programme title" value={programTitle} onChange={(event) => setProgramTitle(event.target.value)} required />
                <Input label="Workout title" value={singleWorkoutTitle} onChange={(event) => setSingleWorkoutTitle(event.target.value)} required />
              </div>
              <Textarea label="Client-facing instructions" value={singleInstructions} onChange={(event) => setSingleInstructions(event.target.value)} />

              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge variant="default">{selectedWorkoutTemplate.category}</Badge>
                  <p className="text-sm font-bold uppercase text-[#000000]">{selectedWorkoutTemplate.name}</p>
                </div>
                <p className="mb-4 text-sm text-gray-700">{selectedWorkoutTemplate.goal}</p>
                <div className="space-y-4">
                  {selectedWorkoutTemplate.exercises.map((exercise, exerciseIndex) => (
                    <div key={`${exercise.name}-${exerciseIndex}`} className="rounded-lg bg-white p-4">
                      <p className="text-sm font-bold uppercase text-[#000000]">{exerciseIndex + 1}. {exercise.name}</p>
                      <div className="mt-3 space-y-3">
                        {(singlePrescription[exerciseIndex] || []).map((set, setIndex) => (
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
              <Button type="submit" isLoading={saving} className="bg-[#FA0201] hover:bg-red-700">Assign single workout</Button>
            </form>
          )}
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
                const locked = status === 'completed';
                const program = programById[workout.program_id];
                return (
                  <div key={workout.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase text-gray-500">{program?.title || 'Programme'}</p>
                        <p className="mt-1 text-lg font-bold uppercase text-[#000000]">{workout.title}</p>
                        <p className="mt-1 text-sm text-gray-600">Scheduled: {formatDate(workout.scheduled_date)} • Exercises: {exerciseCounts[workout.id] || 0}</p>
                        {locked && <p className="mt-2 text-xs font-semibold uppercase text-gray-500">Completed workouts are locked as history.</p>}
                      </div>
                      <div className="flex flex-col gap-2 md:items-end">
                        <Badge variant={statusVariant(status) as any}>{status}</Badge>
                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <Link href={`/coach/clients/${clientId}/current-workouts/${workout.id}/edit`} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50">Edit</Link>
                          {!locked && (
                            <button
                              type="button"
                              onClick={() => deleteWorkout(workout)}
                              disabled={deletingWorkoutId === workout.id}
                              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold uppercase text-[#FA0201] hover:bg-red-100 disabled:opacity-60"
                            >
                              {deletingWorkoutId === workout.id ? 'Deleting...' : 'Delete'}
                            </button>
                          )}
                        </div>
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
