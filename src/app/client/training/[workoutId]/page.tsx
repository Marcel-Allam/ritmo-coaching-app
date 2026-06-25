'use client';

import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type NumericValue = number | string | null;

type ClientRecord = { id: string; full_name: string };
type WorkoutRecord = { id: string; title: string; instructions: string | null };
type CompletedSessionRecord = { id: string; completed_at: string | null; review_status: string; program_week: number | null };
type ExerciseRecord = { id: string; exercise_order: number; exercise_name: string; notes: string | null; exercise_role: string | null };

type PrescribedSetRecord = {
  id: string;
  program_set_id: string;
  exercise_id: string;
  week_number: number;
  current_program_week: number;
  is_current_week: boolean;
  set_order: number;
  target_reps: string | null;
  target_percent_1rm: NumericValue;
  target_rpe: NumericValue;
  target_rir: NumericValue;
  effective_target_weight_kg: NumericValue;
  target_load_source: string;
  notes: string | null;
};

type SetLog = { weight: string; reps: string; rpe: string; completed: boolean; notes: string };
type ViewMode = 'focus' | 'full';

const emptyLog: SetLog = { weight: '', reps: '', rpe: '', completed: false, notes: '' };
const numberOrNull = (value: string) => (value.trim() ? Number(value) : null);
const numericValueOrNull = (value: NumericValue) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const numberOrFallback = (value: string, fallback: NumericValue) => (value.trim() ? Number(value) : numericValueOrNull(fallback));
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
  if (source === 'coach_override') return 'Coach override';
  if (source === 'calculated_from_percent_1rm') return 'Calculated from %1RM';
  if (source === 'missing_calibration') return 'Missing calibration';
  if (source === 'not_percent_based') return 'Not % based';
  return source.replaceAll('_', ' ');
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
const prescribedWeightValue = (set: PrescribedSetRecord) => {
  const weight = numericValueOrNull(set.effective_target_weight_kg);
  return weight === null ? '' : String(weight);
};
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
  const [displayWeek, setDisplayWeek] = useState<number | null>(null);
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
        .select('program_set_id, exercise_id, week_number, current_program_week, is_current_week, set_order, target_reps, target_percent_1rm, target_rpe, target_rir, effective_target_weight_kg, target_load_source, notes')
        .eq('workout_id', workoutId)
        .order('week_number', { ascending: true })
        .order('exercise_name', { ascending: true })
        .order('set_order', { ascending: true });

      if (resolvedSetError) {
        setError(resolvedSetError.message);
        setLoading(false);
        return;
      }

      const allResolvedSets = ((resolvedSetData ?? []) as Omit<PrescribedSetRecord, 'id'>[]).map((set) => ({
        ...set,
        id: set.program_set_id,
      }));
      const currentWeekSets = allResolvedSets.filter((set) => set.is_current_week);
      const fallbackWeekOneSets = allResolvedSets.filter((set) => set.week_number === 1);
      const loadedSets = currentWeekSets.length > 0 ? currentWeekSets : fallbackWeekOneSets;
      const resolvedDisplayWeek = loadedSets[0]?.week_number ?? allResolvedSets[0]?.week_number ?? null;

      if (resolvedDisplayWeek !== null) {
        const { data: existingSessionData, error: existingSessionError } = await supabase
          .from('workout_sessions')
          .select('id, completed_at, review_status, program_week')
          .eq('client_id', linkedClient.id)
          .eq('program_workout_id', workoutId)
          .eq('status', 'completed')
          .eq('program_week', resolvedDisplayWeek)
          .order('completed_at', { ascending: false })
          .limit(1);

        if (existingSessionError) {
          setError(existingSessionError.message);
          setLoading(false);
          return;
        }

        const existingSession = ((existingSessionData ?? []) as CompletedSessionRecord[])[0] ?? null;
        if (existingSession) {
          setWorkout(workoutData as WorkoutRecord);
          setCompletedSession(existingSession);
          setDisplayWeek(resolvedDisplayWeek);
          setLoading(false);
          return;
        }
      }

      const initialLogs = loadedSets.reduce<Record<string, SetLog>>((acc, set) => {
        acc[set.id] = { ...emptyLog, weight: prescribedWeightValue(set), reps: prescribedRepsValue(set) };
        return acc;
      }, {});

      setWorkout(workoutData as WorkoutRecord);
      setExercises((exerciseData ?? []) as ExerciseRecord[]);
      setSets(loadedSets);
      setDisplayWeek(resolvedDisplayWeek);
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
  const canGoPrevious = focusSetIndex > 0;
  const canGoNext = focusSetIndex < orderedFocusSets.length - 1;

  const updateLog = (setId: string, updates: Partial<SetLog>) => {
    setLogs((current) => ({ ...current, [setId]: { ...(current[setId] || emptyLog), ...updates } }));
  };

  const goToPreviousSet = () => {
    setShowFinishPanel(false);
    setFocusSetIndex((current) => Math.max(0, current - 1));
  };

  const goToNextSet = () => {
    setShowFinishPanel(false);
    if (canGoNext) {
      setFocusSetIndex((current) => Math.min(orderedFocusSets.length - 1, current + 1));
      return;
    }
    setShowFinishPanel(true);
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

    const confirmed = window.confirm(`Submit ${workout.title}${displayWeek ? ` for Week ${displayWeek}` : ''}? You will not be able to submit this same week again.`);
    if (!confirmed) return;

    setSaving(true);
    setError(null);
    const supabase = createClient();

    let existingSessionQuery = supabase
      .from('workout_sessions')
      .select('id, completed_at, review_status, program_week')
      .eq('client_id', client.id)
      .eq('program_workout_id', workout.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(1);

    existingSessionQuery = displayWeek === null
      ? existingSessionQuery.is('program_week', null)
      : existingSessionQuery.eq('program_week', displayWeek);

    const { data: existingSessionData, error: existingSessionError } = await existingSessionQuery;

    if (existingSessionError) {
      setError(existingSessionError.message);
      setSaving(false);
      return;
    }

    const existingSession = ((existingSessionData ?? []) as CompletedSessionRecord[])[0] ?? null;
    if (existingSession) {
      setCompletedSession(existingSession);
      setError(`This workout has already been submitted for Week ${existingSession.program_week ?? 'unknown'}, so it is locked to prevent duplicate logs for the same week.`);
      setSaving(false);
      return;
    }

    const sessionFeelLabel = sessionFeelOptions.find((option) => option.value === sessionFeel)?.label || '';
    const combinedSessionNotes = [sessionFeelLabel ? `Session felt: ${sessionFeelLabel}` : null, sessionNotes.trim() || null].filter(Boolean).join('\n\n') || null;

    const { data: sessionData, error: sessionError } = await supabase.from('workout_sessions').insert({ client_id: client.id, program_workout_id: workout.id, program_week: displayWeek, status: 'completed', completed_at: new Date().toISOString(), review_status: 'new', client_notes: combinedSessionNotes }).select('id').single();

    if (sessionError || !sessionData) {
      setError(sessionError?.message || 'Could not submit workout.');
      setSaving(false);
      return;
    }

    const sessionId = (sessionData as { id: string }).id;
    const rows = sets.map((set) => ({
      session_id: sessionId,
      program_exercise_id: set.exercise_id,
      program_set_id: set.program_set_id,
      set_order: set.set_order,
      actual_weight_kg: numberOrFallback(logs[set.id]?.weight || '', set.effective_target_weight_kg),
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
        <PageHeader title="WORKOUT COMPLETED" subtitle={workout ? `${workout.title}${displayWeek ? ` • Week ${displayWeek}` : ''} has already been submitted.` : undefined} />
        <main className="mx-auto max-w-3xl px-4 py-6 md:px-8">
          <Card className="border-2 border-green-200 bg-green-50">
            <p className="text-sm font-black uppercase text-green-800">Submission locked</p>
            <h2 className="mt-2 text-2xl font-black uppercase text-[#000000]">This workout is already complete for this week</h2>
            <p className="mt-2 text-sm text-gray-700">Completed: {formatDateTime(completedSession.completed_at)}. Your coach can now review the performance and send feedback.</p>
            <p className="mt-1 text-xs font-bold uppercase text-gray-500">Programme week: {completedSession.program_week ?? displayWeek ?? 'unknown'} • Review status: {completedSession.review_status.replaceAll('_', ' ')}</p>
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
              <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Focus mode{displayWeek ? ` • Week ${displayWeek}` : ''}</p>
              <h1 className="mt-1 text-3xl font-black uppercase leading-tight tracking-tight">{currentFocusItem.exercise.exercise_name}</h1>
            </div>
            <Link href="/client/training" className="rounded-lg bg-[#FA0201] px-4 py-3 text-center text-xs font-black uppercase text-white hover:bg-red-700">Cancel<br />workout</Link>
          </header>

          <section className="py-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase text-gray-500">Exercise {currentFocusItem.exercise.exercise_order} of {exercises.length}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <button type="button" onClick={goToPreviousSet} disabled={!canGoPrevious} className="rounded-lg border-2 border-black px-3 py-2 text-xs font-black uppercase text-black disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-300">← Previous set</button>
                  <h2 className="text-5xl font-black uppercase tracking-tight">Set {currentSetPositionInExercise}</h2>
                  <button type="button" onClick={goToNextSet} className="rounded-lg border-2 border-black px-3 py-2 text-xs font-black uppercase text-black hover:bg-black hover:text-white">Next set →</button>
                </div>
                <p className="mt-1 text-sm font-bold uppercase text-gray-500">{completionStats.completedCount}/{completionStats.totalCount} sets complete</p>
              </div>
              <div className="rounded-xl bg-gray-100 px-4 py-3 text-right">
                <p className="text-xs font-bold uppercase text-gray-500">Target</p>
                <p className="text-sm font-black">{currentFocusItem.set.target_reps || '-'} reps</p>
                <p className="text-sm font-black">{formatKg(currentFocusItem.set.effective_target_weight_kg)}</p>
                <p className="mt-1 text-[10px] font-black uppercase text-gray-500">{formatSourceLabel(currentFocusItem.set.target_load_source)}</p>
                {currentFocusItem.set.target_percent_1rm && <p className="text-[10px] font-black uppercase text-gray-500">{formatPercent(currentFocusItem.set.target_percent_1rm)}</p>}
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
              <input type="number" step="2.5" value={currentLog.weight} placeholder={currentPrescribedWeight} onChange={(event) => updateLog(currentFocusItem.set.id, { weight: event.target.value })} className={`${focusInputBaseClass} ${kgMatchesPrescription ? 'text-black/60' : 'text-[#000000]'}`} />
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
                <textarea value={currentLog.notes} onChange={(event) => updateLog(currentFocusItem.set.id, { notes: event.target.value })} placeholder="Optional" rows={4} className="mt-2 min-h-28 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-3 text-sm text-black" />
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
              <p className="mt-1 text-sm text-gray-600">Submit only when the workout is finished. After submission, this week locks for coach review.</p>
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
      <PageHeader title="FULL WORKOUT VIEW" subtitle={workout ? `Logging ${workout.title}${displayWeek ? ` • Week ${displayWeek}` : ''}` : undefined} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6 md:px-8 md:pb-8">
        {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

        <div className="sticky top-0 z-20 -mx-4 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-xl md:border md:px-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Full workout view{displayWeek ? ` • Week ${displayWeek}` : ''}</p>
              <h1 className="text-2xl font-black uppercase tracking-tight text-[#000000]">{workout?.title}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setViewMode('focus')} className="rounded-lg bg-[#FA0201] px-4 py-3 text-xs font-black uppercase text-white hover:bg-red-700">Back to focus</button>
              <button type="button" onClick={markAllSetsComplete} className="rounded-lg bg-black px-4 py-3 text-xs font-black uppercase text-white hover:bg-gray-900">Mark all complete</button>
              <button type="button" onClick={() => setShowFinishPanel(true)} className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-xs font-black uppercase text-[#000000] hover:bg-gray-50">Finish</button>
            </div>
          </div>
        </div>

        {workout?.instructions && <Card className="py-4"><p className="text-sm font-semibold text-gray-700">{workout.instructions}</p></Card>}

        <form onSubmit={submitWorkout} className="space-y-5">
          {exercises.map((exercise) => {
            const exerciseSets = setsByExercise[exercise.id] || [];
            return (
              <Card key={exercise.id} className="overflow-hidden p-0">
                <div className="flex flex-col gap-2 border-b border-gray-200 bg-gray-50 p-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-black uppercase tracking-tight text-[#000000]">{exercise.exercise_name}</h2>
                      {exercise.exercise_role === 'main_lift' && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black uppercase text-[#FA0201]">Main lift</span>}
                    </div>
                    {exercise.notes && <p className="mt-1 text-sm font-semibold text-gray-700">{exercise.notes}</p>}
                  </div>
                  <p className="w-fit rounded-full bg-gray-200 px-3 py-1 text-xs font-black uppercase text-[#000000]">{exerciseSets.length} set{exerciseSets.length === 1 ? '' : 's'}</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                    <thead className="bg-white text-xs font-black uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-3">Done</th>
                        <th className="px-4 py-3">Set</th>
                        <th className="px-4 py-3">Kg</th>
                        <th className="px-4 py-3">Reps</th>
                        <th className="px-4 py-3">RPE</th>
                        <th className="px-4 py-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exerciseSets.map((set) => {
                        const log = logs[set.id] || emptyLog;
                        const fullViewRpe = getRpeDescription(log.rpe);
                        const prescribedWeight = prescribedWeightValue(set);
                        return (
                          <tr key={set.id} className={`border-t border-gray-100 ${log.completed ? 'bg-green-50/70' : 'odd:bg-gray-50 even:bg-white'}`}>
                            <td className="px-4 py-3 align-top">
                              <input type="checkbox" checked={log.completed} onChange={(event) => updateLog(set.id, { completed: event.target.checked })} className="h-5 w-5 accent-[#FA0201]" />
                            </td>
                            <td className="px-4 py-3 align-top">
                              <p className="font-black uppercase text-[#000000]">Set {set.set_order}</p>
                              <p className="mt-1 text-xs font-semibold text-gray-500">Target: {set.target_reps || '-'} reps{prescribedWeight ? ` @ ${prescribedWeight}kg` : ''}{set.target_percent_1rm ? ` (${formatPercent(set.target_percent_1rm)})` : ''}</p>
                              <p className="mt-1 text-[10px] font-black uppercase text-gray-400">{formatSourceLabel(set.target_load_source)}</p>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <input type="number" step="2.5" value={log.weight} placeholder={prescribedWeight} onChange={(event) => updateLog(set.id, { weight: event.target.value })} className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-black" />
                            </td>
                            <td className="px-4 py-3 align-top">
                              <input type="number" value={log.reps} placeholder={set.target_reps || ''} onChange={(event) => updateLog(set.id, { reps: event.target.value })} className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-black" />
                            </td>
                            <td className="px-4 py-3 align-top">
                              <select value={log.rpe} onChange={(event) => updateLog(set.id, { rpe: event.target.value })} className="w-28 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-black">
                                <option value="">RPE</option>
                                {rpeGuide.map((item) => <option key={item.score} value={item.score}>{item.score}</option>)}
                              </select>
                              {fullViewRpe && <p className="mt-1 text-[11px] font-semibold text-gray-500">{fullViewRpe.repsLeft}</p>}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <input value={log.notes} onChange={(event) => updateLog(set.id, { notes: event.target.value })} placeholder="Optional" className="w-48 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}

          <Card className="space-y-4 p-4">
            <div>
              <label className="mb-2 block text-sm font-black uppercase text-[#000000]">How did this session feel?</label>
              <select value={sessionFeel} onChange={(event) => setSessionFeel(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-3 text-black">
                <option value="">Select a rating</option>
                {sessionFeelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <Textarea label="Overall workout notes" value={sessionNotes} onChange={(event) => setSessionNotes(event.target.value)} />
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">Submit only when the workout is finished. After submission, this week locks and your coach reviews it.</div>
          </Card>

          <Button type="submit" variant="primary" size="lg" fullWidth disabled={saving} className="bg-[#FA0201] hover:bg-red-700 disabled:opacity-60">{saving ? 'SUBMITTING...' : 'SUBMIT WORKOUT'}</Button>
        </form>
      </main>
    </div>
  );
}
