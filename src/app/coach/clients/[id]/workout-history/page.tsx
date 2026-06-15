'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = { id: string; full_name: string; email: string | null };
type SessionRecord = {
  id: string;
  program_workout_id: string;
  completed_at: string | null;
  review_status: string;
  client_notes: string | null;
};
type WorkoutRecord = { id: string; title: string; program_id: string };
type ProgramRecord = { id: string; title: string };
type PerformedSetRecord = {
  id: string;
  session_id: string;
  program_exercise_id: string;
  program_set_id: string | null;
  set_order: number;
  actual_weight_kg: number | null;
  actual_reps: number | null;
  actual_rpe: number | null;
  completed: boolean;
  notes: string | null;
};
type ProgramExerciseRecord = { id: string; exercise_order: number; exercise_name: string };
type ProgramSetRecord = { id: string; target_reps: string | null; target_weight_kg: number | null; notes: string | null };
type AnalysisSetRecord = {
  sessionId: string;
  exerciseOrder: number;
  exerciseName: string;
  setOrder: number;
  targetReps: string | null;
  targetWeightKg: number | null;
  prescribedNotes: string | null;
  actualWeightKg: number | null;
  actualReps: number | null;
  actualRpe: number | null;
  completed: boolean;
  clientSetNotes: string | null;
};
type FeedbackForm = {
  mainWin: string;
  mainFocus: string;
  agreedAction: string;
  planChange: string;
  nextReviewDate: string;
};

const blankFeedbackForm = (): FeedbackForm => ({
  mainWin: '',
  mainFocus: '',
  agreedAction: '',
  planChange: '',
  nextReviewDate: '',
});

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const todayDate = () => new Date().toISOString().slice(0, 10);
const formatWeight = (value: number | null) => (value === null || value === undefined ? '-' : `${value}kg`);
const formatReps = (value: string | number | null) => (value === null || value === undefined || value === '' ? '-' : `${value} reps`);

const getRpeClassName = (rpe: number | null) => {
  if (rpe === null || rpe === undefined) return 'bg-gray-100 text-gray-600';
  if (rpe >= 9.5) return 'bg-red-100 text-red-700';
  if (rpe >= 9) return 'bg-orange-100 text-orange-700';
  if (rpe >= 8) return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
};

const getRpeLabel = (rpe: number | null) => {
  if (rpe === null || rpe === undefined) return 'No RPE';
  if (rpe >= 9.5) return 'Near max';
  if (rpe >= 9) return 'Very hard';
  if (rpe >= 8) return 'Hard';
  return 'Manageable';
};

export default function CoachWorkoutHistoryPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const clientId = params.id as string;
  const requestedSessionId = searchParams.get('session');
  const { user } = useAuth();

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [workouts, setWorkouts] = useState<Record<string, WorkoutRecord>>({});
  const [programs, setPrograms] = useState<Record<string, ProgramRecord>>({});
  const [analysisSetsBySession, setAnalysisSetsBySession] = useState<Record<string, AnalysisSetRecord[]>>({});
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(requestedSessionId);
  const [feedbackForms, setFeedbackForms] = useState<Record<string, FeedbackForm>>({});
  const [loading, setLoading] = useState(true);
  const [savingReviewSessionId, setSavingReviewSessionId] = useState<string | null>(null);
  const [sendingFeedbackSessionId, setSendingFeedbackSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data: clientData, error: clientError } = await supabase
      .from('clients')
      .select('id, full_name, email')
      .eq('id', clientId)
      .single();

    if (clientError || !clientData) {
      setError(clientError?.message || 'Client not found.');
      setLoading(false);
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase
      .from('workout_sessions')
      .select('id, program_workout_id, completed_at, review_status, client_notes')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    if (sessionError) {
      setError(sessionError.message);
      setLoading(false);
      return;
    }

    const loadedSessions = (sessionData ?? []) as SessionRecord[];
    const workoutIds = [...new Set(loadedSessions.map((session) => session.program_workout_id))];
    const sessionIds = loadedSessions.map((session) => session.id);
    let workoutMap: Record<string, WorkoutRecord> = {};
    let programMap: Record<string, ProgramRecord> = {};
    let groupedAnalysisSets: Record<string, AnalysisSetRecord[]> = {};

    if (workoutIds.length > 0) {
      const { data: workoutData, error: workoutError } = await supabase
        .from('program_workouts')
        .select('id, title, program_id')
        .in('id', workoutIds);

      if (workoutError) {
        setError(workoutError.message);
        setLoading(false);
        return;
      }

      workoutMap = ((workoutData ?? []) as WorkoutRecord[]).reduce<Record<string, WorkoutRecord>>((acc, workout) => {
        acc[workout.id] = workout;
        return acc;
      }, {});

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

        programMap = ((programData ?? []) as ProgramRecord[]).reduce<Record<string, ProgramRecord>>((acc, program) => {
          acc[program.id] = program;
          return acc;
        }, {});
      }
    }

    if (sessionIds.length > 0) {
      const { data: performedData, error: performedError } = await supabase
        .from('performed_sets')
        .select('id, session_id, program_exercise_id, program_set_id, set_order, actual_weight_kg, actual_reps, actual_rpe, completed, notes')
        .in('session_id', sessionIds)
        .order('set_order', { ascending: true });

      if (performedError) {
        setError(performedError.message);
        setLoading(false);
        return;
      }

      const performedSets = (performedData ?? []) as PerformedSetRecord[];
      const exerciseIds = [...new Set(performedSets.map((set) => set.program_exercise_id))];
      const prescribedSetIds = [...new Set(performedSets.map((set) => set.program_set_id).filter(Boolean))] as string[];

      const [exerciseResult, prescribedSetResult] = await Promise.all([
        exerciseIds.length > 0
          ? supabase.from('program_exercises').select('id, exercise_order, exercise_name').in('id', exerciseIds)
          : Promise.resolve({ data: [], error: null }),
        prescribedSetIds.length > 0
          ? supabase.from('program_sets').select('id, target_reps, target_weight_kg, notes').in('id', prescribedSetIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (exerciseResult.error) {
        setError(exerciseResult.error.message);
        setLoading(false);
        return;
      }

      if (prescribedSetResult.error) {
        setError(prescribedSetResult.error.message);
        setLoading(false);
        return;
      }

      const exerciseMap = ((exerciseResult.data ?? []) as ProgramExerciseRecord[]).reduce<Record<string, ProgramExerciseRecord>>((acc, exercise) => {
        acc[exercise.id] = exercise;
        return acc;
      }, {});

      const prescribedSetMap = ((prescribedSetResult.data ?? []) as ProgramSetRecord[]).reduce<Record<string, ProgramSetRecord>>((acc, set) => {
        acc[set.id] = set;
        return acc;
      }, {});

      groupedAnalysisSets = performedSets.reduce<Record<string, AnalysisSetRecord[]>>((acc, performedSet) => {
        const exercise = exerciseMap[performedSet.program_exercise_id];
        const prescribedSet = performedSet.program_set_id ? prescribedSetMap[performedSet.program_set_id] : undefined;
        const row: AnalysisSetRecord = {
          sessionId: performedSet.session_id,
          exerciseOrder: exercise?.exercise_order ?? 999,
          exerciseName: exercise?.exercise_name ?? 'Exercise',
          setOrder: performedSet.set_order,
          targetReps: prescribedSet?.target_reps ?? null,
          targetWeightKg: prescribedSet?.target_weight_kg ?? null,
          prescribedNotes: prescribedSet?.notes ?? null,
          actualWeightKg: performedSet.actual_weight_kg,
          actualReps: performedSet.actual_reps,
          actualRpe: performedSet.actual_rpe,
          completed: performedSet.completed,
          clientSetNotes: performedSet.notes,
        };

        acc[performedSet.session_id] = [...(acc[performedSet.session_id] || []), row].sort((a, b) => {
          if (a.exerciseOrder !== b.exerciseOrder) return a.exerciseOrder - b.exerciseOrder;
          return a.setOrder - b.setOrder;
        });
        return acc;
      }, {});
    }

    setClient(clientData as ClientRecord);
    setSessions(loadedSessions);
    setWorkouts(workoutMap);
    setPrograms(programMap);
    setAnalysisSetsBySession(groupedAnalysisSets);
    setLoading(false);
  };

  useEffect(() => {
    loadHistory();
  }, [clientId]);

  const updateFeedbackForm = (sessionId: string, updates: Partial<FeedbackForm>) => {
    setFeedbackForms((current) => ({
      ...current,
      [sessionId]: { ...(current[sessionId] || blankFeedbackForm()), ...updates },
    }));
  };

  const markReviewed = async (sessionId: string) => {
    setSavingReviewSessionId(sessionId);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const [sessionResult, submissionResult] = await Promise.all([
      supabase.from('workout_sessions').update({ review_status: 'reviewed' }).eq('id', sessionId),
      supabase
        .from('task_submissions')
        .update({ review_status: 'reviewed' })
        .eq('submission_type', 'workout_session')
        .eq('answer_text', sessionId),
    ]);

    if (sessionResult.error) {
      setError(sessionResult.error.message);
      setSavingReviewSessionId(null);
      return;
    }

    if (submissionResult.error) {
      setError(submissionResult.error.message);
      setSavingReviewSessionId(null);
      return;
    }

    setSessions((current) => current.map((session) => (
      session.id === sessionId ? { ...session, review_status: 'reviewed' } : session
    )));
    setMessage('Workout marked as reviewed.');
    setSavingReviewSessionId(null);
  };

  const sendWorkoutFeedback = async (sessionId: string) => {
    if (!client) return;

    const form = feedbackForms[sessionId] || blankFeedbackForm();
    if (!form.mainWin.trim() && !form.mainFocus.trim() && !form.agreedAction.trim() && !form.planChange.trim()) {
      setError('Add at least one feedback field before sending.');
      return;
    }

    setSendingFeedbackSessionId(sessionId);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: feedbackError } = await supabase.from('feedback_notes').insert({
      client_id: client.id,
      coach_id: user?.id ?? null,
      feedback_date: todayDate(),
      main_win: form.mainWin.trim() || null,
      main_focus: form.mainFocus.trim() || null,
      agreed_action: form.agreedAction.trim() || null,
      plan_change: form.planChange.trim() || null,
      next_review_date: form.nextReviewDate || null,
      client_visible: true,
    });

    if (feedbackError) {
      setError(feedbackError.message);
      setSendingFeedbackSessionId(null);
      return;
    }

    const [sessionResult, submissionResult] = await Promise.all([
      supabase.from('workout_sessions').update({ review_status: 'reviewed' }).eq('id', sessionId),
      supabase
        .from('task_submissions')
        .update({ review_status: 'reviewed' })
        .eq('submission_type', 'workout_session')
        .eq('answer_text', sessionId),
    ]);

    if (sessionResult.error) {
      setError(sessionResult.error.message);
      setSendingFeedbackSessionId(null);
      return;
    }

    if (submissionResult.error) {
      setError(submissionResult.error.message);
      setSendingFeedbackSessionId(null);
      return;
    }

    setSessions((current) => current.map((session) => (
      session.id === sessionId ? { ...session, review_status: 'reviewed' } : session
    )));
    setFeedbackForms((current) => ({ ...current, [sessionId]: blankFeedbackForm() }));
    setMessage('Workout feedback sent to client and session marked as reviewed.');
    setSendingFeedbackSessionId(null);
  };

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading workout history...</Card></div>;
  }

  if (error && !client) {
    return <div className="p-6 md:p-8"><Card><p className="text-sm font-semibold text-red-700">{error}</p></Card></div>;
  }

  return (
    <div className="p-6 md:p-8 space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold uppercase text-[#000000] tracking-tight">Workout history</h1>
          <p className="mt-1 text-sm text-gray-600">{client?.full_name} • Expand each workout for set-by-set analysis.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
          <Link href={`/coach/clients/${clientId}/training`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Create workout</Link>
        </div>
      </div>

      {message && <Card className="border-2 border-green-200 bg-green-50"><p className="text-sm font-semibold text-green-700">{message}</p></Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50"><p className="text-sm font-semibold text-red-700">{error}</p></Card>}

      <section>
        <SectionHeader title="COMPLETED WORKOUTS" accent />
        <Card>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-600">No completed workout companion sessions yet.</p>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => {
                const workout = workouts[session.program_workout_id];
                const program = workout ? programs[workout.program_id] : null;
                const analysisRows = analysisSetsBySession[session.id] || [];
                const isExpanded = expandedSessionId === session.id;
                const highRpeCount = analysisRows.filter((row) => (row.actualRpe ?? 0) >= 9).length;
                const missedSetCount = analysisRows.filter((row) => !row.completed).length;
                const form = feedbackForms[session.id] || blankFeedbackForm();

                return (
                  <div key={session.id} className="rounded-xl border border-gray-200 bg-white">
                    <button type="button" onClick={() => setExpandedSessionId(isExpanded ? null : session.id)} className="w-full p-4 text-left">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs font-bold uppercase text-gray-500">{formatDate(session.completed_at)}</p>
                          <p className="mt-1 text-lg font-bold uppercase text-[#000000]">{workout?.title || 'Workout'}</p>
                          <p className="mt-1 text-sm text-gray-600">Programme: {program?.title || 'Programme not found'}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={session.review_status === 'reviewed' ? 'success' : 'default'}>{session.review_status}</Badge>
                          {highRpeCount > 0 && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-bold uppercase text-red-700">{highRpeCount} high RPE</span>}
                          {missedSetCount > 0 && <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold uppercase text-gray-700">{missedSetCount} incomplete</span>}
                          <span className="text-xl font-bold text-[#FA0201]">{isExpanded ? '−' : '+'}</span>
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200 p-4 space-y-6">
                        {session.client_notes && <p className="text-sm text-gray-700">Client notes: {session.client_notes}</p>}
                        <div className="overflow-x-auto">
                          <div className="min-w-[820px] rounded-lg border border-gray-200">
                            <div className="grid grid-cols-[1.5fr_0.7fr_1.3fr_1.3fr_0.9fr_0.9fr_1.5fr] gap-3 bg-gray-100 px-4 py-3 text-xs font-bold uppercase text-gray-600">
                              <p>Exercise</p>
                              <p>Set</p>
                              <p>Prescribed</p>
                              <p>Performed</p>
                              <p>RPE</p>
                              <p>Status</p>
                              <p>Notes</p>
                            </div>
                            {analysisRows.length === 0 ? (
                              <p className="px-4 py-4 text-sm text-gray-600">No set data found for this session.</p>
                            ) : (
                              analysisRows.map((row, index) => (
                                <div key={`${session.id}-${index}`} className="grid grid-cols-[1.5fr_0.7fr_1.3fr_1.3fr_0.9fr_0.9fr_1.5fr] gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-800">
                                  <p className="font-semibold">{row.exerciseName}</p>
                                  <p>Set {row.setOrder}</p>
                                  <p>{formatWeight(row.targetWeightKg)} × {formatReps(row.targetReps)}</p>
                                  <p>{formatWeight(row.actualWeightKg)} × {formatReps(row.actualReps)}</p>
                                  <p>
                                    <span className={`rounded-full px-2 py-1 text-xs font-bold uppercase ${getRpeClassName(row.actualRpe)}`}>
                                      {row.actualRpe ?? '-'} • {getRpeLabel(row.actualRpe)}
                                    </span>
                                  </p>
                                  <p>{row.completed ? 'Complete' : 'Incomplete'}</p>
                                  <p className="text-gray-600">{row.clientSetNotes || row.prescribedNotes || '-'}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <p className="mb-3 text-sm font-bold uppercase text-[#000000]">Send workout feedback to client</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <textarea value={form.mainWin} onChange={(event) => updateFeedbackForm(session.id, { mainWin: event.target.value })} placeholder="Main win" className="min-h-20 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm" />
                            <textarea value={form.mainFocus} onChange={(event) => updateFeedbackForm(session.id, { mainFocus: event.target.value })} placeholder="Main focus" className="min-h-20 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm" />
                            <textarea value={form.agreedAction} onChange={(event) => updateFeedbackForm(session.id, { agreedAction: event.target.value })} placeholder="Agreed action" className="min-h-20 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm" />
                            <textarea value={form.planChange} onChange={(event) => updateFeedbackForm(session.id, { planChange: event.target.value })} placeholder="Plan change" className="min-h-20 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm" />
                          </div>
                          <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 md:items-end">
                            <div>
                              <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Next review date</label>
                              <input type="date" value={form.nextReviewDate} onChange={(event) => updateFeedbackForm(session.id, { nextReviewDate: event.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm" />
                            </div>
                            <Button type="button" onClick={() => sendWorkoutFeedback(session.id)} isLoading={sendingFeedbackSessionId === session.id} className="bg-[#FA0201] hover:bg-red-700">
                              Send feedback
                            </Button>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            onClick={() => markReviewed(session.id)}
                            isLoading={savingReviewSessionId === session.id}
                            disabled={session.review_status === 'reviewed'}
                          >
                            {session.review_status === 'reviewed' ? 'Reviewed' : 'Mark reviewed without feedback'}
                          </Button>
                        </div>
                      </div>
                    )}
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
