'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type CallTab = 'requested' | 'scheduled';

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
  requested_starts_at: string | null;
  clients: { full_name: string } | null;
};

type BusySlotRecord = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
};

type CalendarBlock = {
  id: string;
  type: 'call' | 'busy';
  title: string;
  subtitle: string;
  dateKey: string;
  startsAt: Date;
  endsAt: Date;
  href?: string;
  status?: string;
};

const CALENDAR_START_HOUR = 8;
const CALENDAR_END_HOUR = 20;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT_PX = 64;
const REQUEST_PLACEHOLDER_MINUTES = 30;

const calendarSlots = Array.from({ length: ((CALENDAR_END_HOUR - CALENDAR_START_HOUR) * 60) / SLOT_MINUTES + 1 }, (_, index) => {
  const totalMinutes = CALENDAR_START_HOUR * 60 + index * SLOT_MINUTES;
  const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
});

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(date.getDate() + days);
  return nextDate;
};

const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000);

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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

const formatWeekRange = (weekStart: Date, weekEnd: Date) => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return `${formatter.format(weekStart)} – ${formatter.format(weekEnd)}`;
};

const formatLabel = (value: string) => value.replaceAll('_', ' ');

const getBookingDisplayRange = (booking: CoachCallBookingRecord) => {
  if (booking.status === 'requested' && booking.requested_starts_at) {
    const startsAt = new Date(booking.requested_starts_at);
    return {
      startsAt,
      endsAt: addMinutes(startsAt, REQUEST_PLACEHOLDER_MINUTES),
    };
  }

  if (booking.status === 'reschedule_pending' && booking.suggested_starts_at && booking.suggested_ends_at) {
    return {
      startsAt: new Date(booking.suggested_starts_at),
      endsAt: new Date(booking.suggested_ends_at),
    };
  }

  if ((booking.status === 'accepted' || booking.status === 'completed') && booking.starts_at && booking.ends_at) {
    return {
      startsAt: new Date(booking.starts_at),
      endsAt: new Date(booking.ends_at),
    };
  }

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
  if (status === 'requested' || status === 'reschedule_pending') return 'warning';
  if (status === 'declined' || status === 'cancelled') return 'danger';
  return 'default';
};

const getBlockClassName = (block: CalendarBlock) => {
  if (block.type === 'busy') return 'border border-gray-500 bg-gray-900 text-white';
  if (block.status === 'requested') return 'border-2 border-amber-500 bg-yellow-300 text-black ring-2 ring-yellow-200';
  if (block.status === 'accepted' || block.status === 'completed') return 'border border-green-700 bg-green-600 text-white';
  if (block.status === 'reschedule_pending') return 'border border-amber-600 bg-amber-400 text-black';
  return 'border border-[#FA0201] bg-[#FA0201] text-white';
};

const getBlockGridPlacement = (startsAt: Date, endsAt: Date) => {
  const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes();
  const endMinutes = endsAt.getHours() * 60 + endsAt.getMinutes();
  const calendarStartMinutes = CALENDAR_START_HOUR * 60;
  const firstSlotIndex = Math.max(0, Math.floor((startMinutes - calendarStartMinutes) / SLOT_MINUTES));
  const slotSpan = Math.max(1, Math.ceil((endMinutes - startMinutes) / SLOT_MINUTES));

  return {
    gridRow: `${firstSlotIndex + 1} / span ${slotSpan}`,
  };
};

export default function CoachCalendarPage() {
  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [bookings, setBookings] = useState<CoachCallBookingRecord[]>([]);
  const [busySlots, setBusySlots] = useState<BusySlotRecord[]>([]);
  const [activeCallTab, setActiveCallTab] = useState<CallTab>('requested');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekStart = useMemo(() => getWeekStart(weekAnchor), [weekAnchor]);
  const weekEnd = useMemo(() => {
    const end = addDays(weekStart, 6);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [weekStart]);

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index);
      return { dateKey: toDateKey(date), label: formatDayLabel(date), date };
    });
  }, [weekStart]);

  useEffect(() => {
    const loadCalendar = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const supabase = createClient();
      const [bookingResult, busyResult] = await Promise.all([
        supabase
          .from('coach_call_bookings')
          .select('id, client_id, booking_type, status, starts_at, ends_at, suggested_starts_at, suggested_ends_at, requested_starts_at, created_at, clients(full_name)')
          .in('status', ['requested', 'accepted', 'reschedule_pending', 'declined', 'cancelled', 'completed'])
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('coach_calendar_blocks')
          .select('id, title, starts_at, ends_at')
          .gte('ends_at', weekStart.toISOString())
          .lte('starts_at', weekEnd.toISOString())
          .order('starts_at', { ascending: true })
          .limit(100),
      ]);

      if (bookingResult.error) {
        setError(bookingResult.error.message);
        setLoading(false);
        return;
      }

      if (busyResult.error) {
        setError(busyResult.error.message);
        setLoading(false);
        return;
      }

      setBookings((bookingResult.data ?? []) as CoachCallBookingRecord[]);
      setBusySlots((busyResult.data ?? []) as BusySlotRecord[]);
      setLoading(false);
    };

    loadCalendar();
  }, [weekStart, weekEnd]);

  const calendarBlocks = useMemo(() => {
    const callBlocks = bookings
      .map((booking) => {
        const range = getBookingDisplayRange(booking);
        if (!range) return null;

        const dateKey = toDateKey(range.startsAt);
        if (dateKey < toDateKey(weekStart) || dateKey > toDateKey(weekEnd)) return null;

        return {
          id: booking.id,
          type: 'call' as const,
          title: booking.clients?.full_name || 'Client',
          subtitle: `${toTimeLabel(range.startsAt)}–${toTimeLabel(range.endsAt)} • ${formatStatus(booking.status)}`,
          dateKey,
          startsAt: range.startsAt,
          endsAt: range.endsAt,
          href: `/coach/actions/bookings/${booking.id}`,
          status: booking.status,
        };
      })
      .filter(Boolean) as CalendarBlock[];

    const busyBlocks = busySlots.map((slot) => {
      const startsAt = new Date(slot.starts_at);
      const endsAt = new Date(slot.ends_at);

      return {
        id: slot.id,
        type: 'busy' as const,
        title: slot.title || 'Busy time',
        subtitle: `${toTimeLabel(startsAt)}–${toTimeLabel(endsAt)}`,
        dateKey: toDateKey(startsAt),
        startsAt,
        endsAt,
      };
    });

    return [...callBlocks, ...busyBlocks];
  }, [bookings, busySlots, weekStart, weekEnd]);

  const requestedBookings = bookings.filter((booking) => booking.status === 'requested');
  const scheduledBookings = bookings.filter((booking) => ['accepted', 'reschedule_pending', 'completed'].includes(booking.status));
  const acceptedThisWeek = calendarBlocks.filter((block) => block.type === 'call' && block.status === 'accepted').length;
  const reschedulesThisWeek = calendarBlocks.filter((block) => block.type === 'call' && block.status === 'reschedule_pending').length;

  const renderBookingRow = (booking: CoachCallBookingRecord, highlighted = false) => {
    const requestedLabel = booking.requested_starts_at ? `Requested slot ${formatDateTime(booking.requested_starts_at)}` : `Requested ${formatDateTime(booking.created_at)}`;
    const acceptedLabel = booking.starts_at ? `${formatDateTime(booking.starts_at)}${booking.ends_at ? ` – ${formatDateTime(booking.ends_at)}` : ''}` : requestedLabel;
    const rescheduleLabel = booking.suggested_starts_at ? `Suggested ${formatDateTime(booking.suggested_starts_at)}` : requestedLabel;
    const detail = booking.status === 'accepted' || booking.status === 'completed' ? acceptedLabel : booking.status === 'reschedule_pending' ? rescheduleLabel : requestedLabel;

    return (
      <Link key={booking.id} href={`/coach/actions/bookings/${booking.id}`}>
        <Card className={`flex items-center justify-between gap-4 hover:bg-gray-50 ${highlighted ? 'border-2 border-yellow-400 bg-yellow-50 shadow-sm' : ''}`}>
          <div>
            <p className="font-bold uppercase text-[#000000]">{booking.clients?.full_name || 'Client'}</p>
            <p className="text-xs text-gray-500">{detail}</p>
          </div>
          <Badge variant={getStatusBadgeVariant(booking.status) as any}>{formatLabel(booking.status)}</Badge>
        </Card>
      </Link>
    );
  };

  return (
    <div className="p-6 md:p-8">
      <PageHeader title="CALENDAR" subtitle="Call requests, scheduled calls, busy time, and bookable availability." />

      <div className="mt-8 space-y-8">
        {loading && <Card><p className="font-semibold text-gray-700">Loading calendar...</p></Card>}
        {error && <Card><p className="font-semibold text-red-700">{error}</p></Card>}

        {!loading && !error && (
          <>
            <section>
              <Card className="space-y-4 border-2 border-yellow-300 bg-yellow-50">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FA0201]">Priority</p>
                    <h2 className="mt-1 text-2xl font-black uppercase text-[#000000]">Call requests</h2>
                    <p className="mt-1 text-sm font-semibold text-gray-700">Requested calls are shown first and appear as yellow blocks on the weekly calendar.</p>
                  </div>
                  <div className="flex rounded-lg border border-yellow-300 bg-white p-1">
                    <button type="button" onClick={() => setActiveCallTab('requested')} className={`rounded-md px-4 py-2 text-xs font-black uppercase ${activeCallTab === 'requested' ? 'bg-[#FA0201] text-white' : 'text-[#000000] hover:bg-yellow-100'}`}>Unscheduled</button>
                    <button type="button" onClick={() => setActiveCallTab('scheduled')} className={`rounded-md px-4 py-2 text-xs font-black uppercase ${activeCallTab === 'scheduled' ? 'bg-[#FA0201] text-white' : 'text-[#000000] hover:bg-yellow-100'}`}>Scheduled</button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <Card className="bg-white"><p className="text-xs font-bold uppercase text-gray-500">Requested</p><p className="mt-2 text-3xl font-black text-[#FA0201]">{requestedBookings.length}</p></Card>
                  <Card className="bg-white"><p className="text-xs font-bold uppercase text-gray-500">Accepted this week</p><p className="mt-2 text-3xl font-black text-green-600">{acceptedThisWeek}</p></Card>
                  <Card className="bg-white"><p className="text-xs font-bold uppercase text-gray-500">Reschedule pending</p><p className="mt-2 text-3xl font-black text-amber-600">{reschedulesThisWeek}</p></Card>
                  <Card className="bg-white"><p className="text-xs font-bold uppercase text-gray-500">Busy blocks</p><p className="mt-2 text-3xl font-black text-gray-700">{busySlots.length}</p></Card>
                </div>

                <div className="space-y-3">
                  {activeCallTab === 'requested' && (
                    requestedBookings.length === 0 ? <Card className="bg-white"><p className="text-sm text-gray-600">No unscheduled call requests.</p></Card> : requestedBookings.map((booking) => renderBookingRow(booking, true))
                  )}

                  {activeCallTab === 'scheduled' && (
                    scheduledBookings.length === 0 ? <Card className="bg-white"><p className="text-sm text-gray-600">No scheduled calls yet.</p></Card> : scheduledBookings.map((booking) => renderBookingRow(booking))
                  )}
                </div>
              </Card>
            </section>

            <section>
              <Card className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-gray-500">Coach availability</p>
                  <p className="mt-1 font-bold uppercase text-[#000000]">Set bookable appointment hours and block days clients should not book.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Link href="/coach/calendar/settings" className="rounded-lg bg-[#FA0201] px-4 py-2 text-sm font-bold uppercase text-white hover:bg-red-700">Calendar settings</Link>
                  <Link href="/coach/calendar/busy" className="rounded-lg bg-black px-4 py-2 text-sm font-bold uppercase text-white hover:bg-gray-900">Manage busy time</Link>
                </div>
              </Card>
            </section>

            <section>
              <SectionHeader title="WEEKLY CALL CALENDAR" accent />
              <Card>
                <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500">Viewing week</p>
                    <p className="mt-1 text-xl font-black uppercase text-[#000000]">{formatWeekRange(weekStart, weekEnd)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setWeekAnchor(addDays(weekStart, -7))} className="rounded-lg bg-gray-200 px-4 py-2 text-xs font-black uppercase text-[#000000] hover:bg-gray-300">Previous week</button>
                    <button type="button" onClick={() => setWeekAnchor(new Date())} className="rounded-lg bg-[#FA0201] px-4 py-2 text-xs font-black uppercase text-white hover:bg-red-700">Today</button>
                    <button type="button" onClick={() => setWeekAnchor(addDays(weekStart, 7))} className="rounded-lg bg-gray-200 px-4 py-2 text-xs font-black uppercase text-[#000000] hover:bg-gray-300">Next week</button>
                  </div>
                </div>

                <div className="overflow-auto rounded-lg border border-gray-200">
                  <div className="grid min-w-[1100px] grid-cols-[80px_repeat(7,minmax(0,1fr))]">
                    <div className="bg-black p-3 text-xs font-bold uppercase text-white">Time</div>
                    {weekDays.map((day) => <div key={day.dateKey} className="border-l border-gray-700 bg-black p-3 text-center text-xs font-bold uppercase text-white">{day.label}</div>)}

                    <div className="grid" style={{ gridTemplateRows: `repeat(${calendarSlots.length}, ${SLOT_HEIGHT_PX}px)` }}>
                      {calendarSlots.map((slot) => (
                        <div key={slot} className="border-t border-gray-200 bg-gray-100 px-3 py-2 text-xs font-bold text-[#000000]">{slot}</div>
                      ))}
                    </div>

                    {weekDays.map((day) => {
                      const dayBlocks = calendarBlocks.filter((block) => block.dateKey === day.dateKey);

                      return (
                        <div key={day.dateKey} className="relative border-l border-gray-200">
                          <div className="grid" style={{ gridTemplateRows: `repeat(${calendarSlots.length}, ${SLOT_HEIGHT_PX}px)` }}>
                            {calendarSlots.map((slot) => (
                              <div key={`${day.dateKey}-${slot}`} className="border-t border-gray-200 bg-white" />
                            ))}
                          </div>

                          <div className="pointer-events-none absolute inset-0 grid p-1" style={{ gridTemplateRows: `repeat(${calendarSlots.length}, ${SLOT_HEIGHT_PX}px)` }}>
                            {dayBlocks.map((block) => {
                              const className = `pointer-events-auto m-1 overflow-hidden rounded-lg p-2 text-xs font-bold uppercase shadow-sm ${getBlockClassName(block)}`;
                              const content = (
                                <>
                                  <p className="truncate">{block.title}</p>
                                  <p className="mt-1 truncate opacity-80">{block.subtitle}</p>
                                </>
                              );

                              if (block.href) {
                                return (
                                  <Link key={block.id} href={block.href} className={className} style={getBlockGridPlacement(block.startsAt, block.endsAt)}>
                                    {content}
                                  </Link>
                                );
                              }

                              return (
                                <div key={block.id} className={className} style={getBlockGridPlacement(block.startsAt, block.endsAt)}>
                                  {content}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </section>

            <section>
              <SectionHeader title="BUSY TIME THIS WEEK" accent />
              <div className="space-y-3">
                {busySlots.length === 0 ? (
                  <Card><p className="text-sm text-gray-600">No busy time added this week.</p></Card>
                ) : busySlots.map((slot) => (
                  <Card key={slot.id} className="flex items-center justify-between gap-4 bg-gray-50">
                    <div>
                      <p className="font-bold uppercase text-[#000000]">{slot.title || 'Busy time'}</p>
                      <p className="text-xs text-gray-500">{formatDateTime(slot.starts_at)} – {formatDateTime(slot.ends_at)}</p>
                    </div>
                    <Badge>Busy</Badge>
                  </Card>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
