'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type LibraryTab = 'exercises' | 'workouts' | 'programmes' | 'equipment';

type EquipmentType = {
  id: string;
  name: string;
  default_increment_kg: number | null;
  increment_unit: 'total' | 'per_hand' | 'per_side' | 'none';
  progression_mode: 'load' | 'double_progression' | 'rep_first' | 'manual';
  notes: string | null;
};

type ExerciseCatalogueItem = {
  id: string;
  name: string;
  category: string;
  movement_pattern: string | null;
  equipment: string | null;
  equipment_type_id: string | null;
  primary_muscles: string[];
  default_notes: string | null;
};

type LibraryWorkout = {
  id: string;
  name: string;
  category: string;
  goal: string | null;
  instructions: string | null;
};

type LibraryExercise = {
  id: string;
  library_workout_id: string;
  exercise_name: string;
  exercise_order: number;
  notes: string | null;
};

type LibrarySet = {
  id: string;
  library_workout_exercise_id: string;
  set_order: number;
  target_reps: string | null;
  target_rpe: number | null;
};

type LibraryProgramme = {
  id: string;
  name: string;
  category: string;
  goal: string | null;
  description: string | null;
};

type LibraryProgrammeWorkout = {
  id: string;
  library_programme_id: string;
  library_workout_id: string;
  workout_order: number;
  day_label: string | null;
};

const tabs: { label: string; value: LibraryTab }[] = [
  { label: 'Exercise Library', value: 'exercises' },
  { label: 'Workout Library', value: 'workouts' },
  { label: 'Programme Library', value: 'programmes' },
  { label: 'Equipment Defaults', value: 'equipment' },
];

const formatIncrement = (equipment: EquipmentType) => {
  if (!equipment.default_increment_kg || equipment.increment_unit === 'none') return 'Rep-first / no fixed load jump';
  const unitLabel = equipment.increment_unit.replace('_', ' ');
  return `+${equipment.default_increment_kg}kg ${unitLabel}`;
};

const getRepresentativeReps = (sets: LibrarySet[]) => {
  const firstSet = sets.find((set) => set.target_reps?.trim());
  return firstSet?.target_reps || '?';
};

const buildExerciseSummary = (exercise: LibraryExercise, sets: LibrarySet[]) => {
  return `${exercise.exercise_name} × ${sets.length || '?'} × ${getRepresentativeReps(sets)}`;
};

export default function CoachLibraryPage() {
  const [activeTab, setActiveTab] = useState<LibraryTab>('exercises');
  const [equipmentTypes, setEquipmentTypes] = useState<EquipmentType[]>([]);
  const [exerciseCatalogue, setExerciseCatalogue] = useState<ExerciseCatalogueItem[]>([]);
  const [workouts, setWorkouts] = useState<LibraryWorkout[]>([]);
  const [exercises, setExercises] = useState<LibraryExercise[]>([]);
  const [sets, setSets] = useState<LibrarySet[]>([]);
  const [programmes, setProgrammes] = useState<LibraryProgramme[]>([]);
  const [programmeWorkouts, setProgrammeWorkouts] = useState<LibraryProgrammeWorkout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLibrary = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const [equipmentResult, catalogueResult, workoutResult, programmeResult] = await Promise.all([
        supabase.from('equipment_types').select('id, name, default_increment_kg, increment_unit, progression_mode, notes').eq('is_active', true).order('name'),
        supabase.from('exercise_catalogue').select('id, name, category, movement_pattern, equipment, equipment_type_id, primary_muscles, default_notes').eq('is_active', true).order('category').order('name'),
        supabase.from('library_workouts').select('id, name, category, goal, instructions').eq('is_active', true).order('category').order('name'),
        supabase.from('library_programmes').select('id, name, category, goal, description').eq('is_active', true).order('category').order('name'),
      ]);

      if (equipmentResult.error || catalogueResult.error || workoutResult.error || programmeResult.error) {
        setError(equipmentResult.error?.message || catalogueResult.error?.message || workoutResult.error?.message || programmeResult.error?.message || 'Could not load library.');
        setLoading(false);
        return;
      }

      const loadedWorkouts = (workoutResult.data ?? []) as LibraryWorkout[];
      const loadedProgrammes = (programmeResult.data ?? []) as LibraryProgramme[];
      const workoutIds = loadedWorkouts.map((workout) => workout.id);
      const programmeIds = loadedProgrammes.map((programme) => programme.id);

      const [exerciseResult, programmeWorkoutResult] = await Promise.all([
        workoutIds.length
          ? supabase
              .from('library_workout_exercises')
              .select('id, library_workout_id, exercise_name, exercise_order, notes')
              .in('library_workout_id', workoutIds)
              .order('exercise_order')
          : { data: [], error: null },
        programmeIds.length
          ? supabase
              .from('library_programme_workouts')
              .select('id, library_programme_id, library_workout_id, workout_order, day_label')
              .in('library_programme_id', programmeIds)
              .order('workout_order')
          : { data: [], error: null },
      ]);

      if (exerciseResult.error || programmeWorkoutResult.error) {
        setError(exerciseResult.error?.message || programmeWorkoutResult.error?.message || 'Could not load library details.');
        setLoading(false);
        return;
      }

      const loadedExercises = (exerciseResult.data ?? []) as LibraryExercise[];
      const exerciseIds = loadedExercises.map((exercise) => exercise.id);
      const setResult = exerciseIds.length
        ? await supabase
            .from('library_workout_sets')
            .select('id, library_workout_exercise_id, set_order, target_reps, target_rpe')
            .in('library_workout_exercise_id', exerciseIds)
            .order('set_order')
        : { data: [], error: null };

      if (setResult.error) {
        setError(setResult.error.message);
        setLoading(false);
        return;
      }

      setEquipmentTypes((equipmentResult.data ?? []) as EquipmentType[]);
      setExerciseCatalogue((catalogueResult.data ?? []) as ExerciseCatalogueItem[]);
      setWorkouts(loadedWorkouts);
      setProgrammes(loadedProgrammes);
      setExercises(loadedExercises);
      setSets((setResult.data ?? []) as LibrarySet[]);
      setProgrammeWorkouts((programmeWorkoutResult.data ?? []) as LibraryProgrammeWorkout[]);
      setLoading(false);
    };

    loadLibrary();
  }, []);

  const exercisesByWorkout = useMemo(() => {
    return exercises.reduce<Record<string, LibraryExercise[]>>((acc, exercise) => {
      acc[exercise.library_workout_id] = [...(acc[exercise.library_workout_id] || []), exercise];
      return acc;
    }, {});
  }, [exercises]);

  const setsByExercise = useMemo(() => {
    return sets.reduce<Record<string, LibrarySet[]>>((acc, set) => {
      acc[set.library_workout_exercise_id] = [...(acc[set.library_workout_exercise_id] || []), set];
      return acc;
    }, {});
  }, [sets]);

  const workoutsById = useMemo(() => workouts.reduce<Record<string, LibraryWorkout>>((acc, workout) => ({ ...acc, [workout.id]: workout }), {}), [workouts]);

  const equipmentById = useMemo(() => equipmentTypes.reduce<Record<string, EquipmentType>>((acc, equipment) => ({ ...acc, [equipment.id]: equipment }), {}), [equipmentTypes]);

  const exerciseGroups = useMemo(() => {
    return exerciseCatalogue.reduce<Record<string, ExerciseCatalogueItem[]>>((acc, exercise) => {
      acc[exercise.category] = [...(acc[exercise.category] || []), exercise];
      return acc;
    }, {});
  }, [exerciseCatalogue]);

  const programmeWorkoutsByProgramme = useMemo(() => {
    return programmeWorkouts.reduce<Record<string, LibraryProgrammeWorkout[]>>((acc, item) => {
      acc[item.library_programme_id] = [...(acc[item.library_programme_id] || []), item];
      return acc;
    }, {});
  }, [programmeWorkouts]);

  return (
    <div className="space-y-8 p-6 md:p-8">
      <PageHeader
        title="LIBRARY"
        subtitle="Reusable exercises, workouts, programmes, and equipment-based progression defaults for RITMO coaching."
      />

      <Card>
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`rounded-lg px-4 py-2 text-sm font-bold uppercase transition-colors ${
                activeTab === tab.value ? 'bg-[#FA0201] text-white' : 'bg-gray-200 text-[#000000] hover:bg-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </Card>

      {loading && <Card>Loading library...</Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      {!loading && !error && activeTab === 'exercises' && (
        <section>
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <SectionHeader title="EXERCISE LIBRARY" accent />
            <Link href="/coach/exercise-catalogue">
              <Button type="button" className="bg-[#FA0201] hover:bg-red-700">Manage Exercise Library</Button>
            </Link>
          </div>
          <Card className="mb-4 border-2 border-gray-200 bg-gray-50">
            <p className="text-sm text-gray-700">
              This is the base exercise catalogue used when building workouts, assigning programmes and later generating analytics. Equipment type controls default progression jumps.
            </p>
          </Card>
          <div className="space-y-6">
            {Object.entries(exerciseGroups).map(([category, categoryExercises]) => (
              <div key={category}>
                <h2 className="mb-3 text-xl font-black uppercase text-[#000000]">{category}</h2>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {categoryExercises.map((exercise) => {
                    const equipment = exercise.equipment_type_id ? equipmentById[exercise.equipment_type_id] : null;
                    return (
                      <Card key={exercise.id}>
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-black uppercase text-[#000000]">{exercise.name}</h3>
                            <p className="mt-1 text-xs font-bold uppercase text-gray-500">{exercise.movement_pattern || 'No movement pattern'}</p>
                          </div>
                          <Badge variant="default">{equipment?.name || exercise.equipment || 'No equipment'}</Badge>
                        </div>
                        <div className="space-y-2 text-sm text-gray-700">
                          <p><span className="font-bold uppercase text-gray-500">Muscles:</span> {exercise.primary_muscles?.length ? exercise.primary_muscles.join(', ') : 'Not set'}</p>
                          <p><span className="font-bold uppercase text-gray-500">Progression:</span> {equipment ? formatIncrement(equipment) : 'Equipment default not linked yet'}</p>
                          {exercise.default_notes && <p><span className="font-bold uppercase text-gray-500">Notes:</span> {exercise.default_notes}</p>}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!loading && !error && activeTab === 'workouts' && (
        <section>
          <SectionHeader title="WORKOUT LIBRARY" accent />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {workouts.map((workout) => {
              const workoutExercises = (exercisesByWorkout[workout.id] || []).sort((a, b) => a.exercise_order - b.exercise_order);
              return (
                <Card key={workout.id}>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-gray-500">{workout.category}</p>
                      <h2 className="mt-1 text-xl font-black uppercase text-[#000000]">{workout.name}</h2>
                    </div>
                    <Badge variant="default">Workout</Badge>
                  </div>
                  {workout.goal && <p className="mb-4 text-sm text-gray-700">{workout.goal}</p>}
                  <details className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <summary className="cursor-pointer text-xs font-black uppercase text-[#000000]">Show exercises ({workoutExercises.length})</summary>
                    <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                      {workoutExercises.map((exercise) => (
                        <div key={exercise.id} className="rounded-md bg-white px-3 py-2 text-xs font-bold uppercase text-gray-700">
                          {buildExerciseSummary(exercise, setsByExercise[exercise.id] || [])}
                        </div>
                      ))}
                    </div>
                  </details>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {!loading && !error && activeTab === 'programmes' && (
        <section>
          <SectionHeader title="PROGRAMME LIBRARY" accent />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {programmes.map((programme) => {
              const includedWorkouts = (programmeWorkoutsByProgramme[programme.id] || []).sort((a, b) => a.workout_order - b.workout_order);
              return (
                <Card key={programme.id}>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-gray-500">{programme.category}</p>
                      <h2 className="mt-1 text-xl font-black uppercase text-[#000000]">{programme.name}</h2>
                    </div>
                    <Badge variant="default">Programme</Badge>
                  </div>
                  {programme.description && <p className="mb-4 text-sm text-gray-700">{programme.description}</p>}
                  <div className="space-y-3">
                    {includedWorkouts.map((item) => {
                      const workout = workoutsById[item.library_workout_id];
                      if (!workout) return null;
                      return (
                        <div key={item.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant="default">{item.day_label || `Day ${item.workout_order}`}</Badge>
                            <p className="text-sm font-black uppercase text-[#000000]">{workout.name}</p>
                          </div>
                          <p className="text-xs text-gray-600">{workout.goal}</p>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {!loading && !error && activeTab === 'equipment' && (
        <section>
          <SectionHeader title="EQUIPMENT PROGRESSION DEFAULTS" accent />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {equipmentTypes.map((equipment) => (
              <Card key={equipment.id}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-black uppercase text-[#000000]">{equipment.name}</h2>
                    <p className="mt-1 text-sm font-bold uppercase text-[#FA0201]">{formatIncrement(equipment)}</p>
                  </div>
                  <Badge variant="default">{equipment.progression_mode.replace('_', ' ')}</Badge>
                </div>
                {equipment.notes && <p className="text-sm text-gray-700">{equipment.notes}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}

      <Card className="border-2 border-gray-200 bg-gray-50">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.45fr] lg:items-center">
          <div>
            <h2 className="text-2xl font-black uppercase text-[#000000]">Assignment stays inside each client programme</h2>
            <p className="mt-2 text-sm text-gray-700">
              This Library is the reusable master. When we wire the next step, assigning a programme to a client will copy these workouts into that client&apos;s own programme so their kg, reps, RPE, notes and exercise swaps can be edited independently.
            </p>
          </div>
          <Link href="/coach/clients">
            <Button type="button" className="w-full bg-[#FA0201] hover:bg-red-700">Go to clients</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
