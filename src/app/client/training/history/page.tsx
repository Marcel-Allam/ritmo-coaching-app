'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = { id: string; full_name: string };
type SessionRecord = {
  id: string;
  program_workout_id: string;
  completed_at: string | null;
  review_status: string;
  client_notes: string | null;
};
type WorkoutRecord = { id: string; title: string; day_label: string | null; program_id: string };
type ProgramRecord = { id: string; title: string };
type PerformedSetRecord = {
  session_id: string;
  set_order: number;
  actual_weight_kg: number | null;
  actual_reps: number | null;
  actual_rpe: number | null;
  completed: boolean;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export default function CompletedWorkoutHistoryPage() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [workouts, setWorkouts] = useState<Record<string, WorkoutRecord>>({});
  const [programs, setPrograms] = useState<Record<string, ProgramRecord>>({});
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

      const { data: sessionData, error: sessionError } = await supabase
        .from('workout_sessions')
        .select('id, program_workout_id, completed_at, review_status, client_notes')
        .eq('client_id', linkedClient.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });

      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      const loadedSessions = (sessionData ?? []) as SessionRecord[];
      setSessions(loadedSessions);

      const workoutIds = [...new Set(loadedSessions.map((session) => session.program_workout_id))];
      const sessionIds = loadedSessions.map((session) => session.id);

      if (workoutIds.length > 0) {
        const { data: workoutData, error: workoutError } = await supabase
          .from('program_workouts')
          .select('id, title, day_label, program_id')
          .in('id', workoutIds);

        if (workoutError) {
          setError(workoutError.message);
          setLoading(false);
          return;
        }

        const workoutMap = ((workoutData ?? []) as WorkoutRecord[]).reduce<Record<string, WorkoutRecord>>((acc, workout) => {
          acc[workout.id] = workout;
          return acc;
        }, {});
        setWorkouts(workoutMap);

        const programIds = [...new Set(Object.values(workoutMap).map((workout) => workout.program_id))];
        if (programIds.length > 0) {
          const { data: programData, error: programError } = await supabase
            .from('training_programs')
            .select('id, title')
            .in('id', programIds);

          if (programError) {
            setError(programError.message);
            setLoading(false);
            return;
          }

          const programMap = ((programData ?? []) as ProgramRecord[]).reduce<Record<string, ProgramRecord>>((acc, program) => {
            acc[program.id] = program;
            return acc;
          }, {});
          setPrograms(programMap);
        }
      }

      if (sessionIds.length > 0) {
        const { data: setData, error: setError } = await supabase
          .from('performed_sets')
          .select('session_id, set_order, actual_weight_kg, actual_reps, actual_rpe, completed')
          .in('session_id', sessionIds)
          .order('set_order', { ascending: true });

        if (setError) {
          setError(setError.message);
          setLoading(false);
          return;
        }

        const groupedSets = ((setData ?? []) as PerformedSetRecord[]).reduce<Record<string, PerformedSetRecord[]>>((acc, set) => {
          acc[set.session_id] = [...(acc[set.session_id] || []), set];
          return acc;
        }, {});
        setSetsBySession(groupedSets);
      }

      setLoading(false);
    };

    loadHistory();
  }, [user]);

  if (loading) {
    return (
      <div>
        <PageHeader title="COMPLETED WORKOUTS" />
        <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto"><Card>Loading completed workouts...</Card></div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div>
        <PageHeader title="COMPLETED WORKOUTS" />
        <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="COMPLETED WORKOUTS" subtitle={`Training history for ${client.full_name}`} />
      <main className="px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-8 pb-24 md:pb-8">
        <Link href="/client/training" className="text-sm font-bold uppercase text-[#FA0201] hover:underline">
          Back to start your workout
        </Link>

        <section>
          <SectionHeader title="WORKOUT HISTORY" accent />
          <Card>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-600">No completed workouts yet.</p>
            ) : (
              <div className="space-y-4">
                {sessions.map((session) => {
                  const workout = workouts[session.program_workout_id];
                  const program = workout ? programs[workout.program_id] : null;
                  const isExpanded = expandedSessionId === session.id;
                  const performedSets = setsBySession[session.id] || [];

                  return (
                    <div key={session.id} className="rounded-xl border border-gray-200 bg-white">
                      <button
                        type="button"
                        onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                        className="w-full p-4 text-left"
                      >
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-xs font-bold uppercase text-gray-500">{formatDate(session.completed_at)}</p>
                            <p className="mt-1 text-lg font-bold uppercase text-[#000000]">
                              {workout?.day_label || workout?.title || 'Workout'}
                            </p>
                            <p className="mt-1 text-sm text-gray-600">
                              Programme: {program?.title || 'Programme not found'}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold uppercase text-gray-700">
                              {workout?.title || 'Workout'}
                            </span>
                            <span className="text-xl font-bold text-[#FA0201]">{isExpanded ? '−' : '+'}</span>
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-200 p-4">
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs font-bold uppercase text-gray-500">
                            <p>Set</p>
                            <p>Kg</p>
                            <p>Reps</p>
                            <p>RPE</p>
                          </div>
                          {performedSets.map((set) => (
                            <div key={`${session.id}-${set.set_order}`} className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
                              <p className="font-bold">Set {set.set_order}</p>
                              <p>{set.actual_weight_kg ?? '-'}</p>
                              <p>{set.actual_reps ?? '-'}</p>
                              <p>{set.actual_rpe ?? '-'}</p>
                            </div>
                          ))}
                          {session.client_notes && <p className="mt-3 text-sm text-gray-700">{session.client_notes}</p>}
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
