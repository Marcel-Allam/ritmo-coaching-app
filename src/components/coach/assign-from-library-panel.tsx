'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type AssignFromLibraryPanelProps = {
  embedded?: boolean;
};

type LibraryProgramme = {
  id: string;
  name: string | null;
  category: string | null;
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

type LibraryWorkout = {
  id: string;
  name: string | null;
  category: string | null;
  goal: string | null;
  instructions: string | null;
};

type LibraryExercise = {
  id: string;
  library_workout_id: string;
  exercise_name: string | null;
  exercise_order: number;
  notes: string | null;
};

type LibrarySet = {
  id: string;
  library_workout_exercise_id: string;
  set_order: number;
  target_reps: string | number | null;
  target_rpe: number | null;
};

const cleanText = (value: unknown, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const text = typeof value === 'string' ? value : String(value);
  const cleaned = text.replace(/^\s+|\s+$/g, '');
  return cleaned || fallback;
};

const getRepresentativeReps = (sets: LibrarySet[]) => {
  const firstSet = sets.find((set) => cleanText(set.target_reps).length > 0);
  return cleanText(firstSet?.target_reps, '?');
};

const buildExerciseSummary = (exercise: LibraryExercise, sets: LibrarySet[]) => {
  const exerciseName = cleanText(exercise.exercise_name, 'Unnamed exercise');
  return `${exerciseName} × ${sets.length || '?'} × ${getRepresentativeReps(sets)}`;
};

export function AssignFromLibraryPanel({ embedded = false }: AssignFromLibraryPanelProps) {
  const params = useParams();
  const clientId = params.id as string;

  const [programmes, setProgrammes] = useState<LibraryProgramme[]>([]);
  const [programmeWorkouts, setProgrammeWorkouts] = useState<LibraryProgrammeWorkout[]>([]);
  const [workouts, setWorkouts] = useState<LibraryWorkout[]>([]);
  const [exercises, setExercises] = useState<LibraryExercise[]>([]);
  const [sets, setSets] = useState<LibrarySet[]>([]);
  const [selectedProgrammeId, setSelectedProgrammeId] = useState('');
  const [programmeTitle, setProgrammeTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadLibrary = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: programmeData, error: programmeError } = await supabase
        .from('library_programmes')
        .select('id, name, category, goal, description')
        .eq('is_active', true)
        .order('category')
        .order('name');

      if (programmeError) {
        setError(programmeError.message);
        setLoading(false);
        return;
      }

      const loadedProgrammes = (programmeData ?? []) as LibraryProgramme[];
      const programmeIds = loadedProgrammes.map((programme) => programme.id);

      if (loadedProgrammes.length === 0) {
        setProgrammes([]);
        setLoading(false);
        return;
      }

      const { data: programmeWorkoutData, error: programmeWorkoutError } = await supabase
        .from('library_programme_workouts')
        .select('id, library_programme_id, library_workout_id, workout_order, day_label')
        .in('library_programme_id', programmeIds)
        .order('workout_order');

      if (programmeWorkoutError) {
        setError(programmeWorkoutError.message);
        setLoading(false);
        return;
      }

      const loadedProgrammeWorkouts = (programmeWorkoutData ?? []) as LibraryProgrammeWorkout[];
      const workoutIds = Array.from(new Set(loadedProgrammeWorkouts.map((item) => item.library_workout_id)));

      const { data: workoutData, error: workoutError } = workoutIds.length
        ? await supabase
            .from('library_workouts')
            .select('id, name, category, goal, instructions')
            .in('id', workoutIds)
        : { data: [], error: null };

      if (workoutError) {
        setError(workoutError.message);
        setLoading(false);
        return;
      }

      const loadedWorkouts = (workoutData ?? []) as LibraryWorkout[];
      const { data: exerciseData, error: exerciseError } = workoutIds.length
        ? await supabase
            .from('library_workout_exercises')
            .select('id, library_workout_id, exercise_name, exercise_order, notes')
            .in('library_workout_id', workoutIds)
            .order('exercise_order')
        : { data: [], error: null };

      if (exerciseError) {
        setError(exerciseError.message);
        setLoading(false);
        return;
      }

      const loadedExercises = (exerciseData ?? []) as LibraryExercise[];
      const exerciseIds = loadedExercises.map((exercise) => exercise.id);
      const { data: setData, error: setLoadError } = exerciseIds.length
        ? await supabase
            .from('library_workout_sets')
            .select('id, library_workout_exercise_id, set_order, target_reps, target_rpe')
            .in('library_workout_exercise_id', exerciseIds)
            .order('set_order')
        : { data: [], error: null };

      if (setLoadError) {
        setError(setLoadError.message);
        setLoading(false);
        return;
      }

      const firstProgrammeName = cleanText(loadedProgrammes[0]?.name, 'Client programme');

      setProgrammes(loadedProgrammes);
      setProgrammeWorkouts(loadedProgrammeWorkouts);
      setWorkouts(loadedWorkouts);
      setExercises(loadedExercises);
      setSets((setData ?? []) as LibrarySet[]);
      setSelectedProgrammeId(loadedProgrammes[0].id);
      setProgrammeTitle(firstProgrammeName);
      setLoading(false);
    };

    loadLibrary();
  }, []);

  const selectedProgramme = useMemo(
    () => programmes.find((programme) => programme.id === selectedProgrammeId) || programmes[0],
    [programmes, selectedProgrammeId]
  );

  const workoutsById = useMemo(() => {
    return workouts.reduce<Record<string, LibraryWorkout>>((acc, workout) => {
      acc[workout.id] = workout;
      return acc;
    }, {});
  }, [workouts]);

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

  const selectedProgrammeWorkouts = useMemo(() => {
    return programmeWorkouts
      .filter((item) => item.library_programme_id === selectedProgrammeId)
      .sort((a, b) => a.workout_order - b.workout_order);
  }, [programmeWorkouts, selectedProgrammeId]);

  const chooseProgramme = (programmeId: string) => {
    const programme = programmes.find((item) => item.id === programmeId);
    const nextTitle = cleanText(programme?.name, 'Client programme');
    setSelectedProgrammeId(programmeId);
    setProgrammeTitle(nextTitle);
    setError(null);
    setMessage(null);
  };

  const assignProgramme = async () => {
    if (!isSupabaseConfigured || !selectedProgramme) return;

    const safeProgrammeTitle = cleanText(programmeTitle);
    if (!safeProgrammeTitle) {
      setError('Programme title is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('assign_library_programme_to_client', {
      p_client_id: clientId,
      p_library_programme_id: selectedProgramme.id,
      p_program_title: safeProgrammeTitle,
    });

    if (rpcError) {
      setError(rpcError.message);
      setSaving(false);
      return;
    }

    const assignedProgrammeName = cleanText(selectedProgramme.name, 'Programme');
    setMessage(`${assignedProgrammeName} assigned as the active client-specific programme. Reloading programme delivery...`);
    window.setTimeout(() => window.location.reload(), 600);
  };

  const wrapperClassName = embedded ? 'mt-4' : 'p-6 pt-0 md:p-8 md:pt-0';
  const sectionTitle = embedded ? 'CREATE CLIENT-SPECIFIC TRAINING PLAN' : 'ASSIGN FROM LIBRARY';

  if (loading) {
    return <div id="assign-from-library" className={wrapperClassName}><Card>Loading Programme Library...</Card></div>;
  }

  if (programmes.length === 0) {
    return (
      <div id="assign-from-library" className={wrapperClassName}>
        <Card>
          <p className="text-sm text-gray-600">No active library programmes found. Build the Programme Library first.</p>
        </Card>
      </div>
    );
  }

  return (
    <div id="assign-from-library" className={wrapperClassName}>
      <section>
        <SectionHeader title={sectionTitle} accent />
        <Card className="space-y-6">
          {message && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">{message}</div>}
          {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold uppercase">Programme Library item</label>
              <select
                value={selectedProgrammeId}
                onChange={(event) => chooseProgramme(event.target.value)}
                className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black"
              >
                {programmes.map((programme) => {
                  const programmeName = cleanText(programme.name, 'Untitled programme');
                  return <option key={programme.id} value={programme.id}>{programmeName}</option>;
                })}
              </select>
            </div>
            <Input label="Client programme title" value={cleanText(programmeTitle)} onChange={(event) => setProgrammeTitle(event.target.value ?? '')} required />
          </div>

          {selectedProgramme && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="default">{cleanText(selectedProgramme.category, 'Programme')}</Badge>
                <p className="text-sm font-bold uppercase text-[#000000]">{cleanText(selectedProgramme.name, 'Untitled programme')}</p>
              </div>
              {cleanText(selectedProgramme.description) && <p className="text-sm text-gray-700">{cleanText(selectedProgramme.description)}</p>}
              <p className="mt-2 text-xs font-bold uppercase text-gray-500">
                Creates {selectedProgrammeWorkouts.length} unscheduled workout{selectedProgrammeWorkouts.length === 1 ? '' : 's'} copied into this client only. The copied plan can then be edited without changing the Library template.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {selectedProgrammeWorkouts.map((item) => {
              const workout = workoutsById[item.library_workout_id];
              if (!workout) return null;
              const workoutExercises = (exercisesByWorkout[workout.id] || []).sort((a, b) => a.exercise_order - b.exercise_order);
              const workoutName = cleanText(workout.name, 'Untitled workout');
              const workoutCategory = cleanText(workout.category, 'Workout');

              return (
                <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="default">{item.day_label || `Day ${item.workout_order}`}</Badge>
                    <Badge variant="warning">{workoutCategory}</Badge>
                  </div>
                  <p className="mt-3 text-lg font-black uppercase text-[#000000]">{workoutName}</p>
                  {cleanText(workout.goal) && <p className="mt-1 text-xs font-semibold text-gray-600">{cleanText(workout.goal)}</p>}
                  <details className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
                    <summary className="cursor-pointer text-xs font-black uppercase text-[#000000]">Show exercises ({workoutExercises.length})</summary>
                    <div className="mt-3 space-y-2">
                      {workoutExercises.map((exercise) => (
                        <div key={exercise.id} className="rounded-md bg-white px-3 py-2 text-xs font-bold uppercase text-gray-700">
                          {buildExerciseSummary(exercise, setsByExercise[exercise.id] || [])}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="text-xs font-semibold uppercase text-gray-500">
              Assignment copies the Library programme into client-specific tables and archives the previous active programme.
            </p>
            <Button type="button" disabled={saving} onClick={assignProgramme} className="bg-[#FA0201] hover:bg-red-700">
              {saving ? 'Creating plan...' : 'Create client-specific plan'}
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
