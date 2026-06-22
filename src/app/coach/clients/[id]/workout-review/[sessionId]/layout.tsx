import type { ReactNode } from 'react';

type WorkoutReviewLayoutProps = {
  children: ReactNode;
};

export default function WorkoutReviewLayout({ children }: WorkoutReviewLayoutProps) {
  return <>{children}</>;
}
