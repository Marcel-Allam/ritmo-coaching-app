import type { ReactNode } from 'react';
import { ProgramWorkoutExercisePreviews } from '@/components/coach/program-workout-exercise-previews';

type ProgramLayoutProps = {
  children: ReactNode;
};

export default function ProgramLayout({ children }: ProgramLayoutProps) {
  return (
    <>
      {children}
      <ProgramWorkoutExercisePreviews />
    </>
  );
}
