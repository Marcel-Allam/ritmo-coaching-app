'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Textarea } from '@/components/ui/textarea';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ReviewStatus = 'new' | 'reviewed' | 'needs_feedback' | 'needs_action' | 'flagged' | 'resolved';
type Outcome = 'above' | 'matched' | 'caution' | 'below';

type ClientRecord = { id: string; full_name: string; email: string | null };
type WorkoutSessionRecord = {
  id: string;
  client_id: string;
  program_workout_id: string;
  completed_at: string | null;
  review_status: ReviewStatus;
  client_notes: string | null;
  coach_note: string | null;
};
type ProgramWorkoutRecord = { id: string; title: string; instructions: string | null };
type ProgramExerciseRecord = { id: string; exercise_order: number; exercise_name: string; notes: string | null };
type ProgramSetRecord = {
  id: string;
  exercise_id: string;
  set_order: number;
  target_reps: string | null;
  target_weight_kg: number | null;
  target_rpe: number | null;
  notes: string | null;
};
type PerformedSetRecord = {
  id: string;
  program_exercise_id: string;
  program_set_id: string | null;
  set_order: number;
  actual_weight_kg: number | null;
  actual_reps: number | null;
  actual_rpe: number | null;
  completed: boolean;
  notes: string | null;
};

type FeedbackForm = {
  win: string;
  improve: string;
  adjustment: string;
};

const emptyFeedback: FeedbackForm = { win: '', improve: '', adjustment: '' };
const EXERCISE_NOTES_MARKER = '[RITMO_EXERCISE_NOTES]';

const formatDateTime = (value: string | null) => {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const parseTargetReps = (value: string | null) => {
  if (!value) return { min: null as number | null, max: null as number | null };
  const rangeMatch = value.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  const singleMatch = value.match(/\d+/);
  if (!singleMatch) return { min: null, max: null };
  const parsed = Number(singleMatch[0]);
  return { min: parsed, max: parsed };
};

const getStatusVariant = (status: ReviewStatus) => {
  if (status === 'reviewed' || status === 'resolved') return 'success';
  if (status === 'flagged') return 'danger';
  if (status === 'needs_feedback' || status === 'needs_action') return 'warning';
  return 'default';
};

const outcomeClasses: Record<Outcome, string> = {
  above: 'border-green-200 bg-green-50 text-green-900',
  matched: 'border-gray-200 bg-white text-[#000000]',
  caution: 'border-amber-200 bg-amber-50 text-amber-900',
  below: 'border-red-200 bg-red-50 text-red-900',
};

const outcomeLabel: Record<Outcome, string> = {
  above: 'Above target',
  matched: 'On target',
  caution: 'Watch',
  below: 'Under target',
};

const analyseSet = (target: ProgramSetRecord, actual?: PerformedSetRecord) => {
  const reasons: string[] = [];
  const targetReps = parseTargetReps(target.target_reps);
  let hasPositive = false;
  let hasCaution = false;
  let hasNegative = false;

  if (!actual) return { outcome: 'below' as Outcome, reasons: ['No actual set log found.'] };

  if (!actual.completed) {
    hasNegative = true;
    reasons.push('Set marked incomplete.');
  }

  if (target.target_weight_kg !== null && target.target_weight_kg !== undefined && actual.actual_weight_kg !== null && actual.actual_weight_kg !== undefined) {
    const loadDifference = Number((actual.actual_weight_kg - target.target_weight_kg).toFixed(1));
    if (loadDifference < 0) {
      hasNegative = true;
      reasons.push(`${Math.abs(loadDifference)}kg under prescribed load.`);
    }
    if (loadDifference > 0) {
      hasPositive = true;
      reasons.push(`${loadDifference}kg above prescribed load.`);
    }
  }

  if (targetReps.min !== null && actual.actual_reps !== null && actual.actual_reps !== undefined) {
    if (actual.actual_reps < targetReps.min) {
      hasNegative = true;
      reasons.push(`${targetReps.min - actual.actual_reps} rep${targetReps.min - actual.actual_reps === 1 ? '' : 's'} under target.`);
    }
    if (targetReps.max !== null && actual.actual_reps > targetReps.max) {
      hasPositive = true;
      reasons.push(`${actual.actual_reps - targetReps.max} rep${actual.actual_reps - targetReps.max === 1 ? '' : 's'} above target.`);
    }
  }

  if (target.target_rpe !== null && target.target_rpe !== undefined && actual.actual_rpe !== null && actual.actual_rpe !== undefined) {
    const rpeDifference = Number((actual.actual_rpe - target.target_rpe).toFixed(1));
    if (rpeDifference >= 1) {
      hasCaution = true;
      reasons.push(`RPE ${rpeDifference} above target.`);
    }
    if (rpeDifference <= -1 && !hasNegative) {
      hasPositive = true;
      reasons.push(`RPE ${Math.abs(rpeDifference)} below target.`);
    }
  }

  if (actual.notes?.trim()) reasons.push('Client added a set note.');

  if (hasNegative) return { outcome: 'below' as Outcome, reasons };
  if (hasCaution) return { outcome: 'caution' as Outcome, reasons };
  if (hasPositive) return { outcome: 'above' as Outcome, reasons };
  return { outcome: 'matched' as Outcome, reasons: reasons.length ? reasons : ['Matched the planned work.'] };
};

const formatActualSet = (actual?: PerformedSetRecord) => {
  if (!actual) return 'No actual data';
  const weight = actual.actual_weight_kg !== null && actual.actual_weight_kg !== undefined ? `${actual.actual_weight_kg}kg` : 'No KG';
  const reps = actual.actual_reps !== null && actual.actual_reps !== undefined ? `${actual.actual_reps} reps` : 'No reps';
  const rpe = actual.actual_rpe !== null && actual.actual_rpe !== undefined ? `RPE ${actual.actual_rpe}` : 'No RPE';
  return `${weight} × ${reps} @ ${rpe}`;
};

export default function CoachWorkoutReviewPage() {
  const params = useParams();
  const clientId = params.id as string;
  const sessionId = params.sessionId as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [session, setSession] = useState<WorkoutSessionRecord | null>(null);
  const [workout, setWorkout] = useState<ProgramWorkoutRecord | null>(null);
  const [exercises, setExercises] = useState<ProgramExerciseRecord[]>([]);
  const [programSets, setProgramSets] = useState<ProgramSetRecord[]>([]);
  const [performedSets, setPerformedSets] = useState<PerformedSetRecord[]>([]);
  const [coachNote, setCoachNote] = useState('');
  const [feedback, setFeedback] = useState<FeedbackForm>(emptyFeedback);
  const [exerciseNotes, setExerciseNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadReview = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data: sessionData, error: sessionError } = await supabase
      .from('workout_sessions')
      .select('id, client_id, program_workout_id, completed_at, review_status, client_notes, coach_note')
      .eq('id', sessionId)
      .eq('client_id', clientId)
      .single();

    if (sessionError || !sessionData) {
      setError(sessionError?.message || 'Workout session not found.');
      setLoading(false);
      return;
    }

    const loadedSession = sessionData as WorkoutSessionRecord;
    const [clientResult, workoutResult, performedResult] = await Promise.all([
      supabase.from('clients').select('id, full_name, email').eq('id', clientId).single(),
      supabase.from('program_workouts').select('id, title, instructions').eq('id', loadedSession.program_workout_id).single(),
      supabase
        .from('performed_sets')
        .select('id, program_exercise_id, program_set_id, set_order, actual_weight_kg, actual_reps, actual_rpe, completed, notes')
        .eq('session_id', sessionId)
        .order('set_order', { ascending: true }),
    ]);

    if (clientResult.error || workoutResult.error || performedResult.error) {
      setError(clientResult.error?.message || workoutResult.error?.message || performedResult.error?.message || 'Could not load workout review data.');
      setLoading(false);
      return;
    }

    const { data: exerciseData, error: exerciseError } = await supabase
      .from('program_exercises')
      .select('id, exercise_order, exercise_name, notes')
      .eq('workout_id', loadedSession.program_workout_id)
      .order('exercise_order', { ascending: true });

    if (exerciseError) {
      setError(exerciseError.message);
      setLoading(false);
      return;
    }

    const loadedExercises = (exerciseData ?? []) as ProgramExerciseRecord[];
    const exerciseIds = loadedExercises.map((exercise) => exercise.id);
    const setResult = exerciseIds.length
      ? await supabase
          .from('program_sets')
          .select('id, exercise_id, set_order, target_reps, target_weight_kg, target_rpe, notes')
          .in('exercise_id', exerciseIds)
          .order('set_order', { ascending: true })
      : { data: [], error: null };

    if (setResult.error) {
      setError(setResult.error.message);
      setLoading(false);
      return;
    }

    setSession(loadedSession);
    setClient(clientResult.data as ClientRecord);
    setWorkout(workoutResult.data as ProgramWorkoutRecord);
    setPerformedSets((performedResult.data ?? []) as PerformedSetRecord[]);
    setExercises(loadedExercises);
    setProgramSets((setResult.data ?? []) as ProgramSetRecord[]);
    setCoachNote(loadedSession.coach_note || '');
    setLoading(false);
  };

  useEffect(() => {
    loadReview();
  }, [clientId, sessionId]);

  const setsByExercise = useMemo(() => {
    return exercises.reduce<Record<string, ProgramSetRecord[]>>((acc, exercise) => {
      acc[exercise.id] = programSets.filter((set) => set.exercise_id === exercise.id).sort((a, b) => a.set_order - b.set_order);
      return acc;
    }, {});
  }, [exercises, programSets]);

  const performedByProgramSetId = useMemo(() => {
    return performedSets.reduce<Record<string, PerformedSetRecord>>((acc, set) => {
      if (set.program_set_id) acc[set.program_set_id] = set;
      return acc;
    }, {});
  }, [performedSets]);

  const updateExerciseNote = (exerciseId: string, note: string) => {
    setExerciseNotes((current) => ({ ...current, [exerciseId]: note }));
  };

  const saveReviewStatus = async (nextStatus: ReviewStatus) => {
    if (!isSupabaseConfigured || !session) return;
    setSaving(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const [sessionUpdate, submissionUpdate] = await Promise.all([
      supabase.from('workout_sessions').update({ review_status: nextStatus, coach_note: coachNote.trim() || null }).eq('id', session.id),
      supabase
        .from('task_submissions')
        .update({ review_status: nextStatus, coach_note: coachNote.trim() || null, followup_required: nextStatus === 'needs_action' || nextStatus === 'flagged' })
        .eq('client_id', clientId)
        .eq('submission_type', 'workout_session')
        .eq('answer_text', session.id),
    ]);

    if (sessionUpdate.error || submissionUpdate.error) {
      setError(sessionUpdate.error?.message || submissionUpdate.error?.message || 'Could not save review status.');
      setSaving(false);
      return;
    }

    setSession((current) => (current ? { ...current, review_status: nextStatus, coach_note: coachNote.trim() || null } : current));
    setMessage(`Review saved as ${nextStatus.replaceAll('_', ' ')}.`);
    setSaving(false);
  };

  const sendClientFeedback = async () => {
    if (!isSupabaseConfigured || !client) return;

    const win = feedback.win.trim();
    const improve = feedback.improve.trim();
    const adjustment = feedback.adjustment.trim();
    const visibleExerciseNotes = exercises
      .map((exercise) => ({ exerciseName: exercise.exercise_name, note: (exerciseNotes[exercise.id] || '').trim() }))
      .filter((item) => item.note.length > 0);
    const exerciseNotesBlock = visibleExerciseNotes.length
      ? `${EXERCISE_NOTES_MARKER}\n${visibleExerciseNotes.map((item) => `- ${item.exerciseName}: ${item.note}`).join('\n')}`
      : '';

    if (!win && !improve && !adjustment && !exerciseNotesBlock) {
      setError('Add feedback or at least one exercise note before sending.');
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: feedbackError } = await supabase.from('feedback_notes').insert({
      client_id: client.id,
      feedback_date: new Date().toISOString().slice(0, 10),
      main_win: win || null,
      main_focus: improve || null,
      agreed_action: adjustment || null,
      plan_change: exerciseNotesBlock || null,
      client_visible: true,
    });

    if (feedbackError) {
      setError(feedbackError.message);
      setSaving(false);
      return;
    }

    await saveReviewStatus('reviewed');
    setFeedback(emptyFeedback);
    setExerciseNotes({});
    setMessage('Client feedback sent and workout marked reviewed.');
    setSaving(false);
  };

  if (loading) return <div className="p-6 md:p-8"><Card>Loading workout review...</Card></div>;
  if (error && !session) return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Workout Review</h1>
          <p className="mt-1 text-sm text-gray-600">{client?.full_name}{client?.email ? ` • ${client.email}` : ''}</p>
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">{workout?.title || 'Workout'} • Completed {formatDateTime(session?.completed_at || null)}</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          {session && <Badge variant={getStatusVariant(session.review_status) as any}>{session.review_status.replaceAll('_', ' ')}</Badge>}
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
        </div>
      </div>

      {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      <section>
        <SectionHeader title="CLIENT PERFORMANCE" accent />
        <Card className="space-y-6">
          {session?.client_notes && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase text-gray-500">Client workout notes</p>
              <p className="mt-2 text-sm text-gray-700">{session.client_notes}</p>
            </div>
          )}

          {exercises.map((exercise) => (
            <div key={exercise.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-bold uppercase text-[#000000]">{exercise.exercise_order}. {exercise.exercise_name}</p>
              {exercise.notes && <p className="mt-1 text-xs text-gray-600">{exercise.notes}</p>}
              <div className="mt-4 space-y-3">
                {(setsByExercise[exercise.id] || []).map((set) => {
                  const actual = performedByProgramSetId[set.id] || performedSets.find((performed) => performed.program_exercise_id === exercise.id && performed.set_order === set.set_order);
                  const analysis = analyseSet(set, actual);
                  return (
                    <div key={set.id} className={`rounded-lg border p-4 ${outcomeClasses[analysis.outcome]}`}>
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase opacity-70">Set {set.set_order}</p>
                          <p className="mt-1 text-lg font-black">{formatActualSet(actual)}</p>
                        </div>
                        <span className="rounded bg-white/70 px-2 py-1 text-xs font-bold uppercase">{outcomeLabel[analysis.outcome]}</span>
                      </div>
                      <div className="mt-3 space-y-1">
                        {analysis.reasons.map((reason) => <p key={reason} className="text-xs font-semibold opacity-80">{reason}</p>)}
                        {actual?.notes && <p className="text-xs opacity-80"><span className="font-bold">Client note:</span> {actual.notes}</p>}
                        {set.notes && <p className="text-xs opacity-70"><span className="font-bold">Prescribed note:</span> {set.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
                <Textarea
                  label="Exercise note to client"
                  value={exerciseNotes[exercise.id] || ''}
                  onChange={(event) => updateExerciseNote(exercise.id, event.target.value)}
                  placeholder={`Optional note for ${exercise.exercise_name}. If left blank, the client will not see a note section for this exercise.`}
                />
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <SectionHeader title="COACH REVIEW" accent />
        <Card className="space-y-6">
          <Textarea label="Coach-only note" value={coachNote} onChange={(event) => setCoachNote(event.target.value)} placeholder="Private record only. Not shown to the client." />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <button type="button" disabled={saving} onClick={() => saveReviewStatus('reviewed')} className="rounded-lg bg-black px-4 py-3 text-sm font-bold uppercase text-white hover:bg-gray-900 disabled:opacity-60">Mark reviewed</button>
            <button type="button" disabled={saving} onClick={() => saveReviewStatus('needs_feedback')} className="rounded-lg bg-[#FA0201] px-4 py-3 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60">Needs feedback</button>
            <button type="button" disabled={saving} onClick={() => saveReviewStatus('needs_action')} className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-bold uppercase text-[#000000] hover:bg-gray-100 disabled:opacity-60">Needs action</button>
            <button type="button" disabled={saving} onClick={() => saveReviewStatus('flagged')} className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold uppercase text-red-700 hover:bg-red-100 disabled:opacity-60">Flag issue</button>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="CLIENT-FACING FEEDBACK" accent />
        <Card className="space-y-5">
          <p className="text-sm text-gray-600">Only fields with text will be sent to the client. Empty fields are ignored.</p>
          <Textarea label="Win" value={feedback.win} onChange={(event) => setFeedback((current) => ({ ...current, win: event.target.value }))} placeholder="What went well in this workout?" />
          <Textarea label="What to improve" value={feedback.improve} onChange={(event) => setFeedback((current) => ({ ...current, improve: event.target.value }))} placeholder="What should the client tighten up next time?" />
          <Textarea label="Adjustment" value={feedback.adjustment} onChange={(event) => setFeedback((current) => ({ ...current, adjustment: event.target.value }))} placeholder="What changes now? Keep load, increase, reduce, adjust technique, or change focus." />

          <button type="button" disabled={saving} onClick={sendClientFeedback} className="w-full rounded-lg bg-[#FA0201] px-5 py-3 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60">
            {saving ? 'Saving...' : 'Send feedback to client'}
          </button>
        </Card>
      </section>
    </div>
  );
}
