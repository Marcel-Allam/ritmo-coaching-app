'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = { id: string; full_name: string };
type WorkoutRecord = { id: string; title: string; instructions: string | null };
type ExerciseRecord = { id: string; exercise_order: number; exercise_name: string; notes: string | null };
type PrescribedSetRecord = {
  id: string;
  exercise_id: string;
  set_order: number;
  target_reps: string | null;
  target_weight_kg: number | null;
};
type SetLog = { weight: string; reps: string; rpe: string; completed: boolean; notes: string };

const emptyLog: SetLog = { weight: '', reps: '', rpe: '', completed: false, notes: '' };
const numberOrNull = (value: string) => (value.trim() ? Number(value) : null);
const numberOrFallback = (value: string, fallback: number | null) => (value.trim() ? Number(value) : fallback);
const integerOrFallback = (value: string, fallback: string | null) => {
  if (value.trim()) return Number.parseInt(value, 10);
  if (!fallback?.trim()) return null;
  const parsed = Number.parseInt(fallback, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const rpeGuide = [
  { score: '6', repsLeft: 'About 4 reps left' },
  { score: '7', repsLeft: 'About 3 reps left' },
  { score: '8', repsLeft: 'About 2 reps left' },
  { score: '8.5', repsLeft: 'About 1-2 reps left' },
  { score: '9', repsLeft: 'About 1 rep left' },
  { score: '9.5', repsLeft: 'Maybe 0-1 reps left' },
  { score: '10', repsLeft: 'No reps left' },
];

const getRpeDescription = (value: string) => {
  return rpeGuide.find((item) => item.score === value.trim());
};

export default function ClientWorkoutSessionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const workoutId = params.workoutId as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workout, setWorkout] = useState<WorkoutRecord | null>(null);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [sets, setSets] = useState<PrescribedSetRecord[]>([]);
  const [logs, setLogs] = useState<Record<string, SetLog>>({});
  const [sessionNotes, setSessionNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const setResult = exerciseIds.length
        ? await supabase
            .from('program_sets')
            .select('id, exercise_id, set_order, target_reps, target_weight_kg')
            .in('exercise_id', exerciseIds)
            .order('set_order', { ascending: true })
        : { data: [], error: null };

      if (setResult.error) {
        setError(setResult.error.message);
        setLoading(false);
        return;
      }

      const loadedSets = (setResult.data ?? []) as PrescribedSetRecord[];
      const initialLogs = loadedSets.reduce<Record<string, SetLog>>((acc, set) => {
        acc[set.id] = { ...emptyLog };
        return acc;
      }, {});

      setWorkout(workoutData as WorkoutRecord);
      setExercises(loadedExercises);
      setSets(loadedSets);
      setLogs(initialLogs);
      setLoading(false);
    };

    loadWorkout();
  }, [user, workoutId]);

  const setsByExercise = useMemo(() => {
    return exercises.reduce<Record<string, PrescribedSetRecord[]>>((acc, exercise) => {
      acc[exercise.id] = sets.filter((set) => set.exercise_id === exercise.id);
      return acc;
    }, {});
  }, [exercises, sets]);

  const updateLog = (setId: string, updates: Partial<SetLog>) => {
    setLogs((current) => ({ ...current, [setId]: { ...(current[setId] || emptyLog), ...updates } }));
  };

  const submitWorkout = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!client || !workout || !isSupabaseConfigured) return;

    setSaving(true);
    setError(null);
    const supabase = createClient();

    const { data: sessionData, error: sessionError } = await supabase
      .from('workout_sessions')
      .insert({
        client_id: client.id,
        program_workout_id: workout.id,
        status: 'completed',
        completed_at: new Date().toISOString(),
        review_status: 'new',
        client_notes: sessionNotes.trim() || null,
      })
      .select('id')
      .single();

    if (sessionError || !sessionData) {
      setError(sessionError?.message || 'Could not submit workout.');
      setSaving(false);
      return;
    }

    const sessionId = (sessionData as { id: string }).id;
    const rows = sets.map((set) => ({
      session_id: sessionId,
      program_exercise_id: set.exercise_id,
      program_set_id: set.id,
      set_order: set.set_order,
      actual_weight_kg: numberOrFallback(logs[set.id]?.weight || '', set.target_weight_kg),
      actual_reps: integerOrFallback(logs[set.id]?.reps || '', set.target_reps),
      actual_rpe: numberOrNull(logs[set.id]?.rpe || ''),
      actual_rir: null,
      completed: logs[set.id]?.completed ?? false,
      notes: logs[set.id]?.notes.trim() || null,
    }));

    const { error: performedSetsError } = await supabase.from('performed_sets').insert(rows);
    if (performedSetsError) {
      setError(performedSetsError.message);
      setSaving(false);
      return;
    }

    const { error: reviewQueueError } = await supabase.from('task_submissions').insert({
      client_id: client.id,
      submission_type: 'workout_session',
      answer_text: sessionId,
      review_status: 'new',
      followup_required: true,
    });

    if (reviewQueueError) {
      setError(`Workout saved, but the coach review item was not created: ${reviewQueueError.message}`);
      setSaving(false);
      return;
    }

    router.push('/client/training?submitted=1');
  };

  if (loading) {
    return <div><PageHeader title="START YOUR WORKOUT" /><div className="px-4 py-6 md:px-8 max-w-5xl mx-auto"><Card>Loading workout...</Card></div></div>;
  }

  if (error && !workout) {
    return <div><PageHeader title="START YOUR WORKOUT" /><div className="px-4 py-6 md:px-8 max-w-5xl mx-auto"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div></div>;
  }

  return (
    <div>
      <PageHeader title="START YOUR WORKOUT" subtitle={workout ? `Ready to start ${workout.title}?` : undefined} />
      <main className="px-4 py-6 md:px-8 max-w-5xl mx-auto pb-24 md:pb-8">
        {error && <Card className="mb-6 border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}
        {workout?.instructions && <Card className="mb-6"><p className="text-sm text-gray-700">{workout.instructions}</p></Card>}

        <form onSubmit={submitWorkout} className="space-y-8">
          {exercises.map((exercise) => (
            <section key={exercise.id}>
              <SectionHeader title={`${exercise.exercise_order}. ${exercise.exercise_name}`} accent />
              <Card className="space-y-4">
                {exercise.notes && <p className="text-sm text-gray-700">{exercise.notes}</p>}
                {setsByExercise[exercise.id]?.map((set) => {
                  const log = logs[set.id] || emptyLog;
                  const selectedRpe = getRpeDescription(log.rpe);

                  return (
                    <div
                      key={set.id}
                      className={`rounded-lg border p-4 transition-colors duration-200 ${
                        log.completed ? 'border-gray-300 bg-gray-100 opacity-75' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="mb-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-bold uppercase text-[#000000]">Set {set.set_order}</p>
                          <p className="text-xs text-gray-500">
                            Target: {set.target_reps || '-'} reps {set.target_weight_kg ? `@ ${set.target_weight_kg}kg` : ''}
                          </p>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-600">
                          <input
                            type="checkbox"
                            checked={log.completed}
                            onChange={(e) => updateLog(set.id, { completed: e.target.checked })}
                          />
                          Complete
                        </label>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <Input label="Kg" type="number" step="0.5" value={log.weight} placeholder={set.target_weight_kg?.toString() || ''} onChange={(e) => updateLog(set.id, { weight: e.target.value })} />
                        <Input label="Reps" type="number" value={log.reps} placeholder={set.target_reps || ''} onChange={(e) => updateLog(set.id, { reps: e.target.value })} />
                        <div>
                          <label className="block text-sm font-semibold uppercase mb-2">RPE</label>
                          <select
                            value={log.rpe}
                            onChange={(e) => updateLog(set.id, { rpe: e.target.value })}
                            className="w-full px-4 py-2 bg-white border-2 border-gray-300 rounded-lg text-black transition-colors duration-200 focus:outline-none focus:border-black focus:ring-2 focus:ring-black focus:ring-opacity-50"
                          >
                            <option value="">Select RPE</option>
                            {rpeGuide.map((item) => <option key={item.score} value={item.score}>{item.score}</option>)}
                          </select>
                          {selectedRpe && (
                            <p className="mt-2 text-xs font-semibold text-gray-600">
                              {selectedRpe.repsLeft}
                            </p>
                          )}
                        </div>
                        <Input label="Notes" value={log.notes} onChange={(e) => updateLog(set.id, { notes: e.target.value })} />
                      </div>
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
          <Textarea label="Overall workout notes" value={sessionNotes} onChange={(e) => setSessionNotes(e.target.value)} />
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={saving} className="bg-[#FA0201] hover:bg-red-700 disabled:opacity-60">
            {saving ? 'SUBMITTING...' : 'SUBMIT WORKOUT'}
          </Button>
        </form>
      </main>
    </div>
  );
}
