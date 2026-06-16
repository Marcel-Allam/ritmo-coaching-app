import type { ReactNode } from 'react';
import { WorkoutFlagsLoader } from '@/components/coach/workout-flags-loader';
import { WorkoutNoteFlagsLoader } from '@/components/coach/workout-note-flags-loader';
import { WorkoutAdvancedFlagsLoader } from '@/components/coach/workout-advanced-flags-loader';
import { WorkoutNextSessionDecision } from '@/components/coach/workout-next-session-decision';

type WorkoutReviewLayoutProps = {
  children: ReactNode;
  params: Promise<{
    id: string;
    sessionId: string;
  }>;
};

export default async function WorkoutReviewLayout(props: WorkoutReviewLayoutProps) {
  const routeParams = await props.params;

  return (
    <>
      <WorkoutFlagsLoader clientId={routeParams.id} sessionId={routeParams.sessionId} />
      <WorkoutNoteFlagsLoader sessionId={routeParams.sessionId} />
      <WorkoutAdvancedFlagsLoader clientId={routeParams.id} sessionId={routeParams.sessionId} />
      <WorkoutNextSessionDecision clientId={routeParams.id} sessionId={routeParams.sessionId} />
      {props.children}
    </>
  );
}
