import type { ReactNode } from 'react';
import { ChangeProgrammePanel } from '@/components/coach/change-programme-panel';

type ProgramLayoutProps = {
  children: ReactNode;
};

export default function ProgramLayout({ children }: ProgramLayoutProps) {
  return (
    <>
      {children}
      <ChangeProgrammePanel />
    </>
  );
}
