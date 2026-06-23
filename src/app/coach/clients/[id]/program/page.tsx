'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { EditPlanPeriodisationPanel } from '@/components/coach/edit-plan-periodisation-panel';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = { id: string; full_name: string; email: string | null };
type ProgramRecord = { id: string; title: string; goal: string | null; status: string; created_at: string };
type WorkoutRecord = {
  id: string;
  program_id: string;
  title: string;
  scheduled_date: string | null;
  workout_order: number;
  status: string;
  created_at: string;
};
type SessionRecord = { program_workout_id: string; completed_at: string | null };
type ExerciseCountRecord = { workout_id: string };
type WorkoutHistoryStats = { count: number; lastCompletedAt: string | null };

const formatDate = (value: string | null) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
};

const getWorkoutHistoryLabel = (stats: WorkoutHistoryStats | undefined) => {
  const count = stats?.count || 0;
  if (count === 0) return 'No sessions logged';
  return `${count} session${count === 1 ? '' : 's'} logged`;
};

export default function ClientProgramPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutRecord[]>([]);
  const [completedSessions, setCompletedSessions] = useState<SessionRecord[]>([]);
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingWorkoutId, setDeletingWorkoutId] = useState<string | null>(null);

  const loadPage = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const [clientResult, programResult] = await Promise.all([
      supabase.from('clients').select('id, full_name, email').eq('id', clientId).single(),
      supabase
        .from('training_programs')
        .select('id, title, goal, status, created_at')
        .eq('client_id', clientId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false }),
    ]);

    if (clientResult.error || programResult.error) {
      setError(clientResult.error?.message || programResult.error?.message || 'Could not load programme data.');
      setLoading(false);
      return;
    }

    const loadedPrograms = (programResult.data ?? []) as ProgramRecord[];
    const programIds = loadedPrograms.map((program) => program.id);

    const workoutResult = programIds.length > 0
      ? await supabase
          .from('program_workouts')
          .select('id, program_id, title, scheduled_date, workout_order, status, created_at')
          .in('program_id', programIds)
          .neq('status', 'archived')
          .order('workout_order', { ascending: true })
          .order('created_at', { ascending: true })
      : { data: [], error: null };

    if (workoutResult.error) {
      setError(workoutResult.error.message);
      setLoading(false);
      return;
    }

    const loadedWorkouts = (workoutResult.data ?? []) as WorkoutRecord[];
    const workoutIds = loadedWorkouts.map((workout) => workout.id);

    const [sessionResult, exerciseResult] = workoutIds.length > 0
      ? await Promise.all([
          supabase
            .from('workout_sessions')
            .select('program_workout_id, completed_at')
            .in('program_workout_id', workoutIds)
            .eq('status', 'completed')
            .order('completed_at', { ascending: false }),
          supabase.from('program_exercises').select('workout_id').in('workout_id', workoutIds),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];

    if (sessionResult.error || exerciseResult.error) {
      setError(sessionResult.error?.message || exerciseResult.error?.message || 'Could not load workout delivery data.');
      setLoading(false);
      return;
    }

    const counts = ((exerciseResult.data ?? []) as ExerciseCountRecord[]).reduce<Record<string, number>>((acc, row) => {
      acc[row.workout_id] = (acc[row.workout_id] || 0) + 1;
      return acc;
    }, {});

    setClient(clientResult.data as ClientRecord);
    setPrograms(loadedPrograms);
    setWorkouts(loadedWorkouts);
    setCompletedSessions((sessionResult.data ?? []) as SessionRecord[]);
    setExerciseCounts(counts);
    setLoading(false);
  };

  useEffect(() => {
    loadPage();
  }, [clientId]);

  const workoutHistoryStats = useMemo(() => {
    return completedSessions.reduce<Record<string, WorkoutHistoryStats>>((acc, session) => {
      const current = acc[session.program_workout_id] || { count: 0, lastCompletedAt: null };
      const sessionTime = session.completed_at ? new Date(session.completed_at).getTime() : 0;
      const currentTime = current.lastCompletedAt ? new Date(current.lastCompletedAt).getTime() : 0;

      acc[session.program_workout_id] = {
        count: current.count + 1,
        lastCompletedAt: sessionTime > currentTime ? session.completed_at : current.lastCompletedAt,
      };

      return acc;
    }, {});
  }, [completedSessions]);

  const programmeGroups = useMemo(() => {
    return programs.map((program) => ({
      program,
      workouts: workouts.filter((workout) => workout.program_id === program.id),
    }));
  }, [programs, workouts]);

  const deleteWorkout = async (workout: WorkoutRecord) => {
    if (!isSupabaseConfigured) return;

    const hasHistory = Boolean(workoutHistoryStats[workout.id]?.count);
    const confirmed = window.confirm(
      hasHistory
        ? `Remove ${workout.title} from current programme delivery? Previous completed sessions will remain in history.`
        : `Delete ${workout.title} from current programme delivery?`
    );
    if (!confirmed) return;

    setDeletingWorkoutId(workout.id);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: archiveError } = await supabase
      .from('program_workouts')
      .update({ status: 'archived' })
      .eq('id', workout.id);

    if (archiveError) {
      setError(archiveError.message);
      setDeletingWorkoutId(null);
      return;
    }

    setWorkouts((current) => current.filter((item) => item.id !== workout.id));
    setMessage(`${workout.title} removed from current programme delivery.`);
    setDeletingWorkoutId(null);
  };

  if (loading) return <div className="p-6 md:p-8"><Card>Loading client programme...</Card></div>;
  if (error && !client) return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Client Program</h1>
          <p className="mt-1 text-sm text-gray-600">{client?.full_name}{client?.email ? ` • ${client.email}` : ''}</p>
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">Manage reusable workout templates for this programme block. Sessions logged against each workout appear in History.</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
          <Link href={`/coach/clients/${clientId}/current-workouts`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Current workouts</Link>
        </div>
      </div>

      {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      <EditPlanPeriodisationPanel clientId={clientId} programs={programs} />

      <section>
        <SectionHeader title="PROGRAMME WORKOUTS" accent />
        <Card>
          {workouts.length === 0 ? (
            <p className="text-sm text-gray-600">No active workouts assigned yet. Use the periodisation setup above to start a client plan from a template.</p>
          ) : (
            <div className="space-y-6">
              {programmeGroups.map((group) => (
                <div key={group.program.id} className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-4">
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-[#FA0201]">Programme</p>
                      <h2 className="text-xl font-black uppercase text-[#000000]">{group.program.title || 'Untitled programme'}</h2>
                      {group.program.goal && <p className="mt-1 text-sm text-gray-600">{group.program.goal}</p>}
                      <p className="mt-2 text-xs font-bold uppercase text-gray-500">Workout templates repeated across the programme block</p>
                    </div>
                    <Badge variant="default">{group.workouts.length} workout template{group.workouts.length === 1 ? '' : 's'}</Badge>
                  </div>

                  <div className="space-y-3">
                    {group.workouts.map((workout, index) => {
                      const dayNumber = workout.workout_order || index + 1;
                      const historyStats = workoutHistoryStats[workout.id];

                      return (
                        <div key={workout.id} className="rounded-xl border border-gray-200 bg-white p-4">
                          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[90px_1fr_160px_160px_270px] xl:items-center">
                            <div>
                              <Badge variant="default">Day {dayNumber}</Badge>
                            </div>
                            <div>
                              <p className="text-lg font-bold uppercase text-[#000000]">{workout.title}</p>
                              <p className="mt-1 text-sm text-gray-600">{exerciseCounts[workout.id] || 0} exercise{(exerciseCounts[workout.id] || 0) === 1 ? '' : 's'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase text-gray-500">History</p>
                              <p className="mt-1 text-sm font-bold text-[#000000]">{getWorkoutHistoryLabel(historyStats)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase text-gray-500">Last done</p>
                              <p className="mt-1 text-sm font-bold text-[#000000]">{formatDate(historyStats?.lastCompletedAt || null)}</p>
                            </div>
                            <div className="flex flex-wrap gap-2 xl:justify-end">
                              <Link href={`/coach/clients/${clientId}/program/history/${workout.id}`} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50">History</Link>
                              <Link href={`/coach/clients/${clientId}/current-workouts/${workout.id}/edit`} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50">Edit workout</Link>
                              <button type="button" onClick={() => deleteWorkout(workout)} disabled={deletingWorkoutId === workout.id} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold uppercase text-[#FA0201] hover:bg-red-100 disabled:opacity-60">
                                {deletingWorkoutId === workout.id ? 'Deleting...' : 'Delete'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
