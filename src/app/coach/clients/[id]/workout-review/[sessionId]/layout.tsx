import { WorkoutFlagsLoader } from '@/components/coach/workout-flags-loader';

type WorkoutReviewLayoutProps = {
  children: React.ReactNode;
  params: {
    id: string;
    sessionId: string;
  };
};

export default function WorkoutReviewLayout({ children, params }: WorkoutReviewLayoutProps) {
  return (
    <>
      <WorkoutFlagsLoader clientId={params.id} sessionId={params.sessionId} />
      {children}
    </>
  );
}
