'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface ClientRecord {
  id: string;
  full_name: string;
}

interface TrainingProgramRecord {
  id: string;
  title: string;
}

interface ProgramWorkoutRecord {
  id: string;
  program_id: string;
  title: string;
  workout_order: number;
}

interface ExerciseCountRecord {
  workout_id: string;
}

interface CompletedSessionRecord {
  id: string;
  program_workout_id: string;
  completed_at: string | null;
  review_status: string;
  client_notes: string | null;
}

interface WorkoutTitleRecord {
  id: string;
  title: string;
}

interface PerformedSetRecord {
  session_id: string;
  set_order: number;
  actual_weight_kg: number | null;
  actual_reps: number | null;
  actual_rpe: number | null;
  completed: boolean;
}

type WorkoutHistoryStats = {
  count: number;
  lastCompletedAt: string | null;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not logged';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
};

const getSetValue = (value: number | null) => {
  if (value === null || value === undefined) return '-';
  return value;
};

const getHistoryLabel = (stats: WorkoutHistoryStats | undefined) => {
  const count = stats?.count || 0;
  if (count === 0) return 'No sessions yet';
  return `${count} session${count === 1 ? '' : 's'} logged`;
};

export default function ClientTrainingPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const submitted = searchParams.get('submitted') === '1';

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workouts, setWorkouts] = useState<ProgramWorkoutRecord[]>([]);
  const [programs, setPrograms] = useState<Record<string, TrainingProgramRecord>>({});
  const [completedSessions, setCompletedSessions] = useState<CompletedSessionRecord[]>([]);
  const [workoutTitles, setWorkoutTitles] = useState<Record<string, string>>({});
  const [exerciseCounts, setExerciseCounts] = useState<Record<string, number>>({});
  const [setsBySession, setSetsBySession] = useState<Record<string, PerformedSetRecord[]>>({});
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadAssignedWorkouts = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Account is not ready yet.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        setMessage('This account is not linked to a client record yet.');
        setIsLoading(false);
        return;
      }

      const linkedClient = clientData as ClientRecord;
      setClient(linkedClient);

      const [workoutResult, completedResult] = await Promise.all([
        supabase
          .from('program_workouts')
          .select('id, program_id, title, workout_order')
          .eq('client_id', linkedClient.id)
          .eq('status', 'active')
          .order('workout_order', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('workout_sessions')
          .select('id, program_workout_id, completed_at, review_status, client_notes')
          .eq('client_id', linkedClient.id)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(25),
      ]);

      if (workoutResult.error || completedResult.error) {
        setMessage(workoutResult.error?.message || completedResult.error?.message || 'Could not load workouts.');
        setIsLoading(false);
        return;
      }

      const loadedWorkouts = (workoutResult.data ?? []) as ProgramWorkoutRecord[];
      const recentSessions = (completedResult.data ?? []) as CompletedSessionRecord[];
      setWorkouts(loadedWorkouts);
      setCompletedSessions(recentSessions);

      const programIds = [...new Set(loadedWorkouts.map((workout) => workout.program_id))];
      if (programIds.length > 0) {
        const { data: programData, error: programError } = await supabase
          .from('training_programs')
          .select('id, title')
          .in('id', programIds);

        if (programError) {
          setMessage(programError.message);
          setIsLoading(false);
          return;
        }

        const programMap = ((programData ?? []) as TrainingProgramRecord[]).reduce<Record<string, TrainingProgramRecord>>((acc, program) => {
          acc[program.id] = program;
          return acc;
        }, {});
        setPrograms(programMap);
      }

      const workoutIds = loadedWorkouts.map((workout) => workout.id);
      if (workoutIds.length > 0) {
        const { data: exerciseData, error: exerciseError } = await supabase
          .from('program_exercises')
          .select('workout_id')
          .in('workout_id', workoutIds);

        if (exerciseError) {
          setMessage(exerciseError.message);
          setIsLoading(false);
          return;
        }

        const counts = ((exerciseData ?? []) as ExerciseCountRecord[]).reduce<Record<string, number>>((acc, exercise) => {
          acc[exercise.workout_id] = (acc[exercise.workout_id] || 0) + 1;
          return acc;
        }, {});
        setExerciseCounts(counts);
      }

      const completedWorkoutIdsForTitles = [...new Set(recentSessions.map((session) => session.program_workout_id))];
      if (completedWorkoutIdsForTitles.length > 0) {
        const { data: titleData } = await supabase
          .from('program_workouts')
          .select('id, title')
          .in('id', completedWorkoutIdsForTitles);

        const titleMap = ((titleData ?? []) as WorkoutTitleRecord[]).reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = item.title;
          return acc;
        }, {});
        setWorkoutTitles(titleMap);
      }

      const sessionIds = recentSessions.slice(0, 5).map((session) => session.id);
      if (sessionIds.length > 0) {
        const { data: setData, error: setError } = await supabase
          .from('performed_sets')
          .select('session_id, set_order, actual_weight_kg, actual_reps, actual_rpe, completed')
          .in('session_id', sessionIds)
          .order('set_order', { ascending: true });

        if (setError) {
          setMessage(setError.message);
          setIsLoading(false);
          return;
        }

        const groupedSets = ((setData ?? []) as PerformedSetRecord[]).reduce<Record<string, PerformedSetRecord[]>>((acc, set) => {
          acc[set.session_id] = [...(acc[set.session_id] || []), set];
          return acc;
        }, {});
        setSetsBySession(groupedSets);
      }

      setIsLoading(false);
    };

    loadAssignedWorkouts();
  }, [user]);

  const latestCompletedWorkoutId = completedSessions.find((session) => workouts.some((workout) => workout.id === session.program_workout_id))?.program_workout_id ?? null;
  const latestCompletedWorkoutIndex = workouts.findIndex((workout) => workout.id === latestCompletedWorkoutId);
  const nextWorkout = workouts.length > 0 ? workouts[(latestCompletedWorkoutIndex + 1) % workouts.length] : null;
  const currentProgram = nextWorkout ? programs[nextWorkout.program_id] : workouts[0] ? programs[workouts[0].program_id] : null;

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

  const completedWorkoutsSection = (
    <section>
      <div className="flex items-center justify-between gap-4">
        <SectionHeader title="RECENTLY COMPLETED" accent />
        <Link href="/client/training/history" className="mb-4 text-xs font-bold uppercase text-[#FA0201] hover:underline">
          View all
        </Link>
      </div>
      <Card>
        {completedSessions.length === 0 ? (
          <p className="text-sm text-gray-600">No completed workouts yet.</p>
        ) : (
          <div className="space-y-4">
            {completedSessions.slice(0, 5).map((session) => {
              const isExpanded = expandedSessionId === session.id;
              const performedSets = setsBySession[session.id] || [];

              return (
                <div key={session.id} className="rounded-xl border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                    className="w-full p-4 text-left hover:bg-gray-50"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-bold uppercase text-[#000000]">
                          {workoutTitles[session.program_workout_id] || 'Workout session'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Completed: {formatDate(session.completed_at)} • Review: {session.review_status}
                        </p>
                      </div>
                      <span className="text-xl font-bold text-[#FA0201]">{isExpanded ? '−' : '+'}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-200 p-4">
                      {performedSets.length === 0 ? (
                        <p className="text-sm text-gray-600">No performed sets recorded for this session.</p>
                      ) : (
                        <div>
                          <div className="grid grid-cols-4 gap-3 text-xs font-bold uppercase text-gray-500">
                            <p>Set</p>
                            <p>Kg</p>
                            <p>Reps</p>
                            <p>RPE</p>
                          </div>
                          {performedSets.map((set) => (
                            <div key={`${session.id}-${set.set_order}`} className="mt-2 grid grid-cols-4 gap-3 rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
                              <p className="font-bold">Set {set.set_order}</p>
                              <p>{getSetValue(set.actual_weight_kg)}</p>
                              <p>{getSetValue(set.actual_reps)}</p>
                              <p>{getSetValue(set.actual_rpe)}</p>
                            </div>
                          ))}
                        </div>
                      )}
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
  );

  if (isLoading) {
    return (
      <div>
        <PageHeader title="WORKOUT" />
        <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto">
          <Card><p className="font-semibold text-gray-700">Loading your workouts...</p></Card>
        </div>
      </div>
    );
  }

  if (message || !client) {
    return (
      <div>
        <PageHeader title="WORKOUT" />
        <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto">
          <Card>
            <p className="font-bold uppercase text-[#000000]">Workout area not available</p>
            <p className="mt-2 text-sm text-gray-600">{message}</p>
          </Card>
        </div>
      </div>
    );
  }

  if (!nextWorkout) {
    return (
      <div>
        <PageHeader title="WORKOUT" subtitle={`Welcome, ${client.full_name}`} />
        <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-8">
          {submitted && (
            <Card className="border-2 border-green-200 bg-green-50">
              <p className="text-sm font-bold uppercase text-green-700">Workout submitted successfully.</p>
            </Card>
          )}
          <Card>
            <p className="font-bold uppercase text-[#000000]">No workouts in programme yet.</p>
            <p className="mt-2 text-sm text-gray-600">
              Your coach has not added programme workouts yet. Once your plan is ready, your next session will appear here.
            </p>
          </Card>
          {completedWorkoutsSection}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="WORKOUT" subtitle={`Welcome, ${client.full_name}`} />
      <div className="px-4 py-6 md:px-8 max-w-5xl mx-auto space-y-8">
        {submitted && (
          <Card className="border-2 border-green-200 bg-green-50">
            <p className="text-sm font-bold uppercase text-green-700">Workout submitted successfully.</p>
          </Card>
        )}

        <section>
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Programme</p>
              <h1 className="mt-1 text-3xl font-black uppercase tracking-tight text-[#000000]">
                {currentProgram?.title || 'Training programme'}
              </h1>
              <p className="mt-2 text-sm font-semibold text-gray-600">
                {workouts.length} workout template{workouts.length === 1 ? '' : 's'} • Highlighted red = next session to complete
              </p>
            </div>
            <Link href="/client" className="rounded-lg bg-[#FA0201] px-4 py-3 text-xs font-black uppercase text-white hover:bg-red-700">
              Back to client hub
            </Link>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {workouts.map((workout, index) => {
              const isNext = workout.id === nextWorkout.id;
              const stats = workoutHistoryStats[workout.id];
              const exerciseCount = exerciseCounts[workout.id] || 0;

              return (
                <div
                  key={workout.id}
                  className={`border-b border-gray-200 p-5 last:border-b-0 ${
                    isNext
                      ? 'bg-[#FA0201] text-white'
                      : index % 2 === 0
                        ? 'bg-gray-100 text-[#000000]'
                        : 'bg-white text-[#000000]'
                  }`}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      {isNext && <p className="mb-2 text-xs font-black uppercase tracking-wide text-white/80">Next workout</p>}
                      <p className="text-2xl font-black uppercase tracking-tight">{workout.title}</p>
                      <p className={`mt-1 text-sm font-semibold ${isNext ? 'text-white/80' : 'text-gray-600'}`}>
                        Day {workout.workout_order || index + 1} • {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'} • {getHistoryLabel(stats)}
                      </p>
                      <p className={`mt-1 text-xs font-bold uppercase ${isNext ? 'text-white/70' : 'text-gray-500'}`}>
                        Last done: {stats?.lastCompletedAt ? formatDate(stats.lastCompletedAt) : '—'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {isNext && (
                        <Link href={`/client/training/${workout.id}?view=focus`} className="rounded-lg bg-white px-4 py-3 text-xs font-black uppercase text-[#FA0201] hover:bg-gray-100">
                          Start workout
                        </Link>
                      )}
                      <Link href={`/client/training/${workout.id}?view=table`} className={`rounded-lg px-4 py-3 text-xs font-black uppercase ${isNext ? 'border border-white/60 text-white hover:bg-white hover:text-[#FA0201]' : 'border border-gray-300 bg-white text-[#000000] hover:bg-gray-50'}`}>
                        View workout
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {completedWorkoutsSection}
      </div>
    </div>
  );
}
