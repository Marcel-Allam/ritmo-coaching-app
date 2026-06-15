'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

interface AppShellProps {
  role: 'coach' | 'client';
  children: React.ReactNode;
}

const HomeIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const ClipboardIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
  </svg>
);

const MessageIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const DumbbellIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16M4 8h16M4 12h16M4 16h16" />
  </svg>
);

const HistoryIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const NutritionIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m5-15H9.5a3.5 3.5 0 000 7H14a3.5 3.5 0 010 7H7" />
  </svg>
);

const LogOutIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
  </svg>
);

const coachNavItems = [
  { label: 'Dashboard', href: '/coach', icon: HomeIcon },
  { label: 'Clients', href: '/coach/clients', icon: UsersIcon },
  { label: 'Actions', href: '/coach/actions', icon: ClipboardIcon },
  { label: 'Catalogue', href: '/coach/exercise-catalogue', icon: DumbbellIcon },
  { label: 'Feedback', href: '/coach/feedback', icon: MessageIcon },
];

const clientNavItems = [
  { label: 'Hub', href: '/client', icon: HomeIcon },
  { label: 'Tasks', href: '/client/tasks', icon: CheckIcon },
  { label: 'Start your workout', href: '/client/training', icon: DumbbellIcon },
  { label: 'Completed Workouts', href: '/client/training/history', icon: HistoryIcon },
  { label: 'Submit', href: '/client/submit', icon: PlusIcon },
  { label: 'Feedback', href: '/client/feedback', icon: MessageIcon },
];

export const AppShell: React.FC<AppShellProps> = ({ role, children }) => {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const clientRouteMatch = pathname.match(/^\/coach\/clients\/([^/]+)/);
  const clientId = clientRouteMatch?.[1];
  const contextualCoachItems = clientId
    ? [{ label: 'Nutrition', href: `/coach/clients/${clientId}/nutrition`, icon: NutritionIcon }]
    : [];
  const navItems = role === 'coach' ? [...coachNavItems, ...contextualCoachItems] : clientNavItems;

  const isActive = (href: string) => {
    if (href === '/coach' && pathname === '/coach') return true;
    if (href === '/client' && pathname === '/client') return true;
    if (href !== '/coach' && href !== '/client' && pathname.startsWith(href)) return true;
    return false;
  };

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    await signOut();
  };

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-black border-b border-gray-800 shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="text-2xl font-bold text-[#FA0201] tracking-tight">RITMO</div>
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-9 h-9 rounded-full bg-[#FA0201] text-white flex items-center justify-center text-sm font-bold"
            >
              {initials}
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-black border border-gray-700 rounded-lg shadow-xl z-50">
                  <div className="px-4 py-3 border-b border-gray-700">
                    <p className="text-sm font-semibold text-white">{profile?.full_name}</p>
                    <p className="text-xs text-gray-400">{profile?.email}</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left px-4 py-3 text-sm text-gray-300 hover:bg-gray-900 flex items-center gap-2 rounded-b-lg"
                  >
                    <LogOutIcon />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav className="hidden md:flex md:flex-col md:w-60 bg-black shrink-0">
          <div className="flex-1 overflow-y-auto py-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-6 py-3 text-white transition-colors ${
                    active
                      ? 'border-l-4 border-[#FA0201] bg-gray-900 font-semibold'
                      : 'border-l-4 border-transparent hover:bg-gray-900'
                  }`}
                >
                  <Icon />
                  <span className="text-sm">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <main className="flex-1 overflow-y-auto bg-[#D9D9D9] pb-20 md:pb-0">
          {children}
        </main>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 z-30">
        <div className="flex items-center justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center py-3 text-white transition-colors ${
                  active
                    ? 'border-b-2 border-[#FA0201] text-[#FA0201]'
                    : 'border-b-2 border-transparent'
                }`}
              >
                <Icon />
                <span className="text-[10px] mt-1 font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
