import type { ReactNode } from 'react';
import { WorkoutFlagsLoader } from '@/components/coach/workout-flags-loader';

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
      {props.children}
    </>
  );
}
