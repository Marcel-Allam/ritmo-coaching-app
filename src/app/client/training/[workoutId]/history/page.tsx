'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type SetFlag = 'above' | 'matched' | 'watch' | 'below';
type ClientRecord = { id: string; full_name: string };
type WorkoutRecord = { id: string; title: string };
type ProgramExerciseRecord = {
  id: string;
  exercise_order: number;
  exercise_name: string;
};
type ProgramSetRecord = {
  id: string;
  exercise_id: string;
  set_order: number;
  target_reps: string | null;
  target_weight_kg: number | null;
  target_rpe: number | null;
};
type SessionRecord = {
  id: string;
  completed_at: string | null;
  review_status: string;
  client_notes: string | null;
};
type PerformedSetRecord = {
  session_id: string;
  program_exercise_id: string;
  program_set_id: string | null;
  set_order: number;
  actual_weight_kg: number | null;
  actual_reps: number | null;
  actual_rpe: number | null;
  completed: boolean;
};

const flagStyles: Record<SetFlag, { card: string; text: string; badge: string; label: string }> = {
  above: {
    card: 'border-green-200 bg-green-50',
    text: 'text-green-900',
    badge: 'bg-white text-green-900',
    label: 'Above target',
  },
  matched: {
    card: 'border-gray-200 bg-white',
    text: 'text-[#000000]',
    badge: 'bg-gray-100 text-gray-800',
    label: 'On target',
  },
  watch: {
    card: 'border-amber-300 bg-amber-50',
    text: 'text-amber-900',
    badge: 'bg-white text-amber-900',
    label: 'Watch',
  },
  below: {
    card: 'border-red-200 bg-red-50',
    text: 'text-red-900',
    badge: 'bg-white text-red-900',
    label: 'Below target',
  },
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const getSetValue = (value: number | null) => {
  if (value === null || value === undefined) return '—';
  return value;
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

const analyseSet = (set: PerformedSetRecord, target?: ProgramSetRecord) => {
  const reasons: string[] = [];
  let hasPositive = false;
  let hasWatch = false;
  let hasNegative = false;

  if (!set.completed) {
    hasNegative = true;
    reasons.push('Set marked incomplete.');
  }

  if (!target) {
    return { flag: hasNegative ? 'below' as SetFlag : 'matched' as SetFlag, reasons: reasons.length ? reasons : ['No target was available for this set.'] };
  }

  const targetReps = parseTargetReps(target.target_reps);

  if (target.target_weight_kg !== null && target.target_weight_kg !== undefined && set.actual_weight_kg !== null && set.actual_weight_kg !== undefined) {
    const loadDifference = Number((set.actual_weight_kg - target.target_weight_kg).toFixed(1));
    if (loadDifference < 0) {
      hasNegative = true;
      reasons.push(`${Math.abs(loadDifference)}kg under prescribed load.`);
    }
    if (loadDifference > 0) {
      hasPositive = true;
      reasons.push(`${loadDifference}kg above prescribed load.`);
    }
  }

  if (targetReps.min !== null && set.actual_reps !== null && set.actual_reps !== undefined) {
    if (set.actual_reps < targetReps.min) {
      hasNegative = true;
      reasons.push(`${targetReps.min - set.actual_reps} rep${targetReps.min - set.actual_reps === 1 ? '' : 's'} under target.`);
    }
    if (targetReps.max !== null && set.actual_reps > targetReps.max) {
      hasPositive = true;
      reasons.push(`${set.actual_reps - targetReps.max} rep${set.actual_reps - targetReps.max === 1 ? '' : 's'} above target.`);
    }
  }

  if (target.target_rpe !== null && target.target_rpe !== undefined && set.actual_rpe !== null && set.actual_rpe !== undefined) {
    const rpeDifference = Number((set.actual_rpe - target.target_rpe).toFixed(1));
    if (rpeDifference >= 1) {
      hasWatch = true;
      reasons.push(`RPE ${rpeDifference} above target.`);
    }
    if (rpeDifference <= -1 && !hasNegative) {
      hasPositive = true;
      reasons.push(`RPE ${Math.abs(rpeDifference)} below target.`);
    }
  }

  if (hasNegative) return { flag: 'below' as SetFlag, reasons };
  if (hasWatch) return { flag: 'watch' as SetFlag, reasons };
  if (hasPositive) return { flag: 'above' as SetFlag, reasons };
  return { flag: 'matched' as SetFlag, reasons: reasons.length ? reasons : ['Matched the planned work.'] };
};

const formatSetLine = (set: PerformedSetRecord) => {
  const weight = set.actual_weight_kg !== null && set.actual_weight_kg !== undefined ? `${set.actual_weight_kg}kg` : '—kg';
  const reps = set.actual_reps !== null && set.actual_reps !== undefined ? `${set.actual_reps} reps` : '— reps';
  const rpe = set.actual_rpe !== null && set.actual_rpe !== undefined ? `RPE ${set.actual_rpe}` : 'RPE —';
  return `${weight} × ${reps} @ ${rpe}`;
};

export default function ClientWorkoutSpecificHistoryPage() {
  const { user } = useAuth();
  const params = useParams();
  const workoutId = params.workoutId as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workout, setWorkout] = useState<WorkoutRecord | null>(null);
  const [exercises, setExercises] = useState<ProgramExerciseRecord[]>([]);
  const [programSets, setProgramSets] = useState<ProgramSetRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [setsBySession, setSetsBySession] = useState<Record<string, PerformedSetRecord[]>>({});
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHistory = async () => {
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

      const [workoutResult, exerciseResult, sessionResult] = await Promise.all([
        supabase
          .from('program_workouts')
          .select('id, title')
          .eq('id', workoutId)
          .eq('client_id', linkedClient.id)
          .single(),
        supabase
          .from('program_exercises')
          .select('id, exercise_order, exercise_name')
          .eq('workout_id', workoutId)
          .order('exercise_order', { ascending: true }),
        supabase
          .from('workout_sessions')
          .select('id, completed_at, review_status, client_notes')
          .eq('client_id', linkedClient.id)
          .eq('program_workout_id', workoutId)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false }),
      ]);

      if (workoutResult.error || exerciseResult.error || sessionResult.error || !workoutResult.data) {
        setError(workoutResult.error?.message || exerciseResult.error?.message || sessionResult.error?.message || 'Could not load workout history.');
        setLoading(false);
        return;
      }

      const loadedExercises = (exerciseResult.data ?? []) as ProgramExerciseRecord[];
      const exerciseIds = loadedExercises.map((exercise) => exercise.id);

      const targetSetResult = exerciseIds.length > 0
        ? await supabase
            .from('program_sets')
            .select('id, exercise_id, set_order, target_reps, target_weight_kg, target_rpe')
            .in('exercise_id', exerciseIds)
            .order('set_order', { ascending: true })
        : { data: [], error: null };

      if (targetSetResult.error) {
        setError(targetSetResult.error.message);
        setLoading(false);
        return;
      }

      const loadedSessions = (sessionResult.data ?? []) as SessionRecord[];
      const sessionIds = loadedSessions.map((session) => session.id);
      const setResult = sessionIds.length > 0
        ? await supabase
            .from('performed_sets')
            .select('session_id, program_exercise_id, program_set_id, set_order, actual_weight_kg, actual_reps, actual_rpe, completed')
            .in('session_id', sessionIds)
            .order('set_order', { ascending: true })
        : { data: [], error: null };

      if (setResult.error) {
        setError(setResult.error.message);
        setLoading(false);
        return;
      }

      const groupedSets = ((setResult.data ?? []) as PerformedSetRecord[]).reduce<Record<string, PerformedSetRecord[]>>((acc, set) => {
        acc[set.session_id] = [...(acc[set.session_id] || []), set];
        return acc;
      }, {});

      setWorkout(workoutResult.data as WorkoutRecord);
      setExercises(loadedExercises);
      setProgramSets((targetSetResult.data ?? []) as ProgramSetRecord[]);
      setSessions(loadedSessions);
      setSetsBySession(groupedSets);
      setLoading(false);
    };

    loadHistory();
  }, [user, workoutId]);

  if (loading) {
    return (
      <div>
        <PageHeader title="WORKOUT HISTORY" />
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8"><Card>Loading workout history...</Card></main>
      </div>
    );
  }

  if (error || !client || !workout) {
    return (
      <div>
        <PageHeader title="WORKOUT HISTORY" />
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8"><Card><p className="text-sm font-semibold text-red-700">{error || 'Workout history not available.'}</p></Card></main>
      </div>
    );
  }

  const targetsById = new Map(programSets.map((set) => [set.id, set]));
  const fallbackTargets = programSets.reduce<Record<string, ProgramSetRecord[]>>((acc, target) => {
    acc[target.exercise_id] = [...(acc[target.exercise_id] || []), target];
    return acc;
  }, {});

  return (
    <div>
      <PageHeader title="WORKOUT HISTORY" subtitle={`${workout.title} history for ${client.full_name}`} />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-8">
        <div className="flex flex-wrap gap-3">
          <Link href="/client/training" className="rounded-lg bg-[#FA0201] px-4 py-3 text-xs font-black uppercase text-white hover:bg-red-700">
            Back to programme
          </Link>
          <Link href={`/client/training/${workout.id}/view`} className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-xs font-black uppercase text-[#000000] hover:bg-gray-50">
            View workout
          </Link>
        </div>

        <section>
          <SectionHeader title={workout.title} accent />
          <Card>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-600">No completed sessions for this workout yet.</p>
            ) : (
              <div className="space-y-4">
                {sessions.map((session) => {
                  const isExpanded = expandedSessionId === session.id;
                  const performedSets = setsBySession[session.id] || [];
                  const exerciseSections = exercises
                    .map((exercise) => ({
                      exercise,
                      sets: performedSets.filter((set) => set.program_exercise_id === exercise.id),
                    }))
                    .filter((section) => section.sets.length > 0);

                  return (
                    <div key={session.id} className="rounded-xl border border-gray-200 bg-white">
                      <button
                        type="button"
                        onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                        className="w-full p-4 text-left hover:bg-gray-50"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-lg font-black uppercase text-[#000000]">{formatDate(session.completed_at)}</p>
                            <p className="mt-1 text-sm text-gray-600">Review: {session.review_status}</p>
                          </div>
                          <span className="text-xl font-bold text-[#FA0201]">{isExpanded ? '−' : '+'}</span>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="space-y-4 border-t border-gray-200 p-4">
                          {performedSets.length === 0 ? (
                            <p className="text-sm text-gray-600">No performed sets recorded for this session.</p>
                          ) : exerciseSections.length === 0 ? (
                            <div>
                              <p className="mb-3 text-sm font-black uppercase text-[#000000]">Workout sets</p>
                              <div className="space-y-3">
                                {performedSets.map((set, index) => {
                                  const analysis = analyseSet(set);
                                  const styles = flagStyles[analysis.flag];
                                  return (
                                    <div key={`${session.id}-fallback-${set.set_order}-${index}`} className={`rounded-lg border p-4 ${styles.card}`}>
                                      <div className="flex items-start justify-between gap-4">
                                        <div>
                                          <p className={`text-xs font-black uppercase ${styles.text}`}>Set {set.set_order}</p>
                                          <p className={`mt-1 text-lg font-black ${styles.text}`}>{formatSetLine(set)}</p>
                                          <p className={`mt-2 text-xs font-semibold ${styles.text}`}>{analysis.reasons[0]}</p>
                                        </div>
                                        <span className={`rounded px-2 py-1 text-xs font-black uppercase ${styles.badge}`}>{styles.label}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            exerciseSections.map(({ exercise, sets }) => (
                              <div key={`${session.id}-${exercise.id}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                  <p className="text-sm font-black uppercase text-[#000000]">{exercise.exercise_order}. {exercise.exercise_name}</p>
                                  <p className="text-xs font-bold uppercase text-gray-500">{sets.length} set{sets.length === 1 ? '' : 's'}</p>
                                </div>
                                <div className="space-y-3">
                                  {sets.map((set, index) => {
                                    const fallbackTarget = fallbackTargets[exercise.id]?.find((target) => target.set_order === set.set_order);
                                    const target = set.program_set_id ? targetsById.get(set.program_set_id) ?? fallbackTarget : fallbackTarget;
                                    const analysis = analyseSet(set, target);
                                    const styles = flagStyles[analysis.flag];

                                    return (
                                      <div key={`${session.id}-${exercise.id}-${set.set_order}-${index}`} className={`rounded-lg border p-4 ${styles.card}`}>
                                        <div className="flex items-start justify-between gap-4">
                                          <div>
                                            <p className={`text-xs font-black uppercase ${styles.text}`}>Set {set.set_order}</p>
                                            <p className={`mt-1 text-lg font-black ${styles.text}`}>{formatSetLine(set)}</p>
                                            <p className={`mt-2 text-xs font-semibold ${styles.text}`}>{analysis.reasons[0]}</p>
                                          </div>
                                          <span className={`rounded px-2 py-1 text-xs font-black uppercase ${styles.badge}`}>{styles.label}</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))
                          )}
                          {session.client_notes && (
                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                              <p className="text-xs font-bold uppercase text-gray-500">Client workout notes</p>
                              <p className="mt-2 text-sm text-gray-700">Session felt: {session.client_notes}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </section>
      </main>
    </div>
  );
}
