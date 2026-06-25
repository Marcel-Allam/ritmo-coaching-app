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
type ExerciseRole = 'main_lift' | 'accessory';
type NumericValue = number | string | null;

type ClientRecord = { id: string; full_name: string; email: string | null };
type WorkoutSessionRecord = {
  id: string;
  client_id: string;
  program_workout_id: string;
  completed_at: string | null;
  review_status: ReviewStatus;
  client_notes: string | null;
  coach_note: string | null;
  is_calibration: boolean;
  program_week: number | null;
};
type ProgramWorkoutRecord = { id: string; program_id: string; title: string; instructions: string | null };
type ProgramExerciseRecord = {
  id: string;
  exercise_order: number;
  exercise_name: string;
  notes: string | null;
  exercise_catalogue_id: string | null;
  exercise_role: ExerciseRole;
};
type ProgramSetRecord = {
  id: string;
  exercise_id: string;
  set_order: number;
  target_reps: string | null;
  target_weight_kg: number | null;
  target_percent_1rm: number | null;
  target_rpe: number | null;
  target_rir: number | null;
  target_definition_source: string | null;
  target_load_source: string | null;
  notes: string | null;
};
type ResolvedTargetRecord = {
  program_set_id: string;
  exercise_id: string;
  set_order: number;
  target_definition_source: string | null;
  target_reps: string | null;
  target_weight_kg: NumericValue;
  target_percent_1rm: NumericValue;
  target_rpe: NumericValue;
  target_rir: NumericValue;
  effective_target_weight_kg: NumericValue;
  target_load_source: string | null;
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
type CalibrationLiftRecord = {
  id: string;
  lift_name: string;
  source_session_id: string | null;
  source_performed_set_id: string | null;
};

type CalibrationCandidate = {
  exercise: ProgramExerciseRecord;
  performedSet: PerformedSetRecord;
  estimatedOneRepMaxKg: number;
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

const numericValueOrNull = (value: NumericValue) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

const formatSourceLabel = (source: string | null) => {
  if (!source) return 'Base plan';
  if (source === 'weekly_target') return 'Weekly target';
  if (source === 'base_program_set') return 'Base fallback';
  if (source === 'coach_override') return 'Coach override';
  if (source === 'calculated_from_percent_1rm') return 'Calculated from %1RM';
  if (source === 'missing_calibration') return 'Missing calibration';
  if (source === 'not_percent_based') return 'Not % based';
  return source.replaceAll('_', ' ');
};

const calculateEstimatedOneRepMax = (weightKg: number, reps: number) => {
  // Epley formula: weight × (1 + reps / 30). Rounded to 0.1kg for display/storage consistency.
  return Number((weightKg * (1 + reps / 30)).toFixed(1));
};

const formatActualSet = (actual?: PerformedSetRecord) => {
  if (!actual) return 'No actual data';
  const weight = actual.actual_weight_kg !== null && actual.actual_weight_kg !== undefined ? `${actual.actual_weight_kg}kg` : 'No KG';
  const reps = actual.actual_reps !== null && actual.actual_reps !== undefined ? `${actual.actual_reps} reps` : 'No reps';
  const rpe = actual.actual_rpe !== null && actual.actual_rpe !== undefined ? `RPE ${actual.actual_rpe}` : 'No RPE';
  return `${weight} × ${reps} @ ${rpe}`;
};

const formatTargetSet = (target: ProgramSetRecord) => {
  const load = formatKg(target.target_weight_kg);
  const reps = target.target_reps || '— reps';
  const percent = target.target_percent_1rm !== null && target.target_percent_1rm !== undefined ? ` @ ${formatPercent(target.target_percent_1rm)}` : '';
  const rpe = target.target_rpe !== null && target.target_rpe !== undefined ? ` • RPE ${target.target_rpe}` : '';
  const rir = target.target_rir !== null && target.target_rir !== undefined ? ` • RIR ${target.target_rir}` : '';
  return `${load} × ${reps}${percent}${rpe}${rir}`;
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
  const [savedCalibrationLifts, setSavedCalibrationLifts] = useState<CalibrationLiftRecord[]>([]);
  const [selectedCalibrationSetIds, setSelectedCalibrationSetIds] = useState<string[]>([]);
  const [feedbackText, setFeedbackText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCalibration, setSavingCalibration] = useState(false);
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
      .select('id, client_id, program_workout_id, completed_at, review_status, client_notes, coach_note, is_calibration, program_week')
      .eq('id', sessionId)
      .eq('client_id', clientId)
      .single();

    if (sessionError || !sessionData) {
      setError(sessionError?.message || 'Workout session not found.');
      setLoading(false);
      return;
    }

    const loadedSession = sessionData as WorkoutSessionRecord;
    const [clientResult, workoutResult, performedResult, calibrationResult] = await Promise.all([
      supabase.from('clients').select('id, full_name, email').eq('id', clientId).single(),
      supabase.from('program_workouts').select('id, program_id, title, instructions').eq('id', loadedSession.program_workout_id).single(),
      supabase
        .from('performed_sets')
        .select('id, program_exercise_id, program_set_id, set_order, actual_weight_kg, actual_reps, actual_rpe, completed, notes')
        .eq('session_id', sessionId)
        .order('set_order', { ascending: true }),
      supabase
        .from('program_calibration_lifts')
        .select('id, lift_name, source_session_id, source_performed_set_id')
        .eq('source_session_id', sessionId),
    ]);

    if (clientResult.error || workoutResult.error || performedResult.error || calibrationResult.error) {
      setError(clientResult.error?.message || workoutResult.error?.message || performedResult.error?.message || calibrationResult.error?.message || 'Could not load workout review data.');
      setLoading(false);
      return;
    }

    const loadedWorkout = workoutResult.data as ProgramWorkoutRecord;
    const { data: exerciseData, error: exerciseError } = await supabase
      .from('program_exercises')
      .select('id, exercise_order, exercise_name, notes, exercise_catalogue_id, exercise_role')
      .eq('workout_id', loadedSession.program_workout_id)
      .order('exercise_order', { ascending: true });

    if (exerciseError) {
      setError(exerciseError.message);
      setLoading(false);
      return;
    }

    const loadedExercises = ((exerciseData ?? []) as ProgramExerciseRecord[]).map((exercise) => ({
      ...exercise,
      exercise_role: exercise.exercise_role || 'accessory',
    }));
    const exerciseIds = loadedExercises.map((exercise) => exercise.id);

    let loadedProgramSets: ProgramSetRecord[] = [];
    if (exerciseIds.length > 0 && loadedSession.program_week !== null && loadedSession.program_week !== undefined) {
      const { data: resolvedTargetData, error: resolvedTargetError } = await supabase
        .from('program_set_calculated_targets')
        .select('program_set_id, exercise_id, set_order, target_definition_source, target_reps, target_weight_kg, target_percent_1rm, target_rpe, target_rir, effective_target_weight_kg, target_load_source, notes')
        .eq('workout_id', loadedSession.program_workout_id)
        .eq('week_number', loadedSession.program_week)
        .order('exercise_name', { ascending: true })
        .order('set_order', { ascending: true });

      if (resolvedTargetError) {
        setError(resolvedTargetError.message);
        setLoading(false);
        return;
      }

      loadedProgramSets = ((resolvedTargetData ?? []) as ResolvedTargetRecord[]).map((target) => ({
        id: target.program_set_id,
        exercise_id: target.exercise_id,
        set_order: target.set_order,
        target_reps: target.target_reps,
        target_weight_kg: numericValueOrNull(target.effective_target_weight_kg) ?? numericValueOrNull(target.target_weight_kg),
        target_percent_1rm: numericValueOrNull(target.target_percent_1rm),
        target_rpe: numericValueOrNull(target.target_rpe),
        target_rir: numericValueOrNull(target.target_rir),
        target_definition_source: target.target_definition_source,
        target_load_source: target.target_load_source,
        notes: target.notes,
      }));
    } else if (exerciseIds.length > 0) {
      const { data: baseSetData, error: baseSetError } = await supabase
        .from('program_sets')
        .select('id, exercise_id, set_order, target_reps, target_weight_kg, target_percent_1rm, target_rpe, target_rir, notes')
        .in('exercise_id', exerciseIds)
        .order('set_order', { ascending: true });

      if (baseSetError) {
        setError(baseSetError.message);
        setLoading(false);
        return;
      }

      loadedProgramSets = ((baseSetData ?? []) as Array<Omit<ProgramSetRecord, 'target_definition_source' | 'target_load_source'>>).map((set) => ({
        ...set,
        target_definition_source: 'base_program_set',
        target_load_source: set.target_weight_kg !== null && set.target_weight_kg !== undefined ? 'coach_override' : 'not_percent_based',
      }));
    }

    setSession(loadedSession);
    setClient(clientResult.data as ClientRecord);
    setWorkout(loadedWorkout);
    setPerformedSets((performedResult.data ?? []) as PerformedSetRecord[]);
    setSavedCalibrationLifts((calibrationResult.data ?? []) as CalibrationLiftRecord[]);
    setExercises(loadedExercises);
    setProgramSets(loadedProgramSets);
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

  const savedCalibrationSourceSetIds = useMemo(() => {
    return new Set(savedCalibrationLifts.map((lift) => lift.source_performed_set_id).filter((id): id is string => Boolean(id)));
  }, [savedCalibrationLifts]);

  const mainLiftExercises = useMemo(() => {
    return exercises.filter((exercise) => exercise.exercise_role === 'main_lift');
  }, [exercises]);

  const calibrationCandidates = useMemo<CalibrationCandidate[]>(() => {
    return mainLiftExercises.flatMap((exercise) => {
      const usableSets = performedSets
        .filter((set) => {
          return set.program_exercise_id === exercise.id
            && set.completed
            && set.actual_weight_kg !== null
            && set.actual_weight_kg !== undefined
            && set.actual_reps !== null
            && set.actual_reps !== undefined
            && set.actual_weight_kg > 0
            && set.actual_reps > 0;
        })
        .map((set) => ({
          performedSet: set,
          estimatedOneRepMaxKg: calculateEstimatedOneRepMax(set.actual_weight_kg as number, set.actual_reps as number),
        }))
        .sort((a, b) => {
          if (b.estimatedOneRepMaxKg !== a.estimatedOneRepMaxKg) return b.estimatedOneRepMaxKg - a.estimatedOneRepMaxKg;
          return (b.performedSet.actual_weight_kg || 0) - (a.performedSet.actual_weight_kg || 0);
        });

      const bestSet = usableSets[0];
      if (!bestSet) return [];

      return [{
        exercise,
        performedSet: bestSet.performedSet,
        estimatedOneRepMaxKg: bestSet.estimatedOneRepMaxKg,
      }];
    });
  }, [mainLiftExercises, performedSets]);

  useEffect(() => {
    setSelectedCalibrationSetIds((current) => {
      const availableCandidateIds = calibrationCandidates
        .map((candidate) => candidate.performedSet.id)
        .filter((id) => !savedCalibrationSourceSetIds.has(id));
      const retainedIds = current.filter((id) => availableCandidateIds.includes(id));
      const missingIds = availableCandidateIds.filter((id) => !retainedIds.includes(id));
      return [...retainedIds, ...missingIds];
    });
  }, [calibrationCandidates, savedCalibrationSourceSetIds]);

  const toggleCalibrationCandidate = (performedSetId: string) => {
    setSelectedCalibrationSetIds((current) => {
      if (current.includes(performedSetId)) return current.filter((id) => id !== performedSetId);
      return [...current, performedSetId];
    });
  };

  const saveSelectedCalibrationLifts = async () => {
    if (!isSupabaseConfigured || !client || !session || !workout) return;

    const candidatesToSave = calibrationCandidates.filter((candidate) => {
      return selectedCalibrationSetIds.includes(candidate.performedSet.id) && !savedCalibrationSourceSetIds.has(candidate.performedSet.id);
    });

    if (candidatesToSave.length === 0) {
      setError('Select at least one unsaved calibration candidate.');
      return;
    }

    setSavingCalibration(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const insertRows = candidatesToSave.map((candidate) => ({
      program_id: workout.program_id,
      client_id: client.id,
      lift_name: candidate.exercise.exercise_name,
      top_set_weight_kg: candidate.performedSet.actual_weight_kg,
      top_set_reps: candidate.performedSet.actual_reps,
      estimated_1rm_kg: candidate.estimatedOneRepMaxKg,
      source_session_id: session.id,
      source_performed_set_id: candidate.performedSet.id,
      formula: 'weight * (1 + reps / 30)',
      client_visible: true,
      notes: `Saved from workout review: ${workout.title}${session.program_week !== null ? ` Week ${session.program_week}` : ''}`,
    }));

    const { error: insertError } = await supabase.from('program_calibration_lifts').insert(insertRows);

    if (insertError) {
      setError(insertError.message);
      setSavingCalibration(false);
      return;
    }

    const { error: sessionUpdateError } = await supabase
      .from('workout_sessions')
      .update({ is_calibration: true })
      .eq('id', session.id)
      .eq('client_id', client.id);

    if (sessionUpdateError) {
      setError(sessionUpdateError.message);
      setSavingCalibration(false);
      return;
    }

    setSession((current) => (current ? { ...current, is_calibration: true } : current));
    setSelectedCalibrationSetIds([]);
    setMessage(`${candidatesToSave.length} calibration lift${candidatesToSave.length === 1 ? '' : 's'} saved.`);
    setSavingCalibration(false);
    await loadReview();
  };

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
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">{workout?.title || 'Workout'}{session?.program_week !== null && session?.program_week !== undefined ? ` • Week ${session.program_week}` : ''} • Completed {formatDateTime(session?.completed_at || null)}</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          {session && <Badge variant={getStatusVariant(session.review_status) as any}>{session.review_status.replaceAll('_', ' ')}</Badge>}
          {session?.program_week !== null && session?.program_week !== undefined && <Badge variant="default">Week {session.program_week}</Badge>}
          {session?.is_calibration && <Badge variant="success">Calibration session</Badge>}
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
        <SectionHeader title="SESSION TARGET CONTEXT" accent />
        <Card className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-black uppercase text-gray-500">Programme week</p>
            <p className="mt-2 text-xl font-black text-[#000000]">{session?.program_week !== null && session?.program_week !== undefined ? `Week ${session.program_week}` : 'Not recorded'}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-black uppercase text-gray-500">Target source</p>
            <p className="mt-2 text-xl font-black text-[#000000]">Weekly resolved</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-black uppercase text-gray-500">Comparison</p>
            <p className="mt-2 text-xl font-black text-[#000000]">Actual vs target</p>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="CALIBRATION CANDIDATES" accent />
        <Card className="space-y-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
            <p className="text-xs font-black uppercase">Coach-controlled save</p>
            <p className="mt-2 text-sm font-semibold">
              RITMO identifies the best completed top set for each Main / Key Lift using the Epley formula. Select the candidates you want to store as calibration baselines.
            </p>
          </div>

          {mainLiftExercises.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm font-semibold text-gray-600">
              No Main / Key Lift exercises were found in this workout. Mark lifts such as bench, squat, deadlift, or overhead press as Main / Key Lift in the workout editor to enable calibration candidates.
            </p>
          ) : calibrationCandidates.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
              Main / Key Lifts exist, but no completed sets with both load and reps were found in this submission.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {calibrationCandidates.map((candidate) => {
                  const isAlreadySaved = savedCalibrationSourceSetIds.has(candidate.performedSet.id);
                  const isSelected = selectedCalibrationSetIds.includes(candidate.performedSet.id);

                  return (
                    <div key={candidate.exercise.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black uppercase text-[#000000]">{candidate.exercise.exercise_name}</p>
                          <Badge variant="success">Main / Key Lift</Badge>
                          <Badge variant="default">Epley</Badge>
                          {isAlreadySaved && <Badge variant="warning">Saved</Badge>}
                        </div>
                        <label className="flex items-center gap-2 text-xs font-black uppercase text-gray-600">
                          <input
                            type="checkbox"
                            checked={isSelected || isAlreadySaved}
                            disabled={isAlreadySaved || savingCalibration}
                            onChange={() => toggleCalibrationCandidate(candidate.performedSet.id)}
                            className="h-4 w-4 accent-[#FA0201]"
                          />
                          {isAlreadySaved ? 'Already saved' : 'Save'}
                        </label>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-[11px] font-black uppercase text-gray-500">Best set</p>
                          <p className="mt-1 text-sm font-black text-[#000000]">{formatActualSet(candidate.performedSet)}</p>
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-[11px] font-black uppercase text-gray-500">Estimated 1RM</p>
                          <p className="mt-1 text-sm font-black text-[#FA0201]">{candidate.estimatedOneRepMaxKg}kg</p>
                        </div>
                        <div className="rounded-lg bg-white p-3">
                          <p className="text-[11px] font-black uppercase text-gray-500">Source set</p>
                          <p className="mt-1 text-sm font-black text-[#000000]">Set {candidate.performedSet.set_order}</p>
                        </div>
                      </div>
                      {candidate.performedSet.notes && (
                        <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-900">{candidate.performedSet.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={savingCalibration || selectedCalibrationSetIds.length === 0}
                onClick={saveSelectedCalibrationLifts}
                className="w-full rounded-lg bg-[#FA0201] px-5 py-3 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60"
              >
                {savingCalibration ? 'Saving calibration lifts...' : `Save ${selectedCalibrationSetIds.length} calibration lift${selectedCalibrationSetIds.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </Card>
      </section>

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
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold uppercase text-[#000000]">{exercise.exercise_order}. {exercise.exercise_name}</p>
                {exercise.exercise_role === 'main_lift' && <Badge variant="success">Main / Key Lift</Badge>}
              </div>
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
                          <p className="mt-1 text-xs font-black uppercase opacity-70">Target: {formatTargetSet(set)}</p>
                        </div>
                        <span className="rounded bg-white/70 px-2 py-1 text-xs font-bold uppercase">{outcomeLabel[analysis.outcome]}</span>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="default">{formatSourceLabel(set.target_definition_source)}</Badge>
                          <Badge variant={set.target_load_source === 'missing_calibration' ? 'warning' : 'default'}>{formatSourceLabel(set.target_load_source)}</Badge>
                        </div>
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
