'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = { id: string; full_name: string };
type WorkoutRecord = { id: string; title: string };
type ProgramExerciseRecord = {
  id: string;
  exercise_order: number;
  exercise_name: string;
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
  set_order: number;
  actual_weight_kg: number | null;
  actual_reps: number | null;
  actual_rpe: number | null;
  completed: boolean;
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

export default function ClientWorkoutSpecificHistoryPage() {
  const { user } = useAuth();
  const params = useParams();
  const workoutId = params.workoutId as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workout, setWorkout] = useState<WorkoutRecord | null>(null);
  const [exercises, setExercises] = useState<ProgramExerciseRecord[]>([]);
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

      const loadedSessions = (sessionResult.data ?? []) as SessionRecord[];
      const sessionIds = loadedSessions.map((session) => session.id);
      const setResult = sessionIds.length > 0
        ? await supabase
            .from('performed_sets')
            .select('session_id, program_exercise_id, set_order, actual_weight_kg, actual_reps, actual_rpe, completed')
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
      setExercises((exerciseResult.data ?? []) as ProgramExerciseRecord[]);
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
                              <div className="grid grid-cols-4 gap-3 text-xs font-bold uppercase text-gray-500">
                                <p>Set</p>
                                <p>Kg</p>
                                <p>Reps</p>
                                <p>RPE</p>
                              </div>
                              {performedSets.map((set, index) => (
                                <div key={`${session.id}-fallback-${set.set_order}-${index}`} className="mt-2 grid grid-cols-4 gap-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
                                  <p className="font-bold">Set {set.set_order}</p>
                                  <p>{getSetValue(set.actual_weight_kg)}</p>
                                  <p>{getSetValue(set.actual_reps)}</p>
                                  <p>{getSetValue(set.actual_rpe)}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            exerciseSections.map(({ exercise, sets }) => (
                              <div key={`${session.id}-${exercise.id}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                                <div className="mb-3 flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                                  <p className="text-sm font-black uppercase text-[#000000]">{exercise.exercise_name}</p>
                                  <p className="text-xs font-bold uppercase text-gray-500">{sets.length} set{sets.length === 1 ? '' : 's'}</p>
                                </div>
                                <div className="grid grid-cols-4 gap-3 text-xs font-bold uppercase text-gray-500">
                                  <p>Set</p>
                                  <p>Kg</p>
                                  <p>Reps</p>
                                  <p>RPE</p>
                                </div>
                                {sets.map((set, index) => (
                                  <div key={`${session.id}-${exercise.id}-${set.set_order}-${index}`} className="mt-2 grid grid-cols-4 gap-3 rounded-lg bg-white p-3 text-sm text-gray-800">
                                    <p className="font-bold">Set {set.set_order}</p>
                                    <p>{getSetValue(set.actual_weight_kg)}</p>
                                    <p>{getSetValue(set.actual_reps)}</p>
                                    <p>{getSetValue(set.actual_rpe)}</p>
                                  </div>
                                ))}
                              </div>
                            ))
                          )}
                          {session.client_notes && <p className="text-sm text-gray-700">Session felt: {session.client_notes}</p>}
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
