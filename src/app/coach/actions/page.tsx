'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/ui/section-header';
import { useEffect, useMemo, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

interface CoachActionRecord {
  id: string;
  action_type: string;
  description: string;
  due_date: string | null;
  status: string;
  priority: string;
  clients: {
    full_name: string;
  } | null;
}

interface SubmissionRecord {
  id: string;
  client_id: string;
  submission_type: string;
  submitted_at: string;
  answer_value: number | null;
  answer_text: string | null;
  review_status: string;
  followup_required: boolean;
}

interface ClientRecord {
  id: string;
  full_name: string;
}

interface WorkoutRecord {
  id: string;
  client_id: string;
  title: string;
  scheduled_date: string | null;
  status: string;
}

interface CompletedWorkoutRecord {
  program_workout_id: string;
}

const formatDate = (value: string | null) => {
  if (!value) return 'No due date';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const formatDateTime = (value: string) => {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const normaliseStatusForFilter = (status: string) => {
  if (status === 'done') return 'completed';
  if (status === 'in_progress') return 'in-progress';
  if (status === 'new') return 'pending';
  return status.replaceAll('_', '-');
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case 'done':
      return 'success';
    case 'in_progress':
    case 'waiting_on_client':
    case 'waiting_on_coach':
      return 'warning';
    case 'new':
      return 'default';
    default:
      return 'default';
  }
};

const getStatusLabel = (status: string) => {
  if (status === 'new') return 'Pending';
  if (status === 'in_progress') return 'In Progress';
  if (status === 'done') return 'Completed';
  if (status === 'no_action_needed') return 'No Action Needed';
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getActionTitle = (action: CoachActionRecord) => {
  return action.description || action.action_type.replaceAll('_', ' ');
};

const formatSubmissionType = (value: string) => value.replaceAll('_', ' ');

const submissionBadgeLabel = (submission: SubmissionRecord) => {
  if (submission.submission_type === 'weekly_checkin') return 'Review check-in';
  if (submission.submission_type === 'training_availability') return 'Use to schedule';
  if (submission.submission_type === 'workout_session') return 'Review workout';
  return 'Review';
};

export default function CoachActionsPage() {
  const [filteredStatus, setFilteredStatus] = useState('all');
  const [actions, setActions] = useState<CoachActionRecord[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionRecord[]>([]);
  const [clients, setClients] = useState<Record<string, string>>({});
  const [unscheduledWorkouts, setUnscheduledWorkouts] = useState<WorkoutRecord[]>([]);
  const [upcomingWorkouts, setUpcomingWorkouts] = useState<WorkoutRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadActions = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const [actionResult, submissionResult, workoutResult, completedWorkoutResult] = await Promise.all([
      supabase
        .from('coach_actions')
        .select('id, action_type, description, due_date, status, priority, clients(full_name)')
        .order('due_date', { ascending: true }),
      supabase
        .from('task_submissions')
        .select('id, client_id, submission_type, submitted_at, answer_value, answer_text, review_status, followup_required')
        .order('submitted_at', { ascending: false })
        .limit(50),
      supabase
        .from('program_workouts')
        .select('id, client_id, title, scheduled_date, status')
        .eq('status', 'active')
        .order('scheduled_date', { ascending: true, nullsFirst: false })
        .limit(100),
      supabase
        .from('workout_sessions')
        .select('program_workout_id')
        .eq('status', 'completed'),
    ]);

    if (actionResult.error) {
      setError(actionResult.error.message);
      setIsLoading(false);
      return;
    }

    if (submissionResult.error) {
      setError(submissionResult.error.message);
      setIsLoading(false);
      return;
    }

    if (workoutResult.error) {
      setError(workoutResult.error.message);
      setIsLoading(false);
      return;
    }

    if (completedWorkoutResult.error) {
      setError(completedWorkoutResult.error.message);
      setIsLoading(false);
      return;
    }

    const loadedSubmissions = (submissionResult.data ?? []) as SubmissionRecord[];
    const loadedWorkouts = (workoutResult.data ?? []) as WorkoutRecord[];
    const completedWorkoutIds = new Set(((completedWorkoutResult.data ?? []) as CompletedWorkoutRecord[]).map((session) => session.program_workout_id));
    const activeIncompleteWorkouts = loadedWorkouts.filter((workout) => !completedWorkoutIds.has(workout.id));

    const clientIds = Array.from(new Set([
      ...loadedSubmissions.map((submission) => submission.client_id),
      ...activeIncompleteWorkouts.map((workout) => workout.client_id),
    ]));

    if (clientIds.length > 0) {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name')
        .in('id', clientIds);

      if (clientError) {
        setError(clientError.message);
        setIsLoading(false);
        return;
      }

      const clientMap = ((clientData ?? []) as ClientRecord[]).reduce<Record<string, string>>((current, client) => {
        current[client.id] = client.full_name;
        return current;
      }, {});

      setClients(clientMap);
    }

    setActions((actionResult.data ?? []) as CoachActionRecord[]);
    setSubmissions(loadedSubmissions);
    setUnscheduledWorkouts(activeIncompleteWorkouts.filter((workout) => !workout.scheduled_date));
    setUpcomingWorkouts(activeIncompleteWorkouts.filter((workout) => workout.scheduled_date).slice(0, 10));
    setIsLoading(false);
  };

  useEffect(() => {
    loadActions();
  }, []);

  const filteredActions = useMemo(
    () =>
      filteredStatus === 'all'
        ? actions
        : actions.filter(
            (action) => normaliseStatusForFilter(action.status) === filteredStatus
          ),
    [actions, filteredStatus]
  );

  const newSubmissions = submissions.filter((submission) => submission.review_status !== 'reviewed');
  const recentlyReviewed = submissions.filter((submission) => submission.review_status === 'reviewed').slice(0, 6);
  const trainingAvailabilityToSchedule = newSubmissions.filter((submission) => submission.submission_type === 'training_availability');

  const handleComplete = async (actionId: string) => {
    if (!isSupabaseConfigured) return;

    const supabase = createClient();

    const { error: updateError } = await supabase
      .from('coach_actions')
      .update({
        status: 'done',
        completed_at: new Date().toISOString(),
      })
      .eq('id', actionId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setActions((currentActions) =>
      currentActions.map((action) =>
        action.id === actionId ? { ...action, status: 'done' } : action
      )
    );
  };

  const getSubmissionHref = (submission: SubmissionRecord) => {
    if (submission.submission_type === 'workout_session' && submission.answer_text) {
      return `/coach/clients/${submission.client_id}/workout-history?session=${submission.answer_text}`;
    }

    return `/coach/submissions/${submission.id}`;
  };

  const renderSubmission = (submission: SubmissionRecord) => (
    <Link
      key={submission.id}
      href={getSubmissionHref(submission)}
      className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-bold text-sm uppercase text-[#000000]">
            {formatSubmissionType(submission.submission_type)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {clients[submission.client_id] || 'Client'} • {formatDateTime(submission.submitted_at)}
          </p>
          {submission.followup_required && (
            <p className="mt-1 text-xs font-bold uppercase text-[#FA0201]">Follow-up required</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {submission.answer_value !== null && (
            <span className="text-sm font-bold text-gray-700">{submission.answer_value}/10</span>
          )}
          <Badge variant="default">{submissionBadgeLabel(submission)}</Badge>
        </div>
      </div>
    </Link>
  );

  return (
    <div className="p-6 md:p-8">
      <PageHeader
        title="ACTION QUEUE"
        subtitle="Everything that needs coach attention in one place"
      />

      <div className="mt-8 space-y-8">
        {isLoading && (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <p className="font-semibold text-gray-700">Loading actions...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="font-semibold text-red-700">{error}</p>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <section>
              <SectionHeader title="NEEDS REVIEW" accent />
              <Card>
                {newSubmissions.length === 0 ? (
                  <p className="text-sm text-gray-600">No new submissions need review.</p>
                ) : (
                  <div className="space-y-3">{newSubmissions.map(renderSubmission)}</div>
                )}
              </Card>
            </section>

            <section>
              <SectionHeader title="NEEDS SCHEDULING" accent />
              <Card>
                {trainingAvailabilityToSchedule.length === 0 && unscheduledWorkouts.length === 0 ? (
                  <p className="text-sm text-gray-600">No scheduling actions needed.</p>
                ) : (
                  <div className="space-y-4">
                    {trainingAvailabilityToSchedule.map((submission) => (
                      <Link key={submission.id} href={`/coach/clients/${submission.client_id}/schedule-workouts`} className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
                        <p className="font-bold uppercase text-[#000000]">Schedule workouts from availability</p>
                        <p className="mt-1 text-xs text-gray-500">{clients[submission.client_id] || 'Client'} • Availability submitted {formatDateTime(submission.submitted_at)}</p>
                      </Link>
                    ))}

                    {unscheduledWorkouts.map((workout) => (
                      <Link key={workout.id} href={`/coach/clients/${workout.client_id}/schedule-workouts`} className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
                        <p className="font-bold uppercase text-[#000000]">Unscheduled workout: {workout.title}</p>
                        <p className="mt-1 text-xs text-gray-500">{clients[workout.client_id] || 'Client'} • Needs a training date</p>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            <section>
              <SectionHeader title="UPCOMING SCHEDULED WORKOUTS" accent />
              <Card>
                {upcomingWorkouts.length === 0 ? (
                  <p className="text-sm text-gray-600">No upcoming scheduled workouts.</p>
                ) : (
                  <div className="space-y-3">
                    {upcomingWorkouts.map((workout) => (
                      <Link key={workout.id} href={`/coach/clients/${workout.client_id}/current-workouts`} className="block rounded-lg border border-gray-200 p-4 hover:bg-gray-50">
                        <p className="font-bold uppercase text-[#000000]">{workout.title}</p>
                        <p className="mt-1 text-xs text-gray-500">{clients[workout.client_id] || 'Client'} • {formatDate(workout.scheduled_date)}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </section>

            <section>
              <SectionHeader title="MANUAL COACH ACTIONS" accent />
              <div className="bg-white p-4 rounded-lg border border-gray-200 flex flex-wrap gap-2 mb-4">
                {['all', 'pending', 'in-progress', 'completed'].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setFilteredStatus(filter)}
                    className={`px-4 py-2 font-semibold uppercase text-sm rounded-lg transition-colors ${
                      filteredStatus === filter
                        ? 'bg-[#FA0201] text-white'
                        : 'bg-gray-200 text-[#000000] hover:bg-gray-300'
                    }`}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>

              {filteredActions.length === 0 ? (
                <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
                  <p className="text-gray-600 font-semibold">
                    No {filteredStatus === 'all' ? '' : filteredStatus} manual actions found
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredActions.map((action) => (
                    <Card key={action.id} className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <h3 className="text-lg font-bold uppercase text-[#000000]">
                            {getActionTitle(action)}
                          </h3>
                          <Badge
                            variant={getStatusBadgeVariant(action.status) as any}
                          >
                            {getStatusLabel(action.status)}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-xs font-semibold uppercase text-gray-500">
                              Type
                            </p>
                            <p className="text-gray-700">{action.action_type.replaceAll('_', ' ')}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-gray-500">
                              Client
                            </p>
                            <p className="text-gray-700">{action.clients?.full_name ?? 'No client linked'}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase text-gray-500">
                              Due Date
                            </p>
                            <p className="text-gray-700">{formatDate(action.due_date)}</p>
                          </div>
                        </div>
                      </div>

                      {action.status !== 'done' && (
                        <Button
                          onClick={() => handleComplete(action.id)}
                          variant="primary"
                          size="md"
                          className="w-full md:w-auto"
                        >
                          Complete
                        </Button>
                      )}

                      {action.status === 'done' && (
                        <div className="text-sm font-semibold text-green-600 uppercase">
                          ✓ Done
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </section>

            <section>
              <SectionHeader title="RECENTLY REVIEWED" accent />
              <Card>
                {recentlyReviewed.length === 0 ? (
                  <p className="text-sm text-gray-600">No reviewed submissions yet.</p>
                ) : (
                  <div className="space-y-3">{recentlyReviewed.map(renderSubmission)}</div>
                )}
              </Card>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
