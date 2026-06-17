import type { ReactNode } from 'react';
import { AddClientFormUiFixes } from '@/components/coach/add-client-form-ui-fixes';

export default function CoachClientsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AddClientFormUiFixes />
      {children}
    </>
  );
}
