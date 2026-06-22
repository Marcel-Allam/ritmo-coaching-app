'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
type CompletedSessionRecord = { id: string; completed_at: string | null; review_status: string };
type ExerciseRecord = { id: string; exercise_order: number; exercise_name: string; notes: string | null };
type PrescribedSetRecord = { id: string; exercise_id: string; set_order: number; target_reps: string | null; target_weight_kg: number | null };
type SetLog = { weight: string; reps: string; rpe: string; completed: boolean; notes: string };
type ViewMode = 'focus' | 'full';

const emptyLog: SetLog = { weight: '', reps: '', rpe: '', completed: false, notes: '' };
const numberOrNull = (value: string) => (value.trim() ? Number(value) : null);
const numberOrFallback = (value: string, fallback: number | null) => (value.trim() ? Number(value) : fallback);
const integerOrFallback = (value: string, fallback: string | null) => {
  if (value.trim()) return Number.parseInt(value, 10);
  if (!fallback?.trim()) return null;
  const parsed = Number.parseInt(fallback, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const defaultActualReps = (targetReps: string | null) => {
  if (!targetReps?.trim()) return '';
  const rangeMatch = targetReps.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) return rangeMatch[2];
  const singleMatch = targetReps.match(/\d+/);
  return singleMatch ? singleMatch[0] : '';
};

const formatDateTime = (value: string | null) => {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
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

const sessionFeelOptions = [
  { value: '1', label: '1 — Very poor' },
  { value: '2', label: '2 — Poor' },
  { value: '3', label: '3 — Below normal' },
  { value: '4', label: '4 — Fine' },
  { value: '5', label: '5 — Strong' },
];

const getRpeDescription = (value: string) => rpeGuide.find((item) => item.score === value.trim());
const prescribedWeightValue = (set: PrescribedSetRecord) => set.target_weight_kg?.toString() || '';
const prescribedRepsValue = (set: PrescribedSetRecord) => defaultActualReps(set.target_reps);
const matchesPrescription = (value: string, prescription: string) => Boolean(prescription.trim()) && value.trim() === prescription.trim();

export default function ClientWorkoutSessionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const workoutId = params.workoutId as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workout, setWorkout] = useState<WorkoutRecord | null>(null);
  const [completedSession, setCompletedSession] = useState<CompletedSessionRecord | null>(null);
  const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
  const [sets, setSets] = useState<PrescribedSetRecord[]>([]);
  const [logs, setLogs] = useState<Record<string, SetLog>>({});
  const [sessionFeel, setSessionFeel] = useState('');
  const [sessionNotes, setSessionNotes] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('focus');
  const [focusSetIndex, setFocusSetIndex] = useState(0);
  const [showFinishPanel, setShowFinishPanel] = useState(false);
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
      const { data: clientData, error: clientError } = await supabase.from('clients').select('id, full_name').eq('user_id', user.id).single();

      if (clientError || !clientData) {
        setError('This account is not linked to a client record yet.');
        setLoading(false);
        return;
      }

      const linkedClient = clientData as ClientRecord;
      setClient(linkedClient);

      const [workoutResult, existingSessionResult] = await Promise.all([
        supabase.from('program_workouts').select('id, title, instructions').eq('id', workoutId).eq('client_id', linkedClient.id).single(),
        supabase.from('workout_sessions').select('id, completed_at, review_status').eq('client_id', linkedClient.id).eq('program_workout_id', workoutId).eq('status', 'completed').order('completed_at', { ascending: false }).limit(1),
      ]);

      if (workoutResult.error || !workoutResult.data) {
        setError(workoutResult.error?.message || 'Workout not found.');
        setLoading(false);
        return;
      }

      if (existingSessionResult.error) {
        setError(existingSessionResult.error.message);
        setLoading(false);
        return;
      }

      const existingSession = ((existingSessionResult.data ?? []) as CompletedSessionRecord[])[0] ?? null;
      if (existingSession) {
        setWorkout(workoutResult.data as WorkoutRecord);
        setCompletedSession(existingSession);
        setLoading(false);
        return;
      }

      const { data: exerciseData, error: exerciseError } = await supabase.from('program_exercises').select('id, exercise_order, exercise_name, notes').eq('workout_id', workoutId).order('exercise_order', { ascending: true });

      if (exerciseError) {
        setError(exerciseError.message);
        setLoading(false);
        return;
      }

      const loadedExercises = (exerciseData ?? []) as ExerciseRecord[];
      const exerciseIds = loadedExercises.map((exercise) => exercise.id);
      const setResult = exerciseIds.length
        ? await supabase.from('program_sets').select('id, exercise_id, set_order, target_reps, target_weight_kg').in('exercise_id', exerciseIds).order('set_order', { ascending: true })
        : { data: [], error: null };

      if (setResult.error) {
        setError(setResult.error.message);
        setLoading(false);
        return;
      }

      const loadedSets = (setResult.data ?? []) as PrescribedSetRecord[];
      const initialLogs = loadedSets.reduce<Record<string, SetLog>>((acc, set) => {
        acc[set.id] = { ...emptyLog, weight: prescribedWeightValue(set), reps: prescribedRepsValue(set) };
        return acc;
      }, {});

      setWorkout(workoutResult.data as WorkoutRecord);
      setExercises(loadedExercises);
      setSets(loadedSets);
      setLogs(initialLogs);
      setLoading(false);
    };

    loadWorkout();
  }, [user, workoutId]);

  const setsByExercise = useMemo(() => {
    return exercises.reduce<Record<string, PrescribedSetRecord[]>>((acc, exercise) => {
      acc[exercise.id] = sets.filter((set) => set.exercise_id === exercise.id).sort((a, b) => a.set_order - b.set_order);
      return acc;
    }, {});
  }, [exercises, sets]);

  const orderedFocusSets = useMemo(() => {
    return exercises.flatMap((exercise) => (setsByExercise[exercise.id] || []).map((set) => ({ exercise, set })));
  }, [exercises, setsByExercise]);

  const completionStats = useMemo(() => {
    const completedCount = sets.filter((set) => logs[set.id]?.completed).length;
    return { completedCount, totalCount: sets.length };
  }, [logs, sets]);

  const currentFocusItem = orderedFocusSets[focusSetIndex] || null;
  const currentLog = currentFocusItem ? logs[currentFocusItem.set.id] || emptyLog : emptyLog;
  const currentExerciseSets = currentFocusItem ? setsByExercise[currentFocusItem.exercise.id] || [] : [];
  const currentSetPositionInExercise = currentFocusItem ? currentExerciseSets.findIndex((set) => set.id === currentFocusItem.set.id) + 1 : 0;
  const selectedRpe = getRpeDescription(currentLog.rpe);
  const currentPrescribedWeight = currentFocusItem ? prescribedWeightValue(currentFocusItem.set) : '';
  const currentPrescribedReps = currentFocusItem ? prescribedRepsValue(currentFocusItem.set) : '';
  const kgMatchesPrescription = matchesPrescription(currentLog.weight, currentPrescribedWeight);
  const repsMatchesPrescription = matchesPrescription(currentLog.reps, currentPrescribedReps);
  const focusInputBaseClass = 'mt-2 w-full border-0 border-b-4 border-black bg-transparent text-right text-7xl font-black outline-none transition-colors duration-150';

  const updateLog = (setId: string, updates: Partial<SetLog>) => {
    setLogs((current) => ({ ...current, [setId]: { ...(current[setId] || emptyLog), ...updates } }));
  };

  const completeCurrentSet = () => {
    if (!currentFocusItem) return;
    updateLog(currentFocusItem.set.id, { completed: true });

    const nextIndex = orderedFocusSets.findIndex((item, index) => index > focusSetIndex && item.set.id !== currentFocusItem.set.id && !logs[item.set.id]?.completed);
    if (nextIndex >= 0) {
      setFocusSetIndex(nextIndex);
      return;
    }

    const firstIncompleteIndex = orderedFocusSets.findIndex((item) => item.set.id !== currentFocusItem.set.id && !logs[item.set.id]?.completed);
    if (firstIncompleteIndex >= 0) {
      setFocusSetIndex(firstIncompleteIndex);
      return;
    }

    setShowFinishPanel(true);
  };

  const markAllSetsComplete = () => {
    setLogs((current) => sets.reduce<Record<string, SetLog>>((acc, set) => {
      acc[set.id] = { ...(current[set.id] || emptyLog), weight: current[set.id]?.weight || prescribedWeightValue(set), reps: current[set.id]?.reps || prescribedRepsValue(set), completed: true };
      return acc;
    }, {}));
    setShowFinishPanel(true);
  };

  const submitWorkout = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!client || !workout || !isSupabaseConfigured) return;

    const confirmed = window.confirm(`Submit ${workout.title}? You will not be able to submit this workout again.`);
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    const supabase = createClient();

    const { data: existingSessionData, error: existingSessionError } = await supabase.from('workout_sessions').select('id, completed_at, review_status').eq('client_id', client.id).eq('program_workout_id', workout.id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(1);

    if (existingSessionError) {
      setError(existingSessionError.message);
      setSaving(false);
      return;
    }

    const existingSession = ((existingSessionData ?? []) as CompletedSessionRecord[])[0] ?? null;
    if (existingSession) {
      setCompletedSession(existingSession);
      setError('This workout has already been submitted, so it is locked to prevent duplicate logs.');
      setSaving(false);
      return;
    }

    const sessionFeelLabel = sessionFeelOptions.find((option) => option.value === sessionFeel)?.label || '';
    const combinedSessionNotes = [sessionFeelLabel ? `Session felt: ${sessionFeelLabel}` : null, sessionNotes.trim() || null].filter(Boolean).join('\n\n') || null;

    const { data: sessionData, error: sessionError } = await supabase.from('workout_sessions').insert({ client_id: client.id, program_workout_id: workout.id, status: 'completed', completed_at: new Date().toISOString(), review_status: 'new', client_notes: combinedSessionNotes }).select('id').single();

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
      completed: logs[set.id]?.completed ?? false,
      notes: logs[set.id]?.notes.trim() || null,
    }));

    const { error: performedSetsError } = await supabase.from('performed_sets').insert(rows);
    if (performedSetsError) {
      setError(performedSetsError.message);
      setSaving(false);
      return;
    }

    const { error: reviewQueueError } = await supabase.from('task_submissions').insert({ client_id: client.id, submission_type: 'workout_session', answer_text: sessionId, review_status: 'new', followup_required: true });
    if (reviewQueueError) {
      setError(`Workout saved, but the coach review item was not created: ${reviewQueueError.message}`);
      setSaving(false);
      return;
    }

    router.push('/client/training?submitted=1');
  };

  if (loading) return <div><PageHeader title="START YOUR WORKOUT" /><div className="px-4 py-6 md:px-8 max-w-5xl mx-auto"><Card>Loading workout...</Card></div></div>;
  if (error && !workout) return <div><PageHeader title="START YOUR WORKOUT" /><div className="px-4 py-6 md:px-8 max-w-5xl mx-auto"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div></div>;

  if (completedSession) {
    return (
      <div>
        <PageHeader title="WORKOUT COMPLETED" subtitle={workout ? `${workout.title} has already been submitted.` : undefined} />
        <main className="mx-auto max-w-3xl px-4 py-6 md:px-8">
          <Card className="border-2 border-green-200 bg-green-50">
            <p className="text-sm font-black uppercase text-green-800">Submission locked</p>
            <h2 className="mt-2 text-2xl font-black uppercase text-[#000000]">This workout is already complete</h2>
            <p className="mt-2 text-sm text-gray-700">Completed: {formatDateTime(completedSession.completed_at)}. Your coach can now review the performance and send feedback.</p>
            <p className="mt-1 text-xs font-bold uppercase text-gray-500">Review status: {completedSession.review_status.replaceAll('_', ' ')}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/client/training" className="rounded-lg bg-[#FA0201] px-4 py-2 text-sm font-bold uppercase text-white hover:bg-red-700">Back to training</Link>
              <Link href="/client" className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-bold uppercase text-[#000000] hover:bg-gray-50">Back to hub</Link>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  if (viewMode === 'focus' && workout && currentFocusItem) {
    return (
      <div className="min-h-screen bg-white text-[#000000]">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col px-4 py-5">
          {error && <Card className="mb-4 border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

          <header className="flex items-center justify-between gap-4 border-b border-gray-200 pb-5">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Focus mode</p>
              <h1 className="mt-1 text-3xl font-black uppercase leading-tight tracking-tight">{currentFocusItem.exercise.exercise_name}</h1>
            </div>
            <Link href="/client/training" className="rounded-lg bg-[#FA0201] px-4 py-3 text-center text-xs font-black uppercase text-white hover:bg-red-700">Cancel<br />workout</Link>
          </header>

          <section className="py-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase text-gray-500">Exercise {currentFocusItem.exercise.exercise_order} of {exercises.length}</p>
                <h2 className="mt-1 text-5xl font-black uppercase tracking-tight">Set {currentSetPositionInExercise}</h2>
                <p className="mt-1 text-sm font-bold uppercase text-gray-500">{completionStats.completedCount}/{completionStats.totalCount} sets complete</p>
              </div>
              <div className="rounded-xl bg-gray-100 px-4 py-3 text-right">
                <p className="text-xs font-bold uppercase text-gray-500">Target</p>
                <p className="text-sm font-black">{currentFocusItem.set.target_reps || '-'} reps</p>
                <p className="text-sm font-black">{currentFocusItem.set.target_weight_kg ? `${currentFocusItem.set.target_weight_kg}kg` : '-'}</p>
              </div>
            </div>

            {currentFocusItem.exercise.notes && (
              <div className="mt-5 rounded-xl bg-gray-100 p-4">
                <p className="text-xs font-black uppercase text-gray-500">Coach notes</p>
                <p className="mt-2 text-sm font-semibold text-gray-800">{currentFocusItem.exercise.notes}</p>
              </div>
            )}
          </section>

          <section className="space-y-5">
            <label className="block rounded-2xl bg-gray-100 p-5">
              <span className="block text-2xl font-black uppercase">KG</span>
              <input type="number" step="0.5" value={currentLog.weight} placeholder={currentPrescribedWeight} onChange={(event) => updateLog(currentFocusItem.set.id, { weight: event.target.value })} className={`${focusInputBaseClass} ${kgMatchesPrescription ? 'text-black/60' : 'text-[#000000]'}`} />
              {kgMatchesPrescription && <p className="mt-2 text-xs font-bold uppercase text-gray-500">Prescribed load</p>}
            </label>

            <label className="block rounded-2xl bg-gray-100 p-5">
              <span className="block text-2xl font-black uppercase">Reps</span>
              <input type="number" value={currentLog.reps} placeholder={currentPrescribedReps} onChange={(event) => updateLog(currentFocusItem.set.id, { reps: event.target.value })} className={`${focusInputBaseClass} ${repsMatchesPrescription ? 'text-black/60' : 'text-[#000000]'}`} />
              {repsMatchesPrescription && <p className="mt-2 text-xs font-bold uppercase text-gray-500">Prescribed reps</p>}
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block rounded-xl bg-gray-100 p-4">
                <span className="block text-xs font-black uppercase text-gray-500">RPE optional</span>
                <select value={currentLog.rpe} onChange={(event) => updateLog(currentFocusItem.set.id, { rpe: event.target.value })} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm font-bold text-black">
                  <option value="">No RPE</option>
                  {rpeGuide.map((item) => <option key={item.score} value={item.score}>{item.score}</option>)}
                </select>
                {selectedRpe && <p className="mt-2 text-xs font-semibold text-gray-600">{selectedRpe.repsLeft}</p>}
              </label>
              <label className="block rounded-xl bg-gray-100 p-4">
                <span className="block text-xs font-black uppercase text-gray-500">Set notes</span>
                <input value={currentLog.notes} onChange={(event) => updateLog(currentFocusItem.set.id, { notes: event.target.value })} placeholder="Optional" className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-black" />
              </label>
            </div>
          </section>

          {showFinishPanel && <Card className="mt-5 border-2 border-green-200 bg-green-50"><p className="text-sm font-black uppercase text-green-800">All sets are marked complete</p><p className="mt-1 text-sm text-gray-700">Add overall notes, then finish the workout.</p></Card>}

          <footer className="mt-auto space-y-4 pt-6">
            <button type="button" onClick={completeCurrentSet} className="w-full rounded-xl bg-[#FA0201] px-5 py-5 text-2xl font-black uppercase text-white hover:bg-red-700">Complete set</button>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setViewMode('full')} className="rounded-xl bg-gray-200 px-4 py-4 text-sm font-black uppercase text-black hover:bg-gray-300">Full workout view</button>
              <button type="button" onClick={() => setShowFinishPanel(true)} className="rounded-xl bg-gray-200 px-4 py-4 text-sm font-black uppercase text-black hover:bg-gray-300">Finish workout</button>
            </div>
          </footer>
        </main>

        {showFinishPanel && (
          <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-4 sm:items-center sm:justify-center">
            <form onSubmit={submitWorkout} className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
              <p className="text-lg font-black uppercase text-[#000000]">Finish workout</p>
              <p className="mt-1 text-sm text-gray-600">Submit only when the workout is finished. After submission, this workout locks for coach review.</p>
              <div className="mt-5 space-y-4">
                <label className="block"><span className="mb-2 block text-sm font-bold uppercase text-[#000000]">How did this session feel?</span><select value={sessionFeel} onChange={(event) => setSessionFeel(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-black"><option value="">Select a rating</option>{sessionFeelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <Textarea label="Overall workout notes" value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} />
                <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setShowFinishPanel(false)} className="rounded-lg border border-gray-300 px-4 py-3 text-sm font-bold uppercase text-black hover:bg-gray-50">Go back</button><Button type="submit" variant="primary" fullWidth disabled={saving} className="bg-[#FA0201] hover:bg-red-700 disabled:opacity-60">{saving ? 'Submitting...' : 'Submit'}</Button></div>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="FULL WORKOUT VIEW" subtitle={workout ? `Logging ${workout.title}` : undefined} />
      <main className="px-4 py-6 md:px-8 max-w-5xl mx-auto pb-24 md:pb-8">
        {error && <Card className="mb-6 border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}
        <div className="mb-6 flex flex-wrap gap-3"><button type="button" onClick={() => setViewMode('focus')} className="rounded-lg bg-[#FA0201] px-4 py-3 text-xs font-bold uppercase text-white hover:bg-red-700">Back to focus mode</button><button type="button" onClick={markAllSetsComplete} className="rounded-lg bg-black px-4 py-3 text-xs font-bold uppercase text-white hover:bg-gray-900">Mark all sets complete</button></div>
        {workout?.instructions && <Card className="mb-6"><p className="text-sm text-gray-700">{workout.instructions}</p></Card>}
        <form onSubmit={submitWorkout} className="space-y-8">
          {exercises.map((exercise) => <section key={exercise.id}><SectionHeader title={`${exercise.exercise_order}. ${exercise.exercise_name}`} accent /><Card className="space-y-4">{exercise.notes && <p className="text-sm text-gray-700">{exercise.notes}</p>}{setsByExercise[exercise.id]?.map((set) => { const log = logs[set.id] || emptyLog; const fullViewRpe = getRpeDescription(log.rpe); return <div key={set.id} className={`rounded-lg border p-4 ${log.completed ? 'border-gray-300 bg-gray-100 opacity-75' : 'border-gray-200 bg-white'}`}><div className="mb-4 flex items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase text-[#000000]">Set {set.set_order}</p><p className="text-xs text-gray-500">Target: {set.target_reps || '-'} reps {set.target_weight_kg ? `@ ${set.target_weight_kg}kg` : ''}</p></div><label className="flex items-center gap-2 text-xs font-bold uppercase text-gray-600"><input type="checkbox" checked={log.completed} onChange={(event) => updateLog(set.id, { completed: event.target.checked })} />Complete</label></div><div className="grid grid-cols-1 gap-4 md:grid-cols-4"><Input label="Kg" type="number" step="0.5" value={log.weight} placeholder={set.target_weight_kg?.toString() || ''} onChange={(event) => updateLog(set.id, { weight: event.target.value })} /><Input label="Reps" type="number" value={log.reps} placeholder={set.target_reps || ''} onChange={(event) => updateLog(set.id, { reps: event.target.value })} /><div><label className="mb-2 block text-sm font-semibold uppercase">RPE</label><select value={log.rpe} onChange={(event) => updateLog(set.id, { rpe: event.target.value })} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black"><option value="">Select RPE</option>{rpeGuide.map((item) => <option key={item.score} value={item.score}>{item.score}</option>)}</select>{fullViewRpe && <p className="mt-2 text-xs font-semibold text-gray-600">{fullViewRpe.repsLeft}</p>}</div><Input label="Notes" value={log.notes} onChange={(event) => updateLog(set.id, { notes: event.target.value })} /></div></div>; })}</Card></section>)}
          <Card className="space-y-5"><div><label className="mb-2 block text-sm font-semibold uppercase">How did this session feel?</label><select value={sessionFeel} onChange={(event) => setSessionFeel(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-black"><option value="">Select a rating</option>{sessionFeelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><Textarea label="Overall workout notes" value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} /><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Submit only when the workout is finished. After submission, this workout locks and your coach reviews it.</div></Card>
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={saving} className="bg-[#FA0201] hover:bg-red-700 disabled:opacity-60">{saving ? 'SUBMITTING...' : 'SUBMIT WORKOUT'}</Button>
        </form>
      </main>
    </div>
  );
}
