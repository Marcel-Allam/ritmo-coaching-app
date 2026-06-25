'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type NumericValue = number | string | null;

type ClientRecord = { id: string; full_name: string };
type WorkoutRecord = { id: string; title: string; instructions: string | null };
type ExerciseRecord = { id: string; exercise_order: number; exercise_name: string; notes: string | null; exercise_role: string | null };

type ResolvedSetRecord = {
  program_set_id: string;
  exercise_id: string;
  week_number: number;
  current_program_week: number;
  is_current_week: boolean;
  set_order: number;
  target_definition_source: string;
  target_reps: string | null;
  target_weight_kg: NumericValue;
  target_percent_1rm: NumericValue;
  target_rpe: NumericValue;
  target_rir: NumericValue;
  effective_target_weight_kg: NumericValue;
  target_load_source: string;
  notes: string | null;
};

const formatNumericValue = (value: NumericValue) => {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(1);
};

const formatKg = (value: NumericValue) => {
  const formatted = formatNumericValue(value);
  return formatted === '—' ? formatted : `${formatted}kg`;
};

const formatPercent = (value: NumericValue) => {
  const formatted = formatNumericValue(value);
  return formatted === '—' ? formatted : `${formatted}%`;
};

const formatSourceLabel = (source: string) => {
  if (source === 'weekly_target') return 'Weekly target';
  if (source === 'base_program_set') return 'Base fallback';
  if (source === 'coach_override') return 'Coach override';
  if (source === 'calculated_from_percent_1rm') return 'Calculated';
  if (source === 'missing_calibration') return 'Missing calibration';
  if (source === 'not_percent_based') return 'Not % based';
  return source.replaceAll('_', ' ');
};

export default function ClientWorkoutTableViewPage() {
  const { user } = useAuth();
  const params = useParams();
  const workoutId = params.workoutId as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workout, setWorkout] = useState<WorkoutRecord | null>(null);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [sets, setSets] = useState<ResolvedSetRecord[]>([]);
  const [displayWeek, setDisplayWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWorkout = async () => {
      if (!isSupabaseConfigured || !user) {
        setError('Account is not ready yet.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        setError('This account is not linked to a client record yet.');
        setLoading(false);
        return;
      }

      const linkedClient = clientData as ClientRecord;
      setClient(linkedClient);

      const { data: workoutData, error: workoutError } = await supabase
        .from('program_workouts')
        .select('id, title, instructions')
        .eq('id', workoutId)
        .eq('client_id', linkedClient.id)
        .single();

      if (workoutError || !workoutData) {
        setError(workoutError?.message || 'Workout not found.');
        setLoading(false);
        return;
      }

      const { data: exerciseData, error: exerciseError } = await supabase
        .from('program_exercises')
        .select('id, exercise_order, exercise_name, notes, exercise_role')
        .eq('workout_id', workoutId)
        .order('exercise_order', { ascending: true });

      if (exerciseError) {
        setError(exerciseError.message);
        setLoading(false);
        return;
      }

      const { data: resolvedSetData, error: resolvedSetError } = await supabase
        .from('program_set_calculated_targets')
        .select('program_set_id, exercise_id, week_number, current_program_week, is_current_week, set_order, target_definition_source, target_reps, target_weight_kg, target_percent_1rm, target_rpe, target_rir, effective_target_weight_kg, target_load_source, notes')
        .eq('workout_id', workoutId)
        .order('week_number', { ascending: true })
        .order('exercise_name', { ascending: true })
        .order('set_order', { ascending: true });

      if (resolvedSetError) {
        setError(resolvedSetError.message);
        setLoading(false);
        return;
      }

      const allResolvedSets = (resolvedSetData ?? []) as ResolvedSetRecord[];
      const currentWeekSets = allResolvedSets.filter((set) => set.is_current_week);
      const fallbackWeekOneSets = allResolvedSets.filter((set) => set.week_number === 1);
      const selectedSets = currentWeekSets.length > 0 ? currentWeekSets : fallbackWeekOneSets;
      const resolvedDisplayWeek = selectedSets[0]?.week_number ?? allResolvedSets[0]?.week_number ?? null;

      setWorkout(workoutData as WorkoutRecord);
      setExercises((exerciseData ?? []) as ExerciseRecord[]);
      setSets(selectedSets);
      setDisplayWeek(resolvedDisplayWeek);
      setLoading(false);
    };

    loadWorkout();
  }, [user, workoutId]);

  const setsByExercise = useMemo(() => {
    return exercises.reduce<Record<string, ResolvedSetRecord[]>>((acc, exercise) => {
      acc[exercise.id] = sets.filter((set) => set.exercise_id === exercise.id).sort((a, b) => a.set_order - b.set_order);
      return acc;
    }, {});
  }, [exercises, sets]);

  if (loading) {
    return (
      <div>
        <PageHeader title="WORKOUT TABLE" />
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8">
          <Card>Loading workout...</Card>
        </main>
      </div>
    );
  }

  if (error || !workout) {
    return (
      <div>
        <PageHeader title="WORKOUT TABLE" />
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8">
          <Card><p className="text-sm font-semibold text-red-700">{error || 'Workout not found.'}</p></Card>
        </main>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="WORKOUT TABLE" subtitle={client ? `Viewing ${workout.title} for ${client.full_name}` : workout.title} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-8">
        <section className="rounded-2xl bg-[#FA0201] p-6 text-white shadow-sm">
          <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-white/75">Workout preview</p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-tight">{workout.title}</h1>
              <p className="mt-2 text-sm font-semibold text-white/80">
                {displayWeek ? `Week ${displayWeek} • ` : ''}{exercises.length} exercise{exercises.length === 1 ? '' : 's'} • {sets.length} prescribed set{sets.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/client/training" className="rounded-lg border border-white/50 px-4 py-3 text-xs font-black uppercase text-white hover:bg-white hover:text-[#FA0201]">
                Back to programme
              </Link>
              <Link href={`/client/training/${workout.id}?view=focus`} className="rounded-lg bg-white px-4 py-3 text-xs font-black uppercase text-[#FA0201] hover:bg-gray-100">
                Start workout
              </Link>
            </div>
          </div>
        </section>

        {workout.instructions && (
          <Card>
            <p className="text-xs font-black uppercase text-gray-500">Workout notes</p>
            <p className="mt-2 text-sm font-semibold text-gray-800">{workout.instructions}</p>
          </Card>
        )}

        <Card className="border-2 border-red-100 bg-red-50">
          <p className="text-xs font-black uppercase text-[#FA0201]">Resolved weekly prescription</p>
          <p className="mt-2 text-sm font-semibold text-red-900">
            This table uses the current programme week when available. If the programme is still in calibration/week 0, it falls back to Week 1.
          </p>
        </Card>

        <section>
          <SectionHeader title="WORKOUT TABLE" accent />
          <div className="space-y-5">
            {exercises.map((exercise) => {
              const exerciseSets = setsByExercise[exercise.id] || [];
              return (
                <Card key={exercise.id} className="overflow-hidden p-0">
                  <div className="border-b border-gray-200 bg-gray-50 p-5">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-2xl font-black uppercase tracking-tight text-[#000000]">{exercise.exercise_name}</h2>
                          {exercise.exercise_role === 'main_lift' && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase text-[#FA0201]">Main lift</span>}
                        </div>
                      </div>
                      <p className="rounded-full bg-gray-200 px-3 py-1 text-xs font-black uppercase text-[#000000]">{exerciseSets.length} set{exerciseSets.length === 1 ? '' : 's'}</p>
                    </div>
                    {exercise.notes && <p className="mt-3 text-sm font-semibold text-gray-700">{exercise.notes}</p>}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                      <thead className="bg-white text-xs font-black uppercase text-gray-500">
                        <tr>
                          <th className="px-5 py-3">Set</th>
                          <th className="px-5 py-3">Target kg</th>
                          <th className="px-5 py-3">Target reps</th>
                          <th className="px-5 py-3">%1RM</th>
                          <th className="px-5 py-3">Target RPE</th>
                          <th className="px-5 py-3">Source</th>
                          <th className="px-5 py-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {exerciseSets.length === 0 ? (
                          <tr><td colSpan={7} className="px-5 py-4 text-gray-600">No sets prescribed for this exercise.</td></tr>
                        ) : (
                          exerciseSets.map((set) => (
                            <tr key={`${set.program_set_id}-${set.week_number}`} className="border-t border-gray-100 odd:bg-gray-50 even:bg-white">
                              <td className="px-5 py-4 font-black uppercase text-[#000000]">Set {set.set_order}</td>
                              <td className="px-5 py-4 font-black text-[#FA0201]">{formatKg(set.effective_target_weight_kg)}</td>
                              <td className="px-5 py-4 font-semibold text-gray-800">{set.target_reps || '—'}</td>
                              <td className="px-5 py-4 font-semibold text-gray-800">{formatPercent(set.target_percent_1rm)}</td>
                              <td className="px-5 py-4 font-semibold text-gray-800">{formatNumericValue(set.target_rpe)}</td>
                              <td className="px-5 py-4 text-xs font-black uppercase text-gray-600">
                                <span className="block">{formatSourceLabel(set.target_definition_source)}</span>
                                <span className="mt-1 block text-gray-400">{formatSourceLabel(set.target_load_source)}</span>
                              </td>
                              <td className="px-5 py-4 text-gray-600">{set.notes || '—'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
