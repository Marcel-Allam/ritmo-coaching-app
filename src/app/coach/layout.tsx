'use client';

import { AppShell } from '@/components/layout/app-shell';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, profile, loading } = useAuth();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!loading) {
      if (!user || profile?.role !== 'coach') {
        router.push('/login');
      }
      setIsChecking(false);
    }
  }, [user, profile, loading, router]);

  if (isChecking || loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#D9D9D9]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#FA0201]" />
          <p className="mt-4 text-[#000000] font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  return <AppShell role="coach">{children}</AppShell>;
}
