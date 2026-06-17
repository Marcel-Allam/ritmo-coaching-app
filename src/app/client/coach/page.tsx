'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = { id: string; full_name: string };

type AssignedTaskRecord = {
  id: string;
  task_type: string;
  task_name: string;
  instructions: string | null;
};

type MeetingStatus = 'none' | 'requested' | 'confirmed';

type MeetingDraft = {
  status: MeetingStatus;
  dateLabel: string;
  notes: string;
};

const defaultMeetingDraft: MeetingDraft = {
  status: 'none',
  dateLabel: 'Tomorrow, 16:00',
  notes: '',
};

const coachRequestRoutes: Record<string, string> = {
  key_lift: '/client/submit/key-lift',
  workout_checkin: '/client/submit/workout-checkin',
  weekly_checkin: '/client/submit/weekly-checkin',
};

const formatTaskType = (taskType: string) => taskType.replaceAll('_', ' ');

export default function ClientCoachPage() {
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [meeting, setMeeting] = useState<MeetingDraft>(defaultMeetingDraft);
  const [quickNote, setQuickNote] = useState('');
  const [extraSupportReason, setExtraSupportReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadCoachPage = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Client login is not ready.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        setMessage('This login is not linked to a client profile yet.');
        setLoading(false);
        return;
      }

      const linkedClient = clientData as ClientRecord;
      setClient(linkedClient);

      const { data: taskData, error: taskError } = await supabase
        .from('assigned_tasks')
        .select('id, task_type, task_name, instructions')
        .eq('client_id', linkedClient.id)
        .eq('active', true)
        .in('task_type', ['weekly_checkin', 'key_lift', 'workout_checkin'])
        .order('created_at', { ascending: false });

      if (taskError) {
        setMessage(taskError.message);
        setLoading(false);
        return;
      }

      setTasks((taskData ?? []) as AssignedTaskRecord[]);
      setLoading(false);
    };

    loadCoachPage();
  }, [user]);

  const weeklyCheckInTask = useMemo(() => tasks.find((task) => task.task_type === 'weekly_checkin'), [tasks]);
  const coachRequestedTasks = useMemo(() => tasks.filter((task) => task.task_type !== 'weekly_checkin'), [tasks]);

  const requestWeeklyCall = () => {
    setMeeting({
      status: 'requested',
      dateLabel: 'Tomorrow, 16:00',
      notes: quickNote.trim(),
    });
    setMessage('Weekly coach meeting requested. Booking storage will be wired in the next build.');
  };

  const requestExtraSupport = () => {
    if (!extraSupportReason.trim()) {
      setMessage('Add a reason before requesting extra support.');
      return;
    }

    setMeeting({
      status: 'requested',
      dateLabel: 'Tomorrow, 16:00',
      notes: extraSupportReason.trim(),
    });
    setMessage('Extra support request prepared. Booking storage will be wired in the next build.');
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <PageHeader title="COACH" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
            <Card><p className="font-semibold text-gray-700">Loading coach hub...</p></Card>
          </div>
        </main>
      </div>
    );
  }

  if (message && !client) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <PageHeader title="COACH" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-8">
            <Card>
              <p className="font-bold uppercase text-[#000000]">Coach hub unavailable</p>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader title="COACH" subtitle={client ? `Your coaching support hub, ${client.full_name}` : 'Your coaching support hub'} />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-8">
          {message && (
            <Card>
              <p className="text-sm font-semibold text-gray-800">{message}</p>
            </Card>
          )}

          <section>
            <SectionHeader title="COACH MEETING" accent />
            <Card variant="dark" className="p-8">
              {meeting.status === 'none' ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-bold uppercase text-[#FA0201]">No meeting booked</p>
                    <h1 className="mt-2 text-4xl font-black uppercase tracking-tight text-white md:text-6xl">
                      Book your next coach call
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
                      Use this area for your weekly call or for extra support before the next review. Once requested, this card will show the meeting date, status, and notes.
                    </p>
                  </div>

                  <Textarea
                    label="Notes for your coach"
                    value={quickNote}
                    onChange={(event) => setQuickNote(event.target.value)}
                    placeholder="Example: Talk through next week, adjust a session, or review an exercise that felt off."
                  />

                  <div className="flex flex-wrap gap-3">
                    <Button type="button" onClick={requestWeeklyCall} className="bg-[#FA0201] hover:bg-red-700">
                      Book weekly call
                    </Button>
                    <Link href="/client/submit/weekly-checkin">
                      <Button type="button" variant="outline">Start written check-in</Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <div>
                  <h1 className="text-5xl font-black uppercase tracking-tight text-white md:text-7xl">Coach Meeting</h1>
                  <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
                    <div className="rounded-xl border-2 border-white p-5 text-white">
                      <p className="text-2xl font-bold">Date:</p>
                      <p className="mt-2 text-3xl">{meeting.dateLabel}</p>
                      <div className="mt-12 border-t border-white/40 pt-5">
                        <p className="text-2xl font-bold">Status:</p>
                        <p className="mt-2 text-3xl font-bold text-green-400">
                          {meeting.status === 'confirmed' ? 'Confirmed' : 'Requested'}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-xl border-2 border-white p-5 text-white">
                      <p className="text-2xl font-bold">Notes</p>
                      {meeting.notes ? (
                        <ul className="mt-3 list-disc space-y-3 pl-5 text-2xl leading-snug">
                          {meeting.notes.split('\n').filter(Boolean).map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-lg text-white/70">No notes added yet.</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <Button type="button" variant="outline" onClick={() => setMeeting(defaultMeetingDraft)}>Cancel request</Button>
                    <Button type="button" onClick={() => setMeeting((current) => ({ ...current, status: 'confirmed' }))} className="bg-[#FA0201] hover:bg-red-700">
                      Mock confirm
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </section>

          <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-6">
              <p className="text-xs font-bold uppercase text-gray-500">Weekly check-in</p>
              <h2 className="mt-1 text-2xl font-black uppercase text-[#000000]">Light written update</h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-700">
                Use this if your coach needs written context before your call. Keep it short: score the week, note the main win, and flag anything important.
              </p>
              <div className="mt-5">
                <Link href={coachRequestRoutes.weekly_checkin}>
                  <Button type="button" className="bg-[#FA0201] hover:bg-red-700">
                    {weeklyCheckInTask ? 'Complete weekly check-in' : 'Start weekly check-in'}
                  </Button>
                </Link>
              </div>
            </Card>

            <Card className="p-6">
              <p className="text-xs font-bold uppercase text-gray-500">Extra support</p>
              <h2 className="mt-1 text-2xl font-black uppercase text-[#000000]">Need help before the next call?</h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-700">
                Request extra support when something cannot wait for the normal weekly call. A reason is required so your coach knows what to prioritise.
              </p>
              <Textarea
                label="Reason for extra support"
                value={extraSupportReason}
                onChange={(event) => setExtraSupportReason(event.target.value)}
                placeholder="Example: Need help adjusting a session, checking a schedule issue, or reviewing something from training."
              />
              <div className="mt-5">
                <Button type="button" onClick={requestExtraSupport} className="bg-[#000000] hover:bg-gray-900">
                  Request extra support
                </Button>
              </div>
            </Card>
          </section>

          {coachRequestedTasks.length > 0 && (
            <section>
              <SectionHeader title="COACH REQUESTS" accent />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {coachRequestedTasks.map((task) => (
                  <Link key={task.id} href={coachRequestRoutes[task.task_type] ?? '/client/coach'}>
                    <Card className="h-full cursor-pointer p-6 hover:shadow-lg">
                      <p className="text-xs font-bold uppercase text-[#FA0201]">Coach requested</p>
                      <h2 className="mt-2 text-xl font-black uppercase text-[#000000]">
                        {task.task_name || formatTaskType(task.task_type)}
                      </h2>
                      <p className="mt-3 text-sm leading-relaxed text-gray-700">
                        {task.instructions || `Complete this ${formatTaskType(task.task_type)} update for your coach.`}
                      </p>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHeader title="LIVE CHAT" accent />
            <Card className="p-8">
              <p className="text-xs font-bold uppercase text-gray-500">Always available</p>
              <h2 className="mt-1 text-3xl font-black uppercase text-[#000000]">Message your coach</h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-700">
                This will become the live chat area. For now, it marks where quick coach communication will live, separate from weekly reviews and call bookings.
              </p>
              <div className="mt-6">
                <Button type="button" variant="outline">Open live chat</Button>
              </div>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
