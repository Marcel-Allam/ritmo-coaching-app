'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = { id: string; full_name: string; email: string | null };
type AvailabilitySubmissionRecord = {
  id: string;
  submitted_at: string;
  answer_value: number | null;
  answer_text: string | null;
  review_status: string;
};
type WorkoutRecord = {
  id: string;
  title: string;
  program_id: string;
  scheduled_date: string | null;
  workout_order: number;
};
type ProgramRecord = { id: string; title: string };
type SessionRecord = { program_workout_id: string };

const formatDateTime = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

export default function CoachScheduleWorkoutsPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [availability, setAvailability] = useState<AvailabilitySubmissionRecord | null>(null);
  const [workouts, setWorkouts] = useState<WorkoutRecord[]>([]);
  const [programs, setPrograms] = useState<Record<string, ProgramRecord>>({});
  const [scheduleDates, setScheduleDates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSchedule = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const [clientResult, availabilityResult, workoutResult, completedResult] = await Promise.all([
      supabase
        .from('clients')
        .select('id, full_name, email')
        .eq('id', clientId)
        .single(),
      supabase
        .from('task_submissions')
        .select('id, submitted_at, answer_value, answer_text, review_status')
        .eq('client_id', clientId)
        .eq('submission_type', 'training_availability')
        .order('submitted_at', { ascending: false })
        .limit(1),
      supabase
        .from('program_workouts')
        .select('id, title, program_id, scheduled_date, workout_order')
        .eq('client_id', clientId)
        .eq('status', 'active')
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

    if (availabilityResult.error) {
      setError(availabilityResult.error.message);
      setLoading(false);
      return;
    }

    if (workoutResult.error) {
      setError(workoutResult.error.message);
      setLoading(false);
      return;
    }

    if (completedResult.error) {
      setError(completedResult.error.message);
      setLoading(false);
      return;
    }

    const completedWorkoutIds = new Set(((completedResult.data ?? []) as SessionRecord[]).map((session) => session.program_workout_id));
    const availableWorkouts = ((workoutResult.data ?? []) as WorkoutRecord[]).filter((workout) => !completedWorkoutIds.has(workout.id));
    const programIds = [...new Set(availableWorkouts.map((workout) => workout.program_id))];

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

    const initialDates = availableWorkouts.reduce<Record<string, string>>((acc, workout) => {
      acc[workout.id] = workout.scheduled_date || '';
      return acc;
    }, {});

    setClient(clientResult.data as ClientRecord);
    setAvailability(((availabilityResult.data ?? []) as AvailabilitySubmissionRecord[])[0] ?? null);
    setWorkouts(availableWorkouts);
    setPrograms(programMap);
    setScheduleDates(initialDates);
    setLoading(false);
  };

  useEffect(() => {
    loadSchedule();
  }, [clientId]);

  const updateWorkoutDate = (workoutId: string, date: string) => {
    setScheduleDates((current) => ({ ...current, [workoutId]: date }));
  };

  const saveSchedule = async () => {
    if (!isSupabaseConfigured) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const updates = workouts.map((workout) => (
      supabase
        .from('program_workouts')
        .update({ scheduled_date: scheduleDates[workout.id] || null })
        .eq('id', workout.id)
    ));

    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);

    if (failed?.error) {
      setError(failed.error.message);
      setSaving(false);
      return;
    }

    setWorkouts((current) => current.map((workout) => ({
      ...workout,
      scheduled_date: scheduleDates[workout.id] || null,
    })));
    setMessage('Workout schedule saved. The client can now see these sessions by date.');
    setSaving(false);
  };

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading workout scheduler...</Card></div>;
  }

  if (error && !client) {
    return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;
  }

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold uppercase text-[#000000] tracking-tight">Schedule workouts</h1>
          <p className="mt-1 text-sm text-gray-600">{client?.full_name} • Assign created workouts to real training days.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
          <Link href={`/coach/clients/${clientId}/training`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Create workout</Link>
        </div>
      </div>

      {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      <section>
        <SectionHeader title="LATEST AVAILABILITY" accent />
        <Card>
          {availability ? (
            <div className="space-y-4">
              <p className="text-xs font-bold uppercase text-gray-500">Submitted {formatDateTime(availability.submitted_at)}</p>
              <div className="rounded-lg bg-gray-100 p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">{availability.answer_text}</pre>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">No training availability submission found yet.</p>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader title="ASSIGN DATES" accent />
        <Card>
          {workouts.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">No active unscheduled workouts found. Create workouts first, then come back to schedule them.</p>
              <Link href={`/coach/clients/${clientId}/training`} className="inline-block text-sm font-bold uppercase text-[#FA0201] hover:underline">
                Create workout
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {workouts.map((workout) => {
                const program = programs[workout.program_id];
                return (
                  <div key={workout.id} className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-4 rounded-lg border border-gray-200 p-4">
                    <div>
                      <p className="text-xs font-bold uppercase text-gray-500">{program?.title || 'Programme'}</p>
                      <p className="mt-1 text-lg font-bold uppercase text-[#000000]">{workout.title}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-600 mb-2">Scheduled date</label>
                      <input
                        type="date"
                        value={scheduleDates[workout.id] || ''}
                        onChange={(event) => updateWorkoutDate(workout.id, event.target.value)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                      />
                    </div>
                  </div>
                );
              })}

              <div className="flex justify-end">
                <Button type="button" onClick={saveSchedule} isLoading={saving} className="bg-[#FA0201] hover:bg-red-700">
                  Save workout schedule
                </Button>
              </div>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
