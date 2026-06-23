'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Textarea } from '@/components/ui/textarea';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ReviewStatus = 'new' | 'reviewed' | 'needs_feedback' | 'needs_action' | 'flagged' | 'resolved';
type Outcome = 'above' | 'matched' | 'caution' | 'below' | 'missing';

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
type ProgramExerciseRecord = {
  id: string;
  exercise_order: number;
  exercise_name: string;
  notes: string | null;
  exercise_catalogue_id: string | null;
};
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

const getMissingFields = (actual?: PerformedSetRecord) => {
  if (!actual) return ['the full set log'];

  const missingFields: string[] = [];
  if (actual.actual_weight_kg === null || actual.actual_weight_kg === undefined) missingFields.push('load');
  if (actual.actual_reps === null || actual.actual_reps === undefined) missingFields.push('reps');
  if (actual.actual_rpe === null || actual.actual_rpe === undefined) missingFields.push('RPE');
  return missingFields;
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
  missing: 'border-blue-300 bg-blue-50 text-blue-900',
};

const outcomeLabel: Record<Outcome, string> = {
  above: 'Above target',
  matched: 'On target',
  caution: 'Watch',
  below: 'Under target',
  missing: 'Missing info',
};

const analyseSet = (target: ProgramSetRecord, actual?: PerformedSetRecord) => {
  const missingFields = getMissingFields(actual);
  if (missingFields.length > 0) {
    return {
      outcome: 'missing' as Outcome,
      reasons: [`Missing ${missingFields.join(', ')}.`],
    };
  }

  const reasons: string[] = [];
  const targetReps = parseTargetReps(target.target_reps);
  let hasPositive = false;
  let hasCaution = false;
  let hasNegative = false;

  if (!actual) return { outcome: 'missing' as Outcome, reasons: ['Missing the full set log.'] };

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
  const router = useRouter();
  const clientId = params.id as string;
  const sessionId = params.sessionId as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [session, setSession] = useState<WorkoutSessionRecord | null>(null);
  const [workout, setWorkout] = useState<ProgramWorkoutRecord | null>(null);
  const [exercises, setExercises] = useState<ProgramExerciseRecord[]>([]);
  const [programSets, setProgramSets] = useState<ProgramSetRecord[]>([]);
  const [performedSets, setPerformedSets] = useState<PerformedSetRecord[]>([]);
  const [feedbackText, setFeedbackText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
      .select('id, exercise_order, exercise_name, notes, exercise_catalogue_id')
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

  const sendClientFeedback = async () => {
    if (!isSupabaseConfigured || !client || !session) return;

    const feedback = feedbackText.trim();
    if (!feedback) {
      setError('Add feedback before sending.');
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const [feedbackInsert, sessionUpdate, submissionUpdate] = await Promise.all([
      supabase.from('feedback_notes').insert({
        client_id: client.id,
        feedback_date: new Date().toISOString().slice(0, 10),
        main_win: feedback,
        main_focus: null,
        agreed_action: null,
        plan_change: null,
        client_visible: true,
      }),
      supabase.from('workout_sessions').update({ review_status: 'reviewed' }).eq('id', session.id),
      supabase
        .from('task_submissions')
        .update({ review_status: 'reviewed', coach_note: feedback, followup_required: false })
        .eq('client_id', clientId)
        .eq('submission_type', 'workout_session')
        .eq('answer_text', session.id),
    ]);

    if (feedbackInsert.error || sessionUpdate.error || submissionUpdate.error) {
      setError(feedbackInsert.error?.message || sessionUpdate.error?.message || submissionUpdate.error?.message || 'Could not send feedback.');
      setSaving(false);
      return;
    }

    setSession((current) => (current ? { ...current, review_status: 'reviewed' } : current));
    setFeedbackText('');
    setMessage('Client feedback sent and workout marked reviewed.');
    setSaving(false);
  };

  const deleteSubmittedWorkout = async () => {
    if (!isSupabaseConfigured || !session) return;

    const confirmed = window.confirm(
      'Delete this submitted workout permanently? This removes the workout session, set logs, calibration values created from this session, and the matching review action. This cannot be undone.'
    );
    if (!confirmed) return;

    setDeleting(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const submissionDelete = await supabase
      .from('task_submissions')
      .delete()
      .eq('client_id', clientId)
      .eq('submission_type', 'workout_session')
      .eq('answer_text', session.id);

    if (submissionDelete.error) {
      setError(submissionDelete.error.message);
      setDeleting(false);
      return;
    }

    const calibrationDelete = await supabase
      .from('program_calibration_lifts')
      .delete()
      .eq('source_session_id', session.id);

    if (calibrationDelete.error) {
      setError(calibrationDelete.error.message);
      setDeleting(false);
      return;
    }

    const performedSetDelete = await supabase
      .from('performed_sets')
      .delete()
      .eq('session_id', session.id);

    if (performedSetDelete.error) {
      setError(performedSetDelete.error.message);
      setDeleting(false);
      return;
    }

    const sessionDelete = await supabase
      .from('workout_sessions')
      .delete()
      .eq('id', session.id)
      .eq('client_id', clientId);

    if (sessionDelete.error) {
      setError(sessionDelete.error.message);
      setDeleting(false);
      return;
    }

    router.push(`/coach/clients/${clientId}`);
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
          <Link href={workout ? `/coach/clients/${clientId}/current-workouts/${workout.id}/edit` : '#'} className="rounded-lg bg-black px-4 py-2 text-xs font-black uppercase text-white hover:bg-gray-900">
            Adjust following workout
          </Link>
          <button type="button" disabled={deleting} onClick={deleteSubmittedWorkout} className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-xs font-black uppercase text-[#FA0201] hover:bg-red-100 disabled:opacity-60">
            {deleting ? 'Deleting workout...' : 'Delete submitted workout'}
          </button>
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
        </div>
      </div>

      {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      <section>
        <SectionHeader title="CLIENT PERFORMANCE" accent />
        <Card className="space-y-6">
          {session?.client_notes && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
              <p className="text-xs font-black uppercase">Client workout notes</p>
              <p className="mt-2 text-sm font-semibold">{session.client_notes}</p>
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
                      <div className="mt-3 space-y-2">
                        {analysis.reasons.map((reason) => <p key={reason} className="text-xs font-semibold opacity-80">{reason}</p>)}
                        {actual?.notes && (
                          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900">
                            <p className="text-[11px] font-black uppercase">Client set note</p>
                            <p className="mt-1 text-xs font-semibold">{actual.notes}</p>
                          </div>
                        )}
                        {set.notes && <p className="text-xs opacity-70"><span className="font-bold">Prescribed note:</span> {set.notes}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </Card>
      </section>

      <section>
        <SectionHeader title="CLIENT-FACING FEEDBACK" accent />
        <Card className="space-y-5">
          <Textarea
            label="Feedback"
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            placeholder="Write the feedback the client should see from this workout review."
          />
          <button type="button" disabled={saving || deleting} onClick={sendClientFeedback} className="w-full rounded-lg bg-[#FA0201] px-5 py-3 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60">
            {saving ? 'Sending...' : 'Send feedback to client'}
          </button>
          <Link href={workout ? `/coach/clients/${clientId}/current-workouts/${workout.id}/edit` : '#'} className="block w-full rounded-lg border border-black bg-white px-5 py-3 text-center text-sm font-black uppercase text-black hover:bg-black hover:text-white">
            Adjust following workout
          </Link>
          <p className="text-xs font-semibold text-gray-500">
            This edits the reusable {workout?.title || 'workout'} template, so the next time the client runs this workout, the adjusted version is used.
          </p>
        </Card>
      </section>
    </div>
  );
}
