'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type CoachCallRequestRecord = {
  id: string;
  client_id: string;
  submitted_at: string;
  answer_text: string | null;
  review_status: string;
  clients: { full_name: string } | null;
};

type CalendarCall = {
  id: string;
  clientName: string;
  dateKey: string;
  timeLabel: string;
  status: string;
};

const calendarHours = Array.from({ length: 25 }, (_, index) => {
  const totalMinutes = 8 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
});

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + days);
  return nextDate;
};

const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

const toTimeLabel = (date: Date) => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

const getWeekStart = (date: Date) => {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

const formatDayLabel = (date: Date) => new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
}).format(date);

const getSuggestedTimeIso = (text: string | null) => {
  if (!text) return null;
  const suggestedLine = text.split('\n').find((line) => line.startsWith('Suggested time:'));
  return suggestedLine?.replace('Suggested time:', '').trim() || null;
};

const getDisplayCallDate = (call: Pick<CoachCallRequestRecord, 'submitted_at' | 'answer_text'>) => {
  const suggestedTime = getSuggestedTimeIso(call.answer_text);
  if (suggestedTime) return new Date(suggestedTime);

  const proposedDate = addDays(new Date(call.submitted_at), 1);
  proposedDate.setHours(16, 0, 0, 0);
  return proposedDate;
};

const formatStatus = (status: string) => {
  if (status === 'reviewed') return 'Accepted';
  if (status === 'needs_feedback') return 'Reschedule pending';
  return 'Requested';
};

const getStatusBadgeVariant = (status: string) => {
  if (status === 'reviewed') return 'success';
  if (status === 'needs_feedback') return 'warning';
  return 'default';
};

const getCallClassName = (status: string) => {
  if (status === 'reviewed') return 'bg-green-600 text-white';
  if (status === 'needs_feedback') return 'bg-amber-500 text-black';
  return 'bg-[#FA0201] text-white';
};

export default function CoachCalendarPage() {
  const [calls, setCalls] = useState<CalendarCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekStart = useMemo(() => getWeekStart(new Date()), []);
  const weekEnd = useMemo(() => {
    const end = addDays(weekStart, 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [weekStart]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      return { dateKey: toDateKey(date), label: formatDayLabel(date) };
    });
  }, [weekStart]);

  useEffect(() => {
    const loadCalendar = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error: callError } = await supabase
        .from('task_submissions')
        .select('id, client_id, submitted_at, answer_text, review_status, clients(full_name)')
        .eq('submission_type', 'coach_call_request')
        .in('review_status', ['needs_action', 'needs_feedback', 'reviewed'])
        .order('submitted_at', { ascending: true })
        .limit(100);

      if (callError) {
        setError(callError.message);
        setLoading(false);
        return;
      }

      const mappedCalls = ((data ?? []) as CoachCallRequestRecord[])
        .map((call) => {
          const displayDate = getDisplayCallDate(call);
          return {
            id: call.id,
            clientName: call.clients?.full_name || 'Client',
            dateKey: toDateKey(displayDate),
            timeLabel: toTimeLabel(displayDate),
            status: call.review_status,
          };
        })
        .filter((call) => call.dateKey >= toDateKey(weekStart) && call.dateKey <= toDateKey(weekEnd));

      setCalls(mappedCalls);
      setLoading(false);
    };

    loadCalendar();
  }, [weekStart, weekEnd]);

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="CALENDAR" subtitle="Coach call requests, accepted calls, and reschedule-pending calls." />

      <div className="mt-8 space-y-8">
        {loading && <Card><p className="font-semibold text-gray-700">Loading calendar...</p></Card>}
        {error && <Card><p className="font-semibold text-red-700">{error}</p></Card>}

        {!loading && !error && (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card><p className="text-xs font-bold uppercase text-gray-500">Requested</p><p className="mt-2 text-3xl font-black text-[#FA0201]">{calls.filter((call) => call.status === 'needs_action').length}</p></Card>
              <Card><p className="text-xs font-bold uppercase text-gray-500">Accepted</p><p className="mt-2 text-3xl font-black text-green-600">{calls.filter((call) => call.status === 'reviewed').length}</p></Card>
              <Card><p className="text-xs font-bold uppercase text-gray-500">Reschedule pending</p><p className="mt-2 text-3xl font-black text-amber-600">{calls.filter((call) => call.status === 'needs_feedback').length}</p></Card>
            </section>

            <section>
              <SectionHeader title="WEEKLY CALL CALENDAR" accent />
              <Card>
                <div className="max-h-[760px] overflow-auto">
                  <div className="grid min-w-[900px] grid-cols-[72px_repeat(7,minmax(0,1fr))] overflow-hidden rounded-lg border border-gray-200 text-xs">
                    <div className="bg-black p-3 font-bold uppercase text-white">Time</div>
                    {weekDays.map((day) => <div key={day.dateKey} className="border-l border-gray-200 bg-black p-3 text-center font-bold uppercase text-white">{day.label}</div>)}

                    {calendarHours.map((hour) => (
                      <div key={hour} className="contents">
                        <div className="border-t border-gray-200 bg-gray-100 p-3 font-bold text-[#000000]">{hour}</div>
                        {weekDays.map((day) => {
                          const dayCalls = calls.filter((call) => call.dateKey === day.dateKey && call.timeLabel === hour);
                          return (
                            <div key={`${day.dateKey}-${hour}`} className="min-h-16 border-l border-t border-gray-200 bg-white p-2">
                              <div className="space-y-2">
                                {dayCalls.map((call) => (
                                  <Link key={call.id} href={`/coach/actions/submissions/${call.id}`} className={`block rounded-lg p-2 text-xs font-bold uppercase ${getCallClassName(call.status)}`}>
                                    <p>{call.clientName}</p>
                                    <p className="mt-1 opacity-80">{formatStatus(call.status)}</p>
                                  </Link>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </section>

            <section>
              <SectionHeader title="CALLS THIS WEEK" accent />
              <div className="space-y-3">
                {calls.length === 0 ? (
                  <Card><p className="text-sm text-gray-600">No coach calls requested or accepted this week.</p></Card>
                ) : calls.map((call) => (
                  <Link key={call.id} href={`/coach/actions/submissions/${call.id}`}>
                    <Card className="flex items-center justify-between gap-4 hover:bg-gray-50">
                      <div>
                        <p className="font-bold uppercase text-[#000000]">{call.clientName}</p>
                        <p className="text-xs text-gray-500">{call.dateKey} • {call.timeLabel}</p>
                      </div>
                      <Badge variant={getStatusBadgeVariant(call.status) as any}>{formatStatus(call.status)}</Badge>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
