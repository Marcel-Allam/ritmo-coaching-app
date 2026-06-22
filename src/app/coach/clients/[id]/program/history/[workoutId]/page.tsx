'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = { id: string; full_name: string; email: string | null };
type WorkoutRecord = { id: string; title: string; instructions: string | null };
type SessionRecord = {
  id: string;
  completed_at: string | null;
  review_status: string;
  client_notes: string | null;
  coach_note: string | null;
};
type SetSummaryRecord = {
  session_id: string;
  actual_weight_kg: number | null;
  actual_reps: number | null;
  completed: boolean;
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

const statusVariant = (status: string) => {
  if (status === 'reviewed' || status === 'resolved') return 'success';
  if (status === 'flagged') return 'danger';
  if (status === 'needs_feedback' || status === 'needs_action') return 'warning';
  return 'default';
};

const getSessionVolume = (sets: SetSummaryRecord[]) => {
  return sets.reduce((total, set) => {
    if (!set.completed || set.actual_weight_kg === null || set.actual_reps === null) return total;
    return total + set.actual_weight_kg * set.actual_reps;
  }, 0);
};

const getTopSet = (sets: SetSummaryRecord[]) => {
  const completedSets = sets.filter((set) => set.completed && set.actual_weight_kg !== null && set.actual_reps !== null);
  if (completedSets.length === 0) return 'No completed sets';
  const topSet = completedSets.reduce((best, current) => {
    const bestLoad = best.actual_weight_kg ?? 0;
    const currentLoad = current.actual_weight_kg ?? 0;
    if (currentLoad > bestLoad) return current;
    if (currentLoad === bestLoad && (current.actual_reps ?? 0) > (best.actual_reps ?? 0)) return current;
    return best;
  }, completedSets[0]);
  return `${topSet.actual_weight_kg}kg × ${topSet.actual_reps}`;
};

export default function ProgrammeWorkoutHistoryPage() {
  const params = useParams();
  const clientId = params.id as string;
  const workoutId = params.workoutId as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [workout, setWorkout] = useState<WorkoutRecord | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [setsBySession, setSetsBySession] = useState<Record<string, SetSummaryRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadHistory = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const [clientResult, workoutResult, sessionResult] = await Promise.all([
        supabase.from('clients').select('id, full_name, email').eq('id', clientId).single(),
        supabase.from('program_workouts').select('id, title, instructions').eq('id', workoutId).single(),
        supabase
          .from('workout_sessions')
          .select('id, completed_at, review_status, client_notes, coach_note')
          .eq('client_id', clientId)
          .eq('program_workout_id', workoutId)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false }),
      ]);

      if (clientResult.error || workoutResult.error || sessionResult.error) {
        setError(clientResult.error?.message || workoutResult.error?.message || sessionResult.error?.message || 'Could not load workout history.');
        setLoading(false);
        return;
      }

      const loadedSessions = (sessionResult.data ?? []) as SessionRecord[];
      const sessionIds = loadedSessions.map((session) => session.id);
      const setResult = sessionIds.length > 0
        ? await supabase
            .from('performed_sets')
            .select('session_id, actual_weight_kg, actual_reps, completed')
            .in('session_id', sessionIds)
        : { data: [], error: null };

      if (setResult.error) {
        setError(setResult.error.message);
        setLoading(false);
        return;
      }

      const groupedSets = ((setResult.data ?? []) as SetSummaryRecord[]).reduce<Record<string, SetSummaryRecord[]>>((acc, set) => {
        acc[set.session_id] = [...(acc[set.session_id] || []), set];
        return acc;
      }, {});

      setClient(clientResult.data as ClientRecord);
      setWorkout(workoutResult.data as WorkoutRecord);
      setSessions(loadedSessions);
      setSetsBySession(groupedSets);
      setLoading(false);
    };

    loadHistory();
  }, [clientId, workoutId]);

  if (loading) return <div className="p-6 md:p-8"><Card>Loading workout history...</Card></div>;
  if (error) return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Workout History</h1>
          <p className="mt-1 text-sm text-gray-600">{client?.full_name}{client?.email ? ` • ${client.email}` : ''}</p>
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">{workout?.title || 'Workout'} completed sessions.</p>
        </div>
        <Link href={`/coach/clients/${clientId}/program`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to programme</Link>
      </div>

      <section>
        <SectionHeader title="COMPLETED SESSIONS" accent />
        <Card>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-600">No completed sessions for this workout yet.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => {
                const sessionSets = setsBySession[session.id] || [];
                const completedSetCount = sessionSets.filter((set) => set.completed).length;
                const volume = getSessionVolume(sessionSets);
                return (
                  <Link key={session.id} href={`/coach/clients/${clientId}/workout-review/${session.id}`} className="block rounded-xl border border-gray-200 bg-white p-4 hover:bg-gray-50">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-lg font-black uppercase text-[#000000]">{formatDateTime(session.completed_at)}</p>
                        <p className="mt-1 text-sm text-gray-600">Top set: {getTopSet(sessionSets)} • Sets: {completedSetCount} • Volume: {Math.round(volume)}kg</p>
                        {session.client_notes && <p className="mt-2 line-clamp-2 text-sm text-gray-700">{session.client_notes}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <Badge variant={statusVariant(session.review_status) as any}>{session.review_status.replaceAll('_', ' ')}</Badge>
                        <span className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-bold uppercase text-[#000000]">Open review</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
