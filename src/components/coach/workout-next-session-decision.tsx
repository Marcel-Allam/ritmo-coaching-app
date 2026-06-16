'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { Textarea } from '@/components/ui/textarea';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type DecisionValue =
  | 'keep_as_planned'
  | 'increase_load'
  | 'reduce_load'
  | 'reduce_volume'
  | 'repeat_session'
  | 'swap_exercise'
  | 'add_technique_cue'
  | 'needs_follow_up';

type DecisionOption = {
  value: DecisionValue;
  label: string;
  priority: 'low' | 'medium' | 'high';
};

type WorkoutSessionRecord = {
  id: string;
  client_id: string;
  program_workout_id: string;
};

type ProgramWorkoutRecord = {
  id: string;
  program_id: string;
  title: string;
  scheduled_date: string | null;
  workout_order: number | null;
  instructions: string | null;
};

type WorkoutNextSessionDecisionProps = {
  clientId: string;
  sessionId: string;
};

const decisionOptions: DecisionOption[] = [
  { value: 'keep_as_planned', label: 'Keep as planned', priority: 'low' },
  { value: 'increase_load', label: 'Increase load', priority: 'medium' },
  { value: 'reduce_load', label: 'Reduce load', priority: 'medium' },
  { value: 'reduce_volume', label: 'Reduce volume', priority: 'medium' },
  { value: 'repeat_session', label: 'Repeat session', priority: 'medium' },
  { value: 'swap_exercise', label: 'Swap exercise', priority: 'medium' },
  { value: 'add_technique_cue', label: 'Add technique cue', priority: 'low' },
  { value: 'needs_follow_up', label: 'Needs follow-up', priority: 'high' },
];

const todayDate = () => new Date().toISOString().slice(0, 10);

const formatDate = (value: string | null) => {
  if (!value) return 'No date set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const findNextWorkout = (currentWorkout: ProgramWorkoutRecord, workouts: ProgramWorkoutRecord[]) => {
  const currentIndex = workouts.findIndex((workout) => workout.id === currentWorkout.id);
  if (currentIndex >= 0) return workouts[currentIndex + 1] || null;

  return workouts.find((workout) => workout.id !== currentWorkout.id) || null;
};

export function WorkoutNextSessionDecision({ clientId, sessionId }: WorkoutNextSessionDecisionProps) {
  const [decision, setDecision] = useState<DecisionValue>('keep_as_planned');
  const [adjustmentNote, setAdjustmentNote] = useState('');
  const [workoutTitle, setWorkoutTitle] = useState('Completed workout');
  const [nextWorkout, setNextWorkout] = useState<ProgramWorkoutRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWorkoutContext = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: sessionData, error: sessionError } = await supabase
        .from('workout_sessions')
        .select('id, client_id, program_workout_id')
        .eq('id', sessionId)
        .eq('client_id', clientId)
        .single();

      if (sessionError || !sessionData) {
        setError(sessionError?.message || 'Workout session not found.');
        setIsLoading(false);
        return;
      }

      const session = sessionData as WorkoutSessionRecord;
      const { data: currentWorkoutData, error: workoutError } = await supabase
        .from('program_workouts')
        .select('id, program_id, title, scheduled_date, workout_order, instructions')
        .eq('id', session.program_workout_id)
        .single();

      if (workoutError || !currentWorkoutData) {
        setError(workoutError?.message || 'Workout not found.');
        setIsLoading(false);
        return;
      }

      const currentWorkout = currentWorkoutData as ProgramWorkoutRecord;
      setWorkoutTitle(currentWorkout.title || 'Completed workout');

      const { data: workoutListData, error: workoutListError } = await supabase
        .from('program_workouts')
        .select('id, program_id, title, scheduled_date, workout_order, instructions')
        .eq('client_id', clientId)
        .eq('program_id', currentWorkout.program_id)
        .eq('status', 'active')
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .order('workout_order', { ascending: true });

      if (workoutListError) {
        setError(workoutListError.message);
        setIsLoading(false);
        return;
      }

      setNextWorkout(findNextWorkout(currentWorkout, (workoutListData ?? []) as ProgramWorkoutRecord[]));
      setIsLoading(false);
    };

    loadWorkoutContext();
  }, [clientId, sessionId]);

  const selectedDecision = decisionOptions.find((option) => option.value === decision) || decisionOptions[0];

  const buildDecisionDescription = () => [
    `Next session decision: ${selectedDecision.label}`,
    adjustmentNote.trim() ? `Adjustment note: ${adjustmentNote.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const createCoachAction = async () => {
    const supabase = createClient();

    return supabase.from('coach_actions').insert({
      client_id: clientId,
      action_type: 'next_session_decision',
      description: buildDecisionDescription(),
      priority: selectedDecision.priority,
      due_date: todayDate(),
      status: 'new',
      notes: `Created from workout review. Workout: ${workoutTitle}. Session ID: ${sessionId}.`,
    });
  };

  const saveDecision = async () => {
    if (!isSupabaseConfigured) return;

    setIsSaving(true);
    setMessage(null);
    setError(null);

    const { error: actionError } = await createCoachAction();

    if (actionError) {
      setError(actionError.message);
      setIsSaving(false);
      return;
    }

    setMessage('Next session decision saved as a coach action.');
    setAdjustmentNote('');
    setIsSaving(false);
  };

  const applyDecisionToNextWorkout = async () => {
    if (!isSupabaseConfigured || !nextWorkout) return;

    setIsApplying(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const decisionBlock = [
      '[RITMO_NEXT_SESSION_DECISION]',
      `Reviewed workout: ${workoutTitle}`,
      `Decision: ${selectedDecision.label}`,
      adjustmentNote.trim() ? `Adjustment note: ${adjustmentNote.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const updatedInstructions = [nextWorkout.instructions?.trim(), decisionBlock]
      .filter(Boolean)
      .join('\n\n');

    const { error: workoutUpdateError } = await supabase
      .from('program_workouts')
      .update({ instructions: updatedInstructions })
      .eq('id', nextWorkout.id)
      .eq('client_id', clientId);

    if (workoutUpdateError) {
      setError(workoutUpdateError.message);
      setIsApplying(false);
      return;
    }

    const { error: actionError } = await createCoachAction();

    if (actionError) {
      setError(actionError.message);
      setIsApplying(false);
      return;
    }

    setNextWorkout({ ...nextWorkout, instructions: updatedInstructions });
    setMessage(`Decision applied to ${nextWorkout.title} and saved as a coach action.`);
    setAdjustmentNote('');
    setIsApplying(false);
  };

  if (isLoading) return null;

  return (
    <div className="px-6 pt-4 md:px-8 md:pt-5">
      <section>
        <SectionHeader title="NEXT SESSION DECISION" accent />
        <Card className="space-y-4 p-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
            <p className="font-bold uppercase text-gray-500">Target next workout</p>
            <p className="mt-1 font-semibold text-[#000000]">
              {nextWorkout ? `${nextWorkout.title} • ${formatDate(nextWorkout.scheduled_date)}` : 'No next active workout found in this programme.'}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-[240px_1fr]">
            <div>
              <label htmlFor="next-session-decision" className="text-xs font-bold uppercase text-gray-500">
                Coach decision
              </label>
              <select
                id="next-session-decision"
                value={decision}
                onChange={(event) => setDecision(event.target.value as DecisionValue)}
                className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-[#000000] outline-none focus:border-[#FA0201]"
              >
                {decisionOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <Textarea
              label="Adjustment note"
              value={adjustmentNote}
              onChange={(event) => setAdjustmentNote(event.target.value)}
              placeholder="Example: Bench Press — repeat 95kg x 6 next week. Keep target RPE 8 and cue tighter pause."
            />
          </div>

          {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
          {message && <p className="text-xs font-semibold text-green-700">{message}</p>}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isSaving || isApplying}
              onClick={saveDecision}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-bold uppercase text-[#000000] hover:bg-gray-50 disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save action only'}
            </button>
            <button
              type="button"
              disabled={isSaving || isApplying || !nextWorkout}
              onClick={applyDecisionToNextWorkout}
              className="rounded-lg bg-[#000000] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-gray-900 disabled:opacity-60"
            >
              {isApplying ? 'Applying...' : 'Apply to next workout'}
            </button>
          </div>
        </Card>
      </section>
    </div>
  );
}
