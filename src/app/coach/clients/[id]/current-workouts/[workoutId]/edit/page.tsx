'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ExerciseRole = 'main_lift' | 'accessory';
type NumericValue = number | string | null;

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

type ExerciseRecord = {
  id: string;
  exercise_order: number;
  exercise_name: string;
  notes: string | null;
  exercise_catalogue_id: string | null;
  exercise_role: ExerciseRole | null;
};

type ProgramSetRecord = {
  id: string;
  exercise_id: string;
  set_order: number;
  target_reps: string | null;
  target_weight_kg: number | null;
  target_percent_1rm: number | null;
  notes: string | null;
};

type WeeklyTargetPreviewRecord = {
  program_set_id: string;
  exercise_id: string;
  week_number: number;
  exercise_name: string;
  set_order: number;
  target_definition_source: 'weekly_target' | 'base_program_set' | string;
  target_reps: string | null;
  target_percent_1rm: NumericValue;
  target_weight_kg: NumericValue;
  target_rpe: NumericValue;
  target_rir: NumericValue;
  calculated_target_weight_kg: NumericValue;
  effective_target_weight_kg: NumericValue;
  target_load_source: 'coach_override' | 'calculated_from_percent_1rm' | 'missing_calibration' | 'not_percent_based' | string;
  notes: string | null;
};

type WeeklyTargetForm = {
  targetReps: string;
  targetPercent1Rm: string;
  targetWeightKg: string;
  targetRpe: string;
  targetRir: string;
  notes: string;
};

type ExerciseCatalogueRecord = {
  id: string;
  name: string;
  category: string;
  movement_pattern: string | null;
  equipment: string | null;
  primary_muscles: string[];
  default_notes: string | null;
};

type SetForm = {
  targetReps: string;
  targetWeightKg: string;
  targetPercent1Rm: string;
  notes: string;
};

type ExerciseForm = {
  exerciseId: string | null;
  exerciseName: string;
  exerciseCatalogueId: string | null;
  exerciseRole: ExerciseRole;
  notes: string;
  sets: SetForm[];
};

type ExerciseSelectorFilter = {
  open: boolean;
  search: string;
  muscle: string;
  equipment: string;
};

type NewExerciseDraft = {
  open: boolean;
  name: string;
  equipment: string;
  muscles: string;
  notes: string;
};

const blankSet = (): SetForm => ({ targetReps: '', targetWeightKg: '', targetPercent1Rm: '', notes: '' });

const blankExercise = (): ExerciseForm => ({
  exerciseId: null,
  exerciseName: '',
  exerciseCatalogueId: null,
  exerciseRole: 'accessory',
  notes: '',
  sets: [blankSet(), blankSet(), blankSet()],
});

const blankFilter = (): ExerciseSelectorFilter => ({ open: false, search: '', muscle: '', equipment: '' });

const blankNewExerciseDraft = (): NewExerciseDraft => ({ open: false, name: '', equipment: '', muscles: '', notes: '' });

const numberOrNull = (value: string) => (value.trim() ? Number(value) : null);
const textOrNull = (value: string) => value.trim() || null;
const parseMuscles = (value: string) => value.split(',').map((muscle) => muscle.trim()).filter(Boolean);
const getRoleLabel = (role: ExerciseRole) => role === 'main_lift' ? 'Main / Key Lift' : 'Accessory';
const getRoleBadgeVariant = (role: ExerciseRole) => role === 'main_lift' ? 'success' : 'default';

const valueToInput = (value: NumericValue | string | null | undefined) => {
  if (value === null || value === undefined || value === '') return '';
  return String(value);
};

const formatNumericValue = (value: NumericValue) => {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(1);
};

const formatPercent = (value: NumericValue) => {
  const formatted = formatNumericValue(value);
  return formatted === '—' ? formatted : `${formatted}%`;
};

const formatKg = (value: NumericValue) => {
  const formatted = formatNumericValue(value);
  return formatted === '—' ? formatted : `${formatted}kg`;
};

const getTargetSourceLabel = (source: string) => {
  if (source === 'weekly_target') return 'Weekly target';
  if (source === 'base_program_set') return 'Base fallback';
  return source.replaceAll('_', ' ');
};

const getLoadSourceLabel = (source: string) => {
  if (source === 'coach_override') return 'Coach override';
  if (source === 'calculated_from_percent_1rm') return 'Calculated';
  if (source === 'missing_calibration') return 'Missing calibration';
  if (source === 'not_percent_based') return 'Not % based';
  return source.replaceAll('_', ' ');
};

const getWeeklyTargetFormKey = (programSetId: string, weekNumber: number) => `${programSetId}:${weekNumber}`;

const targetToForm = (target: WeeklyTargetPreviewRecord): WeeklyTargetForm => ({
  targetReps: target.target_reps || '',
  targetPercent1Rm: valueToInput(target.target_percent_1rm),
  targetWeightKg: valueToInput(target.target_weight_kg),
  targetRpe: valueToInput(target.target_rpe),
  targetRir: valueToInput(target.target_rir),
  notes: target.notes || '',
});

export default function EditAssignedWorkoutPage() {
  const params = useParams();
  const clientId = params.id as string;
  const workoutId = params.workoutId as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workout, setWorkout] = useState<WorkoutRecord | null>(null);
  const [workoutTitle, setWorkoutTitle] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [exercises, setExercises] = useState<ExerciseForm[]>([]);
  const [exerciseCatalogue, setExerciseCatalogue] = useState<ExerciseCatalogueRecord[]>([]);
  const [selectorFilters, setSelectorFilters] = useState<Record<number, ExerciseSelectorFilter>>({});
  const [newExerciseDrafts, setNewExerciseDrafts] = useState<Record<number, NewExerciseDraft>>({});
  const [addingExerciseIndex, setAddingExerciseIndex] = useState<number | null>(null);
  const [originalExerciseIds, setOriginalExerciseIds] = useState<string[]>([]);
  const [weeklyTargetPreviewRows, setWeeklyTargetPreviewRows] = useState<WeeklyTargetPreviewRecord[]>([]);
  const [weeklyTargetForms, setWeeklyTargetForms] = useState<Record<string, WeeklyTargetForm>>({});
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingWeeklyTargets, setSavingWeeklyTargets] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const catalogueById = useMemo(() => {
    return exerciseCatalogue.reduce<Record<string, ExerciseCatalogueRecord>>((acc, exercise) => {
      acc[exercise.id] = exercise;
      return acc;
    }, {});
  }, [exerciseCatalogue]);

  const muscleOptions = useMemo(() => {
    return Array.from(new Set(exerciseCatalogue.flatMap((exercise) => exercise.primary_muscles || []))).sort((a, b) => a.localeCompare(b));
  }, [exerciseCatalogue]);

  const equipmentOptions = useMemo(() => {
    return Array.from(new Set(exerciseCatalogue.map((exercise) => exercise.equipment || 'Unassigned'))).sort((a, b) => a.localeCompare(b));
  }, [exerciseCatalogue]);

  const availableWeekNumbers = useMemo(() => {
    const weeks = Array.from(new Set(weeklyTargetPreviewRows.map((row) => row.week_number)))
      .filter((weekNumber) => Number.isFinite(weekNumber))
      .sort((a, b) => a - b);

    return weeks.length > 0 ? weeks : Array.from({ length: 12 }, (_, index) => index + 1);
  }, [weeklyTargetPreviewRows]);

  const weeklyTargetsByExerciseId = useMemo(() => {
    return weeklyTargetPreviewRows
      .filter((row) => row.week_number === selectedWeek)
      .reduce<Record<string, WeeklyTargetPreviewRecord[]>>((acc, row) => {
        if (!acc[row.exercise_id]) acc[row.exercise_id] = [];
        acc[row.exercise_id].push(row);
        acc[row.exercise_id].sort((a, b) => a.set_order - b.set_order);
        return acc;
      }, {});
  }, [selectedWeek, weeklyTargetPreviewRows]);

  const getWeeklyTargetForm = (target: WeeklyTargetPreviewRecord) => {
    return weeklyTargetForms[getWeeklyTargetFormKey(target.program_set_id, target.week_number)] || targetToForm(target);
  };

  const loadWorkout = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const [clientResult, workoutResult, sessionResult, catalogueResult] = await Promise.all([
      supabase.from('clients').select('id, full_name, email').eq('id', clientId).single(),
      supabase
        .from('program_workouts')
        .select('id, title, client_id, program_id, scheduled_date, status')
        .eq('id', workoutId)
        .eq('client_id', clientId)
        .single(),
      supabase.from('workout_sessions').select('id').eq('program_workout_id', workoutId).eq('status', 'completed').limit(1),
      supabase
        .from('exercise_catalogue')
        .select('id, name, category, movement_pattern, equipment, primary_muscles, default_notes')
        .eq('is_active', true)
        .order('name', { ascending: true }),
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

    if (sessionResult.error || catalogueResult.error) {
      setError(sessionResult.error?.message || catalogueResult.error?.message || 'Could not load workout editor.');
      setLoading(false);
      return;
    }

    const loadedWorkout = workoutResult.data as WorkoutRecord;
    const completedSessions = (sessionResult.data ?? []) as SessionRecord[];
    const locked = loadedWorkout.status === 'completed' || completedSessions.length > 0;

    const { data: exerciseData, error: exerciseError } = await supabase
      .from('program_exercises')
      .select('id, exercise_order, exercise_name, notes, exercise_catalogue_id, exercise_role')
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
          .select('id, exercise_id, set_order, target_reps, target_weight_kg, target_percent_1rm, notes')
          .in('exercise_id', exerciseIds)
          .order('set_order', { ascending: true })
      : { data: [], error: null };

    if (setError) {
      setError(setError.message);
      setLoading(false);
      return;
    }

    const { data: weeklyTargetData, error: weeklyTargetError } = await supabase
      .from('program_set_calculated_targets')
      .select('program_set_id, exercise_id, week_number, exercise_name, set_order, target_definition_source, target_reps, target_percent_1rm, target_weight_kg, target_rpe, target_rir, calculated_target_weight_kg, effective_target_weight_kg, target_load_source, notes')
      .eq('workout_id', workoutId)
      .order('week_number', { ascending: true })
      .order('exercise_name', { ascending: true })
      .order('set_order', { ascending: true });

    if (weeklyTargetError) {
      setError(weeklyTargetError.message);
      setLoading(false);
      return;
    }

    const loadedSets = (setData ?? []) as ProgramSetRecord[];
    const formExercises = loadedExercises.map((exercise) => ({
      exerciseId: exercise.id,
      exerciseName: exercise.exercise_name,
      exerciseCatalogueId: exercise.exercise_catalogue_id,
      exerciseRole: exercise.exercise_role || 'accessory',
      notes: exercise.notes || '',
      sets: loadedSets
        .filter((set) => set.exercise_id === exercise.id)
        .sort((a, b) => a.set_order - b.set_order)
        .map((set) => ({
          targetReps: set.target_reps || '',
          targetWeightKg: set.target_weight_kg?.toString() || '',
          targetPercent1Rm: set.target_percent_1rm?.toString() || '',
          notes: set.notes || '',
        })),
    }));

    const loadedWeeklyTargets = (weeklyTargetData ?? []) as WeeklyTargetPreviewRecord[];
    const loadedWeeklyForms = loadedWeeklyTargets.reduce<Record<string, WeeklyTargetForm>>((acc, target) => {
      acc[getWeeklyTargetFormKey(target.program_set_id, target.week_number)] = targetToForm(target);
      return acc;
    }, {});

    setClient(clientResult.data as ClientRecord);
    setWorkout(loadedWorkout);
    setWorkoutTitle(loadedWorkout.title);
    setScheduledDate(loadedWorkout.scheduled_date || '');
    setExerciseCatalogue((catalogueResult.data ?? []) as ExerciseCatalogueRecord[]);
    setWeeklyTargetPreviewRows(loadedWeeklyTargets);
    setWeeklyTargetForms(loadedWeeklyForms);
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

  const updateSelectorFilter = (index: number, updates: Partial<ExerciseSelectorFilter>) => {
    setSelectorFilters((current) => ({
      ...current,
      [index]: { ...(current[index] || blankFilter()), ...updates },
    }));
  };

  const updateNewExerciseDraft = (index: number, updates: Partial<NewExerciseDraft>) => {
    setNewExerciseDrafts((current) => ({
      ...current,
      [index]: { ...(current[index] || blankNewExerciseDraft()), ...updates },
    }));
  };

  const updateWeeklyTargetForm = (target: WeeklyTargetPreviewRecord, updates: Partial<WeeklyTargetForm>) => {
    const key = getWeeklyTargetFormKey(target.program_set_id, target.week_number);
    setWeeklyTargetForms((current) => ({
      ...current,
      [key]: {
        ...(current[key] || targetToForm(target)),
        ...updates,
      },
    }));
  };

  const chooseExerciseFromLibrary = (exerciseIndex: number, catalogueExercise: ExerciseCatalogueRecord) => {
    updateExercise(exerciseIndex, {
      exerciseName: catalogueExercise.name,
      exerciseCatalogueId: catalogueExercise.id,
      notes: catalogueExercise.default_notes || exercises[exerciseIndex]?.notes || '',
    });
    updateSelectorFilter(exerciseIndex, { open: false, search: '' });
  };

  const addExerciseToLibrary = async (exerciseIndex: number) => {
    if (!isSupabaseConfigured) return;

    const draft = newExerciseDrafts[exerciseIndex] || blankNewExerciseDraft();
    const exerciseName = draft.name.trim();
    const muscles = parseMuscles(draft.muscles);

    if (!exerciseName) {
      setError('Exercise name is required.');
      return;
    }

    if (muscles.length === 0) {
      setError('Add at least one muscle group, separated by commas if needed.');
      return;
    }

    setAddingExerciseIndex(exerciseIndex);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from('exercise_catalogue')
      .insert({
        name: exerciseName,
        category: 'Custom',
        movement_pattern: null,
        equipment: textOrNull(draft.equipment),
        primary_muscles: muscles,
        default_notes: textOrNull(draft.notes),
        is_active: true,
      })
      .select('id, name, category, movement_pattern, equipment, primary_muscles, default_notes')
      .single();

    if (insertError || !data) {
      setError(insertError?.message || 'Could not add exercise to library.');
      setAddingExerciseIndex(null);
      return;
    }

    const createdExercise = data as ExerciseCatalogueRecord;
    setExerciseCatalogue((current) => [...current, createdExercise].sort((a, b) => a.name.localeCompare(b.name)));
    chooseExerciseFromLibrary(exerciseIndex, createdExercise);
    updateNewExerciseDraft(exerciseIndex, blankNewExerciseDraft());
    setMessage(`${createdExercise.name} added to the Exercise Library and selected for this workout.`);
    setAddingExerciseIndex(null);
  };

  const getFilteredCatalogue = (exerciseIndex: number) => {
    const filter = selectorFilters[exerciseIndex] || blankFilter();
    const search = filter.search.trim().toLowerCase();

    return exerciseCatalogue.filter((exercise) => {
      const matchesSearch = !search || exercise.name.toLowerCase().includes(search);
      const matchesMuscle = !filter.muscle || (exercise.primary_muscles || []).includes(filter.muscle);
      const matchesEquipment = !filter.equipment || (exercise.equipment || 'Unassigned') === filter.equipment;
      return matchesSearch && matchesMuscle && matchesEquipment;
    });
  };

  const removeExercise = (index: number) => {
    setExercises((current) => current.filter((_, i) => i !== index));
    setSelectorFilters((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    setNewExerciseDrafts((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
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

  const addSet = (exerciseIndex: number) => {
    setExercises((current) => current.map((exercise, i) => {
      if (i !== exerciseIndex) return exercise;
      const previousSet = exercise.sets[exercise.sets.length - 1] || blankSet();
      return { ...exercise, sets: [...exercise.sets, { ...previousSet }] };
    }));
  };

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    setExercises((current) => current.map((exercise, i) => {
      if (i !== exerciseIndex) return exercise;
      return { ...exercise, sets: exercise.sets.filter((_, j) => j !== setIndex) };
    }));
  };

  const saveWeeklyTargetsForSelectedWeek = async () => {
    if (!workout || !isSupabaseConfigured) return;

    const mainLiftExerciseIds = new Set(
      exercises
        .filter((exercise) => exercise.exerciseRole === 'main_lift' && exercise.exerciseId)
        .map((exercise) => exercise.exerciseId as string)
    );

    const targetsToSave = weeklyTargetPreviewRows
      .filter((target) => target.week_number === selectedWeek && mainLiftExerciseIds.has(target.exercise_id))
      .map((target) => {
        const form = getWeeklyTargetForm(target);
        return {
          program_id: workout.program_id,
          program_set_id: target.program_set_id,
          week_number: selectedWeek,
          target_reps: textOrNull(form.targetReps),
          target_percent_1rm: numberOrNull(form.targetPercent1Rm),
          target_weight_kg: numberOrNull(form.targetWeightKg),
          target_rpe: numberOrNull(form.targetRpe),
          target_rir: numberOrNull(form.targetRir),
          notes: textOrNull(form.notes),
        };
      });

    if (targetsToSave.length === 0) {
      setError('No Main / Key Lift weekly targets are available for this selected week.');
      return;
    }

    setSavingWeeklyTargets(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: upsertError } = await supabase
      .from('program_set_weekly_targets')
      .upsert(targetsToSave, { onConflict: 'program_set_id,week_number' });

    if (upsertError) {
      setError(upsertError.message);
      setSavingWeeklyTargets(false);
      return;
    }

    setMessage(`Week ${selectedWeek} weekly targets saved.`);
    setSavingWeeklyTargets(false);
    await loadWorkout();
  };

  const saveWorkout = async (event: FormEvent<HTMLFormElement>) => {
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

    const validExercises = exercises.filter((exercise) => exercise.exerciseName.trim() || exercise.exerciseCatalogueId);
    if (validExercises.length === 0) {
      setError('Add at least one exercise.');
      return;
    }

    const unlinkedExercise = validExercises.find((exercise) => !exercise.exerciseCatalogueId || !catalogueById[exercise.exerciseCatalogueId]);
    if (unlinkedExercise) {
      setError('Every exercise must be selected from the Exercise Library so client graphs stay consistent. Use the searchable dropdown or add the exercise to the library first.');
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
      const { error: deleteSetsError } = await supabase.from('program_sets').delete().in('exercise_id', originalExerciseIds);
      if (deleteSetsError) {
        setError(deleteSetsError.message);
        setSaving(false);
        return;
      }

      const { error: deleteExercisesError } = await supabase.from('program_exercises').delete().in('id', originalExerciseIds);
      if (deleteExercisesError) {
        setError(deleteExercisesError.message);
        setSaving(false);
        return;
      }
    }

    const newExerciseIds: string[] = [];
    for (const [exerciseIndex, exercise] of validExercises.entries()) {
      const linkedCatalogueExercise = catalogueById[exercise.exerciseCatalogueId as string];

      const { data: exerciseData, error: exerciseError } = await supabase
        .from('program_exercises')
        .insert({
          workout_id: workout.id,
          exercise_order: exerciseIndex + 1,
          exercise_name: linkedCatalogueExercise.name,
          exercise_catalogue_id: linkedCatalogueExercise.id,
          exercise_role: exercise.exerciseRole,
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
        target_percent_1rm: numberOrNull(set.targetPercent1Rm),
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
    setMessage('Workout updated. Exercise roles, %1RM targets and DB links are saved for progression logic.');
    setSaving(false);
  };

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading workout editor...</Card></div>;
  }

  if (error && !workout) {
    return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;
  }

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Edit workout</h1>
          <p className="mt-1 text-sm text-gray-600">{client?.full_name} • {workout?.title}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href={`/coach/clients/${clientId}/current-workouts`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to current workouts</Link>
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
        </div>
      </div>

      {isLocked && (
        <Card className="border-2 border-yellow-200 bg-yellow-50">
          <Badge variant="warning">Base workout locked</Badge>
          <p className="mt-2 text-sm font-semibold text-yellow-800">
            The base workout structure is locked because the client has completed it. Weekly targets can still be edited for future progression.
          </p>
        </Card>
      )}

      {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      <section>
        <SectionHeader title="WORKOUT DETAILS" accent />
        <Card>
          <form onSubmit={saveWorkout} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input label="Workout title" value={workoutTitle} onChange={(e) => setWorkoutTitle(e.target.value)} required disabled={isLocked} />
              <Input label="Scheduled date" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} disabled={isLocked} />
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-black uppercase tracking-wide text-blue-900">Exercise names and roles are graph-linked</p>
              <p className="mt-1 text-sm font-semibold text-blue-800">
                Choose exercises from the Exercise Library dropdown and classify them as Main / Key Lift or Accessory. Main lifts drive calibration, %1RM planning and calculated loads.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Weekly progression editor</p>
                  <p className="mt-1 text-sm font-semibold text-gray-700">
                    Select a week, edit the Main / Key Lift set targets, then save weekly targets separately from the base workout structure.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="block min-w-40">
                    <span className="mb-2 block text-sm font-semibold uppercase">Week</span>
                    <select
                      value={selectedWeek}
                      onChange={(event) => setSelectedWeek(Number(event.target.value))}
                      className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black"
                    >
                      {availableWeekNumbers.map((weekNumber) => (
                        <option key={weekNumber} value={weekNumber}>Week {weekNumber}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={savingWeeklyTargets}
                    onClick={saveWeeklyTargetsForSelectedWeek}
                    className="rounded-lg bg-[#FA0201] px-4 py-3 text-xs font-black uppercase text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {savingWeeklyTargets ? 'Saving weekly targets...' : `Save Week ${selectedWeek} targets`}
                  </button>
                </div>
              </div>
            </div>

            {exercises.map((exercise, exerciseIndex) => {
              const linkedExercise = exercise.exerciseCatalogueId ? catalogueById[exercise.exerciseCatalogueId] : null;
              const filter = selectorFilters[exerciseIndex] || blankFilter();
              const filteredCatalogue = getFilteredCatalogue(exerciseIndex);
              const newExerciseDraft = newExerciseDrafts[exerciseIndex] || blankNewExerciseDraft();
              const weeklyTargetsForExercise = exercise.exerciseId ? weeklyTargetsByExerciseId[exercise.exerciseId] || [] : [];

              return (
                <div key={exerciseIndex} className="space-y-4 rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold uppercase text-[#000000]">Exercise {exerciseIndex + 1}</p>
                        <Badge variant={getRoleBadgeVariant(exercise.exerciseRole)}>{getRoleLabel(exercise.exerciseRole)}</Badge>
                      </div>
                      <p className="mt-1 text-xs font-semibold uppercase text-gray-500">
                        {linkedExercise ? `Linked to DB: ${linkedExercise.name}` : 'Not linked yet'}
                      </p>
                    </div>
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => removeExercise(exerciseIndex)}
                        className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-black uppercase text-[#FA0201] hover:bg-red-50"
                      >
                        <span aria-hidden="true">🗑</span>
                        Delete exercise
                      </button>
                    )}
                  </div>

                  <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_0.24fr_auto] lg:items-end">
                      <Input
                        label="Exercise"
                        value={exercise.exerciseName || 'Select from Exercise Library'}
                        readOnly
                        placeholder="Select from Exercise Library"
                        disabled={isLocked}
                      />
                      <label className="block">
                        <span className="mb-2 block text-sm font-semibold uppercase">Role</span>
                        <select
                          value={exercise.exerciseRole}
                          onChange={(e) => updateExercise(exerciseIndex, { exerciseRole: e.target.value as ExerciseRole })}
                          disabled={isLocked}
                          className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black disabled:opacity-60"
                        >
                          <option value="accessory">Accessory</option>
                          <option value="main_lift">Main / Key Lift</option>
                        </select>
                      </label>
                      {!isLocked && (
                        <button
                          type="button"
                          onClick={() => updateSelectorFilter(exerciseIndex, { open: !filter.open })}
                          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-100"
                        >
                          {filter.open ? 'Close dropdown ▲' : 'Search library ▼'}
                        </button>
                      )}
                    </div>

                    {linkedExercise && (
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase text-gray-500">
                        <Badge variant="default">DB linked</Badge>
                        <Badge variant="default">{linkedExercise.category}</Badge>
                        {linkedExercise.equipment && <Badge variant="warning">{linkedExercise.equipment}</Badge>}
                        {linkedExercise.primary_muscles?.length > 0 && <span>{linkedExercise.primary_muscles.join(', ')}</span>}
                      </div>
                    )}

                    {!isLocked && filter.open && (
                      <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                          <Input
                            label="Search exercises"
                            value={filter.search}
                            onChange={(e) => updateSelectorFilter(exerciseIndex, { search: e.target.value })}
                            placeholder="e.g. squat, bench, row"
                          />
                          <label className="block">
                            <span className="mb-2 block text-sm font-semibold uppercase">Muscle</span>
                            <select
                              value={filter.muscle}
                              onChange={(e) => updateSelectorFilter(exerciseIndex, { muscle: e.target.value })}
                              className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black"
                            >
                              <option value="">All muscles</option>
                              {muscleOptions.map((muscle) => <option key={muscle} value={muscle}>{muscle}</option>)}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-2 block text-sm font-semibold uppercase">Equipment</span>
                            <select
                              value={filter.equipment}
                              onChange={(e) => updateSelectorFilter(exerciseIndex, { equipment: e.target.value })}
                              className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black"
                            >
                              <option value="">All equipment</option>
                              {equipmentOptions.map((equipment) => <option key={equipment} value={equipment}>{equipment}</option>)}
                            </select>
                          </label>
                        </div>

                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <button
                            type="button"
                            onClick={() => updateNewExerciseDraft(exerciseIndex, { open: !newExerciseDraft.open })}
                            className="text-xs font-bold uppercase text-[#FA0201] hover:underline"
                          >
                            {newExerciseDraft.open ? 'Close add exercise' : 'Add missing exercise to library'}
                          </button>

                          {newExerciseDraft.open && (
                            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                              <Input
                                label="Exercise name"
                                value={newExerciseDraft.name}
                                onChange={(e) => updateNewExerciseDraft(exerciseIndex, { name: e.target.value })}
                                placeholder="e.g. Back Squat"
                              />
                              <Input
                                label="Equipment"
                                value={newExerciseDraft.equipment}
                                onChange={(e) => updateNewExerciseDraft(exerciseIndex, { equipment: e.target.value })}
                                placeholder="e.g. Barbell"
                              />
                              <Input
                                label="Muscles affected"
                                value={newExerciseDraft.muscles}
                                onChange={(e) => updateNewExerciseDraft(exerciseIndex, { muscles: e.target.value })}
                                placeholder="e.g. Quads, Glutes"
                              />
                              <Textarea
                                label="Default notes"
                                value={newExerciseDraft.notes}
                                onChange={(e) => updateNewExerciseDraft(exerciseIndex, { notes: e.target.value })}
                                placeholder="e.g. Controlled descent, stable brace."
                              />
                              <div className="md:col-span-2">
                                <Button
                                  type="button"
                                  disabled={addingExerciseIndex === exerciseIndex}
                                  onClick={() => addExerciseToLibrary(exerciseIndex)}
                                  className="bg-[#000000] hover:bg-gray-900"
                                >
                                  {addingExerciseIndex === exerciseIndex ? 'Adding...' : 'Add to DB and select'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                          {filteredCatalogue.length === 0 ? (
                            <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">No exercises match those filters.</p>
                          ) : (
                            filteredCatalogue.map((catalogueExercise) => (
                              <button
                                key={catalogueExercise.id}
                                type="button"
                                onClick={() => chooseExerciseFromLibrary(exerciseIndex, catalogueExercise)}
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-left hover:border-[#FA0201] hover:bg-red-50"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-black uppercase text-[#000000]">{catalogueExercise.name}</p>
                                  <Badge variant="default">DB exercise</Badge>
                                  <Badge variant="default">{catalogueExercise.category}</Badge>
                                  {catalogueExercise.equipment && <Badge variant="warning">{catalogueExercise.equipment}</Badge>}
                                </div>
                                <p className="mt-1 text-xs font-semibold text-gray-500">
                                  {(catalogueExercise.primary_muscles || []).join(', ') || 'No muscles set'}
                                </p>
                                {catalogueExercise.default_notes && <p className="mt-1 text-xs text-gray-500">{catalogueExercise.default_notes}</p>}
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <Textarea label="Exercise notes" value={exercise.notes} onChange={(e) => updateExercise(exerciseIndex, { notes: e.target.value })} disabled={isLocked} />

                  {exercise.exerciseRole === 'main_lift' && (
                    <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase text-[#FA0201]">Week {selectedWeek} progression editor</p>
                          <p className="mt-1 text-xs font-semibold text-red-900">
                            Edit week-specific targets here. Fixed kg overrides calculated %1RM loads. Leave kg blank to calculate from calibration.
                          </p>
                        </div>
                        <Badge variant="success">Calculated kg snaps to 2.5kg</Badge>
                      </div>

                      {weeklyTargetsForExercise.length === 0 ? (
                        <p className="mt-3 rounded-lg border border-red-100 bg-white p-3 text-sm font-semibold text-red-900">
                          No weekly target rows found for this exercise and week yet.
                        </p>
                      ) : (
                        <div className="mt-3 overflow-x-auto rounded-lg bg-white p-3">
                          <div className="grid min-w-[1180px] grid-cols-[70px_1fr_1fr_1fr_1fr_1fr_1fr_1.3fr_1.7fr] gap-3 px-1 pb-2 text-xs font-bold uppercase text-gray-600">
                            <p>Set</p>
                            <p>Source</p>
                            <p>Reps</p>
                            <p>%1RM</p>
                            <p>Kg override</p>
                            <p>RPE</p>
                            <p>RIR</p>
                            <p>Effective kg</p>
                            <p>Notes</p>
                          </div>
                          <div className="space-y-2">
                            {weeklyTargetsForExercise.map((target) => {
                              const form = getWeeklyTargetForm(target);
                              return (
                                <div key={`${target.week_number}-${target.exercise_id}-${target.set_order}`} className="grid min-w-[1180px] grid-cols-[70px_1fr_1fr_1fr_1fr_1fr_1fr_1.3fr_1.7fr] items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2 text-sm">
                                  <p className="font-black uppercase text-[#000000]">Set {target.set_order}</p>
                                  <Badge variant={target.target_definition_source === 'weekly_target' ? 'success' : 'default'}>{getTargetSourceLabel(target.target_definition_source)}</Badge>
                                  <Input value={form.targetReps} onChange={(event) => updateWeeklyTargetForm(target, { targetReps: event.target.value })} placeholder="5" />
                                  <Input type="number" step="0.5" value={form.targetPercent1Rm} onChange={(event) => updateWeeklyTargetForm(target, { targetPercent1Rm: event.target.value })} placeholder="75" />
                                  <Input type="number" step="2.5" value={form.targetWeightKg} onChange={(event) => updateWeeklyTargetForm(target, { targetWeightKg: event.target.value })} placeholder="blank = calc" />
                                  <Input type="number" step="0.5" value={form.targetRpe} onChange={(event) => updateWeeklyTargetForm(target, { targetRpe: event.target.value })} placeholder="8" />
                                  <Input type="number" step="0.5" value={form.targetRir} onChange={(event) => updateWeeklyTargetForm(target, { targetRir: event.target.value })} placeholder="2" />
                                  <div>
                                    <p className="font-black text-[#FA0201]">{formatKg(target.effective_target_weight_kg)}</p>
                                    <p className="mt-1 text-[10px] font-black uppercase text-gray-500">{getLoadSourceLabel(target.target_load_source)}</p>
                                  </div>
                                  <Input value={form.notes} onChange={(event) => updateWeeklyTargetForm(target, { notes: event.target.value })} placeholder="Optional" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-lg bg-gray-50 p-3">
                    <div className="grid min-w-[860px] grid-cols-[80px_1fr_1fr_1fr_2fr_48px] gap-3 px-1 pb-2 text-xs font-bold uppercase text-gray-600">
                      <div />
                      <p>Reps</p>
                      <p>%1RM</p>
                      <p>Kg</p>
                      <p>Notes</p>
                      <div />
                    </div>
                    <div className="space-y-3">
                      {exercise.sets.map((set, setIndex) => (
                        <div key={setIndex} className="grid min-w-[860px] grid-cols-[80px_1fr_1fr_1fr_2fr_48px] items-center gap-3">
                          <p className="text-sm font-bold uppercase text-[#000000]">Set {setIndex + 1}</p>
                          <Input value={set.targetReps} onChange={(e) => updateSet(exerciseIndex, setIndex, { targetReps: e.target.value })} placeholder="6-8" disabled={isLocked} />
                          <Input type="number" step="0.5" value={set.targetPercent1Rm} onChange={(e) => updateSet(exerciseIndex, setIndex, { targetPercent1Rm: e.target.value })} placeholder="75" disabled={isLocked} />
                          <Input type="number" step="2.5" value={set.targetWeightKg} onChange={(e) => updateSet(exerciseIndex, setIndex, { targetWeightKg: e.target.value })} disabled={isLocked} />
                          <Input value={set.notes} onChange={(e) => updateSet(exerciseIndex, setIndex, { notes: e.target.value })} disabled={isLocked} />
                          {!isLocked && exercise.sets.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Delete set ${setIndex + 1}`}
                              onClick={() => removeSet(exerciseIndex, setIndex)}
                              className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-sm font-black text-[#FA0201] hover:bg-red-50"
                            >
                              🗑
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {!isLocked && (
                      <button
                        type="button"
                        onClick={() => addSet(exerciseIndex)}
                        className="mt-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50"
                      >
                        Add set
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-black uppercase text-amber-900">Base workout save</p>
              <p className="mt-1 text-sm font-semibold text-amber-800">
                Save changes updates the base workout structure only. Use Save Week {selectedWeek} targets for week-specific progression.
              </p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              {!isLocked && <Button type="button" variant="outline" onClick={() => setExercises((current) => [...current, blankExercise()])}>Add exercise</Button>}
              <Button type="submit" variant="primary" isLoading={saving} className="bg-[#FA0201] hover:bg-red-700" disabled={isLocked || saving}>Save base workout changes</Button>
            </div>
          </form>
        </Card>
      </section>
    </div>
  );
}
