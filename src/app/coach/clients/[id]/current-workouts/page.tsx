'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = { id: string; full_name: string; email: string | null };
type WorkoutRecord = {
  id: string;
  title: string;
  program_id: string;
  scheduled_date: string | null;
  workout_order: number;
  status: string;
};
type ProgramRecord = { id: string; title: string };
type SessionRecord = { program_workout_id: string };

const formatDate = (value: string | null) => {
  if (!value) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const statusLabel = (workout: WorkoutRecord, completedIds: Set<string>) => {
  if (completedIds.has(workout.id)) return 'completed';
  if (workout.scheduled_date) return 'scheduled';
  return 'unscheduled';
};

const statusVariant = (status: string) => {
  if (status === 'completed') return 'success';
  if (status === 'scheduled') return 'default';
  return 'warning';
};

export default function CoachCurrentWorkoutsPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutRecord[]>([]);
  const [programs, setPrograms] = useState<Record<string, ProgramRecord>>({});
  const [completedWorkoutIds, setCompletedWorkoutIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busyWorkoutId, setBusyWorkoutId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadWorkouts = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const [clientResult, workoutResult, sessionResult] = await Promise.all([
      supabase
        .from('clients')
        .select('id, full_name, email')
        .eq('id', clientId)
        .single(),
      supabase
        .from('program_workouts')
        .select('id, title, program_id, scheduled_date, workout_order, status')
        .eq('client_id', clientId)
        .neq('status', 'archived')
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .order('workout_order', { ascending: true }),
      supabase
        .from('workout_sessions')
        .select('program_workout_id')
        .eq('client_id', clientId)
        .eq('status', 'completed'),
    ]);

    if (clientResult.error || !clientResult.data) {
      setError(clientResult.error?.message || 'Client not found.');
      setLoading(false);
      return;
    }

    if (workoutResult.error) {
      setError(workoutResult.error.message);
      setLoading(false);
      return;
    }

    if (sessionResult.error) {
      setError(sessionResult.error.message);
      setLoading(false);
      return;
    }

    const loadedWorkouts = (workoutResult.data ?? []) as WorkoutRecord[];
    const programIds = [...new Set(loadedWorkouts.map((workout) => workout.program_id))];
    let programMap: Record<string, ProgramRecord> = {};

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

      programMap = ((programData ?? []) as ProgramRecord[]).reduce<Record<string, ProgramRecord>>((acc, program) => {
        acc[program.id] = program;
        return acc;
      }, {});
    }

    setClient(clientResult.data as ClientRecord);
    setWorkouts(loadedWorkouts);
    setPrograms(programMap);
    setCompletedWorkoutIds(new Set(((sessionResult.data ?? []) as SessionRecord[]).map((session) => session.program_workout_id)));
    setLoading(false);
  };

  useEffect(() => {
    loadWorkouts();
  }, [clientId]);

  const duplicateWorkout = async (workout: WorkoutRecord) => {
    if (!isSupabaseConfigured) return;

    setBusyWorkoutId(workout.id);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: duplicateError } = await supabase.rpc('duplicate_program_workout', {
      source_workout_id: workout.id,
    });

    if (duplicateError) {
      setError(duplicateError.message);
      setBusyWorkoutId(null);
      return;
    }

    setMessage('Workout duplicated. The copy is unscheduled and editable.');
    setBusyWorkoutId(null);
    await loadWorkouts();
  };

  const archiveWorkout = async (workout: WorkoutRecord) => {
    if (!isSupabaseConfigured) return;

    const status = statusLabel(workout, completedWorkoutIds);
    if (status === 'completed') {
      setError('Completed workouts are locked. Duplicate it instead of archiving history.');
      return;
    }

    setBusyWorkoutId(workout.id);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: archiveError } = await supabase
      .from('program_workouts')
      .update({ status: 'archived' })
      .eq('id', workout.id);

    if (archiveError) {
      setError(archiveError.message);
      setBusyWorkoutId(null);
      return;
    }

    setMessage('Workout archived.');
    setBusyWorkoutId(null);
    await loadWorkouts();
  };

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading current workouts...</Card></div>;
  }

  if (error && !client) {
    return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;
  }

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold uppercase text-[#000000] tracking-tight">Current workouts</h1>
          <p className="mt-1 text-sm text-gray-600">{client?.full_name} • Manage assigned workouts before they become history.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
          <Link href={`/coach/clients/${clientId}/training`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Create workout</Link>
          <Link href={`/coach/clients/${clientId}/schedule-workouts`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Schedule workouts</Link>
        </div>
      </div>

      {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      <section>
        <SectionHeader title="WORKOUTS" accent />
        <Card>
          {workouts.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">No current workouts found.</p>
              <Link href={`/coach/clients/${clientId}/training`} className="inline-block text-sm font-bold uppercase text-[#FA0201] hover:underline">
                Create workout
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {workouts.map((workout) => {
                const status = statusLabel(workout, completedWorkoutIds);
                const locked = status === 'completed';
                const program = programs[workout.program_id];

                return (
                  <div key={workout.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase text-gray-500">{program?.title || 'Programme'}</p>
                        <p className="mt-1 text-lg font-bold uppercase text-[#000000]">{workout.title}</p>
                        <p className="mt-1 text-sm text-gray-600">Scheduled: {formatDate(workout.scheduled_date)}</p>
                        {locked && <p className="mt-2 text-xs font-semibold uppercase text-gray-500">Locked because the client has completed this workout.</p>}
                      </div>
                      <div className="flex flex-col items-start gap-3 md:items-end">
                        <Badge variant={statusVariant(status) as any}>{status}</Badge>
                        <div className="flex flex-wrap gap-2">
                          {locked ? (
                            <span className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-bold uppercase text-gray-500">Locked</span>
                          ) : (
                            <Link href={`/coach/clients/${clientId}/current-workouts/${workout.id}/edit`}>
                              <Button type="button" size="sm" variant="outline">Edit</Button>
                            </Link>
                          )}
                          <Button type="button" size="sm" variant="outline" onClick={() => duplicateWorkout(workout)} isLoading={busyWorkoutId === workout.id}>
                            Duplicate
                          </Button>
                          {!locked && (
                            <Button type="button" size="sm" variant="outline" onClick={() => archiveWorkout(workout)} isLoading={busyWorkoutId === workout.id}>
                              Archive
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
