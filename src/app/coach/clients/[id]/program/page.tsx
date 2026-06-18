'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
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
type SessionRecord = { program_workout_id: string };
type ExerciseCountRecord = { workout_id: string };
type CoachActionRecord = {
  id: string;
  action_type: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | string;
  due_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Unscheduled';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T00:00:00`));
};

const statusVariant = (status: string) => {
  if (status === 'completed') return 'success';
  if (status === 'scheduled') return 'warning';
  if (status === 'archived') return 'danger';
  return 'default';
};

const priorityVariant = (priority: string) => {
  if (priority === 'high') return 'danger';
  if (priority === 'medium') return 'warning';
  if (priority === 'low') return 'default';
  return 'default';
};

const getWorkoutDisplayStatus = (workout: WorkoutRecord, completedWorkoutIds: Set<string>) => {
  if (completedWorkoutIds.has(workout.id) || workout.status === 'completed') return 'completed';
  if (workout.scheduled_date) return 'scheduled';
  return 'unscheduled';
};

export default function ClientProgramPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutRecord[]>([]);
  const [completedSessions, setCompletedSessions] = useState<SessionRecord[]>([]);
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({});
  const [pendingAdjustments, setPendingAdjustments] = useState<CoachActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingWorkoutId, setDeletingWorkoutId] = useState<string | null>(null);
  const [updatingActionId, setUpdatingActionId] = useState<string | null>(null);

  const loadPage = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const [clientResult, programResult, actionResult] = await Promise.all([
      supabase.from('clients').select('id, full_name, email').eq('id', clientId).single(),
      supabase
        .from('training_programs')
        .select('id, title, goal, status, created_at')
        .eq('client_id', clientId)
        .neq('status', 'archived')
        .order('created_at', { ascending: false }),
      supabase
        .from('coach_actions')
        .select('id, action_type, description, priority, due_date, status, notes, created_at')
        .eq('client_id', clientId)
        .eq('action_type', 'programme_adjustment')
        .neq('status', 'done')
        .order('created_at', { ascending: false }),
    ]);

    if (clientResult.error || programResult.error || actionResult.error) {
      setError(clientResult.error?.message || programResult.error?.message || actionResult.error?.message || 'Could not load programme data.');
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
          supabase.from('workout_sessions').select('program_workout_id').in('program_workout_id', workoutIds).eq('status', 'completed'),
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
    setPendingAdjustments((actionResult.data ?? []) as CoachActionRecord[]);
    setLoading(false);
  };

  useEffect(() => {
    loadPage();
  }, [clientId]);

  const completedWorkoutIds = useMemo(() => {
    return new Set(completedSessions.map((session) => session.program_workout_id));
  }, [completedSessions]);

  const programmeGroups = useMemo(() => {
    return programs.map((program) => ({
      program,
      workouts: workouts.filter((workout) => workout.program_id === program.id),
    }));
  }, [programs, workouts]);

  const markAdjustmentHandled = async (actionId: string) => {
    if (!isSupabaseConfigured) return;

    setUpdatingActionId(actionId);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('coach_actions')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', actionId);

    if (updateError) {
      setError(updateError.message);
      setUpdatingActionId(null);
      return;
    }

    setPendingAdjustments((current) => current.filter((action) => action.id !== actionId));
    setMessage('Programme adjustment marked handled.');
    setUpdatingActionId(null);
  };

  const deleteWorkout = async (workout: WorkoutRecord) => {
    if (!isSupabaseConfigured) return;
    if (completedWorkoutIds.has(workout.id) || workout.status === 'completed') {
      setError('Completed workouts are locked as history and cannot be deleted.');
      return;
    }

    const confirmed = window.confirm(`Delete ${workout.title}? This removes its exercises and prescribed sets.`);
    if (!confirmed) return;

    setDeletingWorkoutId(workout.id);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { data: exerciseData, error: exerciseError } = await supabase
      .from('program_exercises')
      .select('id')
      .eq('workout_id', workout.id);

    if (exerciseError) {
      setError(exerciseError.message);
      setDeletingWorkoutId(null);
      return;
    }

    const exerciseIds = ((exerciseData ?? []) as { id: string }[]).map((exercise) => exercise.id);
    if (exerciseIds.length > 0) {
      const { error: setDeleteError } = await supabase.from('program_sets').delete().in('exercise_id', exerciseIds);
      if (setDeleteError) {
        setError(setDeleteError.message);
        setDeletingWorkoutId(null);
        return;
      }
    }

    const { error: exerciseDeleteError } = await supabase.from('program_exercises').delete().eq('workout_id', workout.id);
    if (exerciseDeleteError) {
      setError(exerciseDeleteError.message);
      setDeletingWorkoutId(null);
      return;
    }

    const { error: workoutDeleteError } = await supabase.from('program_workouts').delete().eq('id', workout.id);
    if (workoutDeleteError) {
      setError(workoutDeleteError.message);
      setDeletingWorkoutId(null);
      return;
    }

    setWorkouts((current) => current.filter((item) => item.id !== workout.id));
    setMessage(`${workout.title} deleted.`);
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
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">Library programmes create client-specific workouts. Edit future workouts directly from this page.</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
          <Link href={`/coach/clients/${clientId}/current-workouts`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Current workouts</Link>
        </div>
      </div>

      {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      <section>
        <SectionHeader title="PENDING PROGRAMME ADJUSTMENTS" accent />
        <Card>
          {pendingAdjustments.length === 0 ? (
            <p className="text-sm text-gray-600">No pending programme adjustments from workout review.</p>
          ) : (
            <div className="space-y-4">
              {pendingAdjustments.map((action) => (
                <div key={action.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={priorityVariant(action.priority) as any}>{action.priority}</Badge>
                        <Badge variant="default">{action.status}</Badge>
                      </div>
                      <p className="whitespace-pre-line text-sm font-semibold text-[#000000]">{action.description}</p>
                      {action.notes && <p className="whitespace-pre-line text-xs text-gray-500">{action.notes}</p>}
                      <p className="text-xs font-semibold uppercase text-gray-400">Created: {formatDate(action.created_at)}{action.due_date ? ` • Due: ${formatDate(action.due_date)}` : ''}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => markAdjustmentHandled(action.id)}
                      disabled={updatingActionId === action.id}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50 disabled:opacity-60"
                    >
                      {updatingActionId === action.id ? 'Updating...' : 'Mark handled'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader title="CURRENT PROGRAMME DELIVERY" accent />
        <Card>
          {workouts.length === 0 ? (
            <p className="text-sm text-gray-600">No active workouts assigned yet. Use Assign From Library below to copy a reusable programme into this client.</p>
          ) : (
            <div className="space-y-6">
              {programmeGroups.map((group) => (
                <div key={group.program.id} className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-4">
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-[#FA0201]">Programme</p>
                      <h2 className="text-xl font-black uppercase text-[#000000]">{group.program.title || 'Untitled programme'}</h2>
                      {group.program.goal && <p className="mt-1 text-sm text-gray-600">{group.program.goal}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Badge variant="default">{group.workouts.length} workout{group.workouts.length === 1 ? '' : 's'}</Badge>
                      <Link href={`/coach/clients/${clientId}/schedule-workouts`} className="rounded-lg bg-[#000000] px-3 py-2 text-xs font-bold uppercase text-white hover:bg-gray-900">Schedule programme</Link>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {group.workouts.map((workout, index) => {
                      const displayStatus = getWorkoutDisplayStatus(workout, completedWorkoutIds);
                      const locked = displayStatus === 'completed';
                      const dayNumber = workout.workout_order || index + 1;
                      return (
                        <div key={workout.id} className="rounded-xl border border-gray-200 bg-white p-4">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div>
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <Badge variant="default">Day {dayNumber}</Badge>
                                <Badge variant={statusVariant(displayStatus) as any}>{displayStatus}</Badge>
                                {locked && <Badge variant="success">locked</Badge>}
                              </div>
                              <p className="text-lg font-bold uppercase text-[#000000]">{workout.title}</p>
                              <p className="mt-1 text-sm text-gray-600">Scheduled: {formatDate(workout.scheduled_date)} • Exercises: {exerciseCounts[workout.id] || 0}</p>
                              {locked && <p className="mt-2 text-xs font-semibold uppercase text-gray-500">Completed workouts are locked as history.</p>}
                            </div>
                            <div className="flex flex-wrap gap-2 md:justify-end">
                              {!workout.scheduled_date && !locked && (
                                <Link href={`/coach/clients/${clientId}/schedule-workouts`} className="rounded-lg bg-[#FA0201] px-3 py-2 text-xs font-bold uppercase text-white hover:bg-red-700">Schedule</Link>
                              )}
                              <Link href={`/coach/clients/${clientId}/current-workouts/${workout.id}/edit`} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50">Edit</Link>
                              {!locked && (
                                <button type="button" onClick={() => deleteWorkout(workout)} disabled={deletingWorkoutId === workout.id} className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold uppercase text-[#FA0201] hover:bg-red-100 disabled:opacity-60">
                                  {deletingWorkoutId === workout.id ? 'Deleting...' : 'Delete'}
                                </button>
                              )}
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
