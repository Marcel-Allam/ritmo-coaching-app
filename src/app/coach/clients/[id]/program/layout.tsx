import type { ReactNode } from 'react';
import { AssignFromLibraryPanel } from '@/components/coach/assign-from-library-panel';

type ProgramLayoutProps = {
  children: ReactNode;
};

export default function ProgramLayout({ children }: ProgramLayoutProps) {
  return (
    <>
      {children}
      <AssignFromLibraryPanel />
    </>
  );
}
