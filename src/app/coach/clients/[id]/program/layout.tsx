import type { ReactNode } from 'react';
import { AssignFromLibraryPanel } from '@/components/coach/assign-from-library-panel';
import { ProgramWorkoutExercisePreviews } from '@/components/coach/program-workout-exercise-previews';

type ProgramLayoutProps = {
  children: ReactNode;
};

export default function ProgramLayout({ children }: ProgramLayoutProps) {
  return (
    <>
      {children}
      <AssignFromLibraryPanel />
      <ProgramWorkoutExercisePreviews />
    </>
  );
}
