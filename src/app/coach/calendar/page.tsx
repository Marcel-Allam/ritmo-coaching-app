'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type CoachCallBookingRecord = {
  id: string;
  client_id: string;
  booking_type: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  suggested_starts_at: string | null;
  suggested_ends_at: string | null;
  created_at: string;
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

const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}).format(new Date(value));

const formatLabel = (value: string) => value.replaceAll('_', ' ');

const getBookingDisplayDate = (booking: CoachCallBookingRecord) => {
  if (booking.status === 'reschedule_pending' && booking.suggested_starts_at) return new Date(booking.suggested_starts_at);
  if ((booking.status === 'accepted' || booking.status === 'completed') && booking.starts_at) return new Date(booking.starts_at);
  return null;
};

const formatStatus = (status: string) => {
  if (status === 'accepted') return 'Accepted';
  if (status === 'reschedule_pending') return 'Reschedule pending';
  if (status === 'completed') return 'Completed';
  if (status === 'declined') return 'Declined';
  if (status === 'cancelled') return 'Cancelled';
  return 'Requested';
};

const getStatusBadgeVariant = (status: string) => {
  if (status === 'accepted' || status === 'completed') return 'success';
  if (status === 'reschedule_pending') return 'warning';
  if (status === 'declined' || status === 'cancelled') return 'danger';
  return 'default';
};

const getCallClassName = (status: string) => {
  if (status === 'accepted' || status === 'completed') return 'bg-green-600 text-white';
  if (status === 'reschedule_pending') return 'bg-amber-500 text-black';
  return 'bg-[#FA0201] text-white';
};

export default function CoachCalendarPage() {
  const [bookings, setBookings] = useState<CoachCallBookingRecord[]>([]);
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
      const { data, error: bookingError } = await supabase
        .from('coach_call_bookings')
        .select('id, client_id, booking_type, status, starts_at, ends_at, suggested_starts_at, suggested_ends_at, created_at, clients(full_name)')
        .in('status', ['requested', 'accepted', 'reschedule_pending', 'declined', 'cancelled', 'completed'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (bookingError) {
        setError(bookingError.message);
        setLoading(false);
        return;
      }

      setBookings((data ?? []) as CoachCallBookingRecord[]);
      setLoading(false);
    };

    loadCalendar();
  }, []);

  const scheduledCalls = useMemo(() => {
    return bookings
      .map((booking) => {
        const displayDate = getBookingDisplayDate(booking);
        if (!displayDate) return null;

        const dateKey = toDateKey(displayDate);
        if (dateKey < toDateKey(weekStart) || dateKey > toDateKey(weekEnd)) return null;

        return {
          id: booking.id,
          clientName: booking.clients?.full_name || 'Client',
          dateKey,
          timeLabel: toTimeLabel(displayDate),
          status: booking.status,
        };
      })
      .filter(Boolean) as CalendarCall[];
  }, [bookings, weekStart, weekEnd]);

  const requestedBookings = bookings.filter((booking) => booking.status === 'requested');
  const acceptedThisWeek = scheduledCalls.filter((call) => call.status === 'accepted').length;
  const reschedulesThisWeek = scheduledCalls.filter((call) => call.status === 'reschedule_pending').length;

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="CALENDAR" subtitle="Coach call requests, accepted calls, and reschedule-pending calls from the new booking system." />

      <div className="mt-8 space-y-8">
        {loading && <Card><p className="font-semibold text-gray-700">Loading calendar...</p></Card>}
        {error && <Card><p className="font-semibold text-red-700">{error}</p></Card>}

        {!loading && !error && (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Card><p className="text-xs font-bold uppercase text-gray-500">Requested</p><p className="mt-2 text-3xl font-black text-[#FA0201]">{requestedBookings.length}</p></Card>
              <Card><p className="text-xs font-bold uppercase text-gray-500">Accepted this week</p><p className="mt-2 text-3xl font-black text-green-600">{acceptedThisWeek}</p></Card>
              <Card><p className="text-xs font-bold uppercase text-gray-500">Reschedule pending this week</p><p className="mt-2 text-3xl font-black text-amber-600">{reschedulesThisWeek}</p></Card>
            </section>

            <section>
              <Card className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-gray-500">Coach availability</p>
                  <p className="mt-1 font-bold uppercase text-[#000000]">Add busy time when calls should not be booked.</p>
                </div>
                <Link href="/coach/calendar/busy" className="rounded-lg bg-black px-4 py-2 text-sm font-bold uppercase text-white hover:bg-gray-900">Manage busy time</Link>
              </Card>
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
                          const dayCalls = scheduledCalls.filter((call) => call.dateKey === day.dateKey && call.timeLabel === hour);
                          return (
                            <div key={`${day.dateKey}-${hour}`} className="min-h-16 border-l border-t border-gray-200 bg-white p-2">
                              <div className="space-y-2">
                                {dayCalls.map((call) => (
                                  <Link key={call.id} href={`/coach/actions/bookings/${call.id}`} className={`block rounded-lg p-2 text-xs font-bold uppercase ${getCallClassName(call.status)}`}>
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
              <SectionHeader title="UNSCHEDULED CALL REQUESTS" accent />
              <div className="space-y-3">
                {requestedBookings.length === 0 ? (
                  <Card><p className="text-sm text-gray-600">No unscheduled call requests.</p></Card>
                ) : requestedBookings.map((booking) => (
                  <Link key={booking.id} href={`/coach/actions/bookings/${booking.id}`}>
                    <Card className="flex items-center justify-between gap-4 hover:bg-gray-50">
                      <div>
                        <p className="font-bold uppercase text-[#000000]">{booking.clients?.full_name || 'Client'}</p>
                        <p className="text-xs text-gray-500">Requested {formatDateTime(booking.created_at)}</p>
                      </div>
                      <Badge variant={getStatusBadgeVariant(booking.status) as any}>{formatLabel(booking.status)}</Badge>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>

            <section>
              <SectionHeader title="SCHEDULED CALLS THIS WEEK" accent />
              <div className="space-y-3">
                {scheduledCalls.length === 0 ? (
                  <Card><p className="text-sm text-gray-600">No accepted or reschedule-pending calls this week.</p></Card>
                ) : scheduledCalls.map((call) => (
                  <Link key={call.id} href={`/coach/actions/bookings/${call.id}`}>
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
