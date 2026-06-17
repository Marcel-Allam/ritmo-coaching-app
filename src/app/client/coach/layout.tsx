import { CoachCallRequestUiFixes } from '@/components/client/coach-call-request-ui-fixes';

export default function ClientCoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CoachCallRequestUiFixes />
      {children}
    </>
  );
}
