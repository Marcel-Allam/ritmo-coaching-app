import type { ReactNode } from 'react';
import { ChangeProgrammeConfirmPanel } from '@/components/coach/change-programme-confirm-panel';

type ProgramLayoutProps = {
  children: ReactNode;
};

export default function ProgramLayout({ children }: ProgramLayoutProps) {
  return (
    <>
      {children}
      <ChangeProgrammeConfirmPanel />
    </>
  );
}
