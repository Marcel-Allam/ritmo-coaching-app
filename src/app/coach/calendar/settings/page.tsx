'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type AvailabilitySettings = {
  coach_id: string;
  timezone: string;
  appointment_duration_minutes: number;
  booking_window_days: number;
};

type AvailabilityRule = {
  id?: string;
  weekday: number;
  is_available: boolean;
  starts_at: string;
  ends_at: string;
};

type BlockedDay = {
  id: string;
  blocked_date: string;
  reason: string | null;
};

const weekdays = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];

const defaultSettings = (coachId: string): AvailabilitySettings => ({
  coach_id: coachId,
  timezone: 'Europe/London',
  appointment_duration_minutes: 30,
  booking_window_days: 14,
});

const defaultRules = (): AvailabilityRule[] => weekdays.map((day) => ({
  weekday: day.value,
  is_available: day.value >= 1 && day.value <= 5,
  starts_at: '09:00',
  ends_at: '17:00',
}));

const formatDate = (value: string) => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
}).format(new Date(`${value}T00:00:00`));

const normaliseTime = (value: string) => value.length === 5 ? value : value.slice(0, 5);

export default function CoachCalendarSettingsPage() {
  const [coachId, setCoachId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AvailabilitySettings | null>(null);
  const [rules, setRules] = useState<AvailabilityRule[]>(defaultRules());
  const [blockedDays, setBlockedDays] = useState<BlockedDay[]>([]);
  const [blockedDate, setBlockedDate] = useState('');
  const [blockedReason, setBlockedReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingBlockedDayId, setDeletingBlockedDayId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: userResult, error: userError } = await supabase.auth.getUser();

    if (userError || !userResult.user) {
      setError(userError?.message || 'Could not identify the logged-in coach.');
      setLoading(false);
      return;
    }

    const nextCoachId = userResult.user.id;
    setCoachId(nextCoachId);

    const [settingsResult, rulesResult, blockedResult] = await Promise.all([
      supabase
        .from('coach_calendar_availability_settings')
        .select('coach_id, timezone, appointment_duration_minutes, booking_window_days')
        .eq('coach_id', nextCoachId)
        .maybeSingle(),
      supabase
        .from('coach_calendar_availability_rules')
        .select('id, weekday, is_available, starts_at, ends_at')
        .eq('coach_id', nextCoachId)
        .order('weekday'),
      supabase
        .from('coach_calendar_blocked_days')
        .select('id, blocked_date, reason')
        .eq('coach_id', nextCoachId)
        .order('blocked_date'),
    ]);

    if (settingsResult.error) {
      setError(settingsResult.error.message);
      setLoading(false);
      return;
    }

    if (rulesResult.error) {
      setError(rulesResult.error.message);
      setLoading(false);
      return;
    }

    if (blockedResult.error) {
      setError(blockedResult.error.message);
      setLoading(false);
      return;
    }

    const existingRules = (rulesResult.data ?? []) as AvailabilityRule[];
    const mergedRules = defaultRules().map((defaultRule) => {
      const existingRule = existingRules.find((rule) => rule.weekday === defaultRule.weekday);
      if (!existingRule) return defaultRule;

      return {
        ...existingRule,
        starts_at: normaliseTime(existingRule.starts_at),
        ends_at: normaliseTime(existingRule.ends_at),
      };
    });

    setSettings((settingsResult.data as AvailabilitySettings | null) || defaultSettings(nextCoachId));
    setRules(mergedRules);
    setBlockedDays((blockedResult.data ?? []) as BlockedDay[]);
    setLoading(false);
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const updateRule = (weekday: number, update: Partial<AvailabilityRule>) => {
    setRules((currentRules) => currentRules.map((rule) => rule.weekday === weekday ? { ...rule, ...update } : rule));
  };

  const saveSettings = async () => {
    if (!isSupabaseConfigured || !coachId || !settings) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: settingsError } = await supabase
      .from('coach_calendar_availability_settings')
      .upsert(settings, { onConflict: 'coach_id' });

    if (settingsError) {
      setError(settingsError.message);
      setSaving(false);
      return;
    }

    const rulePayload = rules.map((rule) => ({
      id: rule.id,
      coach_id: coachId,
      weekday: rule.weekday,
      is_available: rule.is_available,
      starts_at: rule.starts_at,
      ends_at: rule.ends_at,
    }));

    const { error: rulesError } = await supabase
      .from('coach_calendar_availability_rules')
      .upsert(rulePayload, { onConflict: 'coach_id,weekday' });

    if (rulesError) {
      setError(rulesError.message);
      setSaving(false);
      return;
    }

    setMessage('Calendar settings saved.');
    setSaving(false);
    await loadSettings();
  };

  const addBlockedDay = async () => {
    if (!isSupabaseConfigured || !coachId || !blockedDate) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: insertError } = await supabase
      .from('coach_calendar_blocked_days')
      .upsert({
        coach_id: coachId,
        blocked_date: blockedDate,
        reason: blockedReason.trim() || null,
      }, { onConflict: 'coach_id,blocked_date' });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setMessage('Blocked day saved.');
    setBlockedDate('');
    setBlockedReason('');
    setSaving(false);
    await loadSettings();
  };

  const deleteBlockedDay = async (blockedDayId: string) => {
    if (!isSupabaseConfigured) return;

    setDeletingBlockedDayId(blockedDayId);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from('coach_calendar_blocked_days')
      .delete()
      .eq('id', blockedDayId);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingBlockedDayId(null);
      return;
    }

    setBlockedDays((currentBlockedDays) => currentBlockedDays.filter((day) => day.id !== blockedDayId));
    setMessage('Blocked day removed.');
    setDeletingBlockedDayId(null);
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8">
        <Card><p className="text-sm font-semibold text-gray-700">Loading calendar settings...</p></Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 md:p-8">
      <PageHeader title="CALENDAR SETTINGS" subtitle="Set bookable call hours and block days clients should not book." />

      <Link href="/coach/calendar" className="text-sm font-bold uppercase text-[#FA0201]">← Back to calendar</Link>

      {message && <Card className="border-2 border-green-200 bg-green-50 text-sm font-semibold text-green-700">{message}</Card>}
      {error && <Card className="border-2 border-red-200 bg-red-50 text-sm font-semibold text-red-700">{error}</Card>}

      {settings && (
        <Card className="space-y-5 border-2 border-gray-200 bg-white">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FA0201]">Booking defaults</p>
            <h2 className="mt-1 text-2xl font-black uppercase text-[#000000]">Appointment rules</h2>
            <p className="mt-1 text-sm text-gray-600">These settings are the simple rules clients should book against.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label>
              <span className="text-xs font-black uppercase text-gray-500">Timezone</span>
              <select value={settings.timezone} onChange={(event) => setSettings((current) => current ? { ...current, timezone: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                <option value="Europe/London">Europe/London</option>
              </select>
            </label>
            <label>
              <span className="text-xs font-black uppercase text-gray-500">Appointment length</span>
              <select value={settings.appointment_duration_minutes} onChange={(event) => setSettings((current) => current ? { ...current, appointment_duration_minutes: Number(event.target.value) } : current)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
              </select>
            </label>
            <label>
              <span className="text-xs font-black uppercase text-gray-500">Booking window</span>
              <select value={settings.booking_window_days} onChange={(event) => setSettings((current) => current ? { ...current, booking_window_days: Number(event.target.value) } : current)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm">
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={60}>60 days</option>
                <option value={90}>90 days</option>
              </select>
            </label>
          </div>
        </Card>
      )}

      <Card className="space-y-5 border-2 border-gray-200 bg-white">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FA0201]">Weekly availability</p>
          <h2 className="mt-1 text-2xl font-black uppercase text-[#000000]">Bookable hours</h2>
          <p className="mt-1 text-sm text-gray-600">Switch off full days or set the appointment window for each day.</p>
        </div>

        <div className="space-y-3">
          {rules.map((rule) => {
            const day = weekdays.find((weekday) => weekday.value === rule.weekday);

            return (
              <div key={rule.weekday} className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-[1fr_0.28fr_0.28fr_0.2fr] md:items-center">
                <div>
                  <p className="text-sm font-black uppercase text-[#000000]">{day?.label}</p>
                  <p className="mt-1 text-xs font-bold uppercase text-gray-500">{rule.is_available ? `${rule.starts_at}–${rule.ends_at}` : 'Blocked all day'}</p>
                </div>
                <label>
                  <span className="text-xs font-black uppercase text-gray-500">Start</span>
                  <input type="time" value={rule.starts_at} disabled={!rule.is_available} onChange={(event) => updateRule(rule.weekday, { starts_at: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm disabled:opacity-50" />
                </label>
                <label>
                  <span className="text-xs font-black uppercase text-gray-500">End</span>
                  <input type="time" value={rule.ends_at} disabled={!rule.is_available} onChange={(event) => updateRule(rule.weekday, { ends_at: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm disabled:opacity-50" />
                </label>
                <label className="flex items-center gap-3 text-sm font-bold uppercase text-[#000000]">
                  <input type="checkbox" checked={rule.is_available} onChange={(event) => updateRule(rule.weekday, { is_available: event.target.checked })} className="h-5 w-5 accent-[#FA0201]" />
                  Bookable
                </label>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button type="button" disabled={saving} onClick={saveSettings} className="bg-[#FA0201] hover:bg-red-700">
            {saving ? 'Saving...' : 'Save calendar settings'}
          </Button>
        </div>
      </Card>

      <Card className="space-y-5 border-2 border-gray-200 bg-white">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#FA0201]">One-off blocks</p>
          <h2 className="mt-1 text-2xl font-black uppercase text-[#000000]">Blocked days</h2>
          <p className="mt-1 text-sm text-gray-600">Use this for holidays, travel, or days you do not want clients to book.</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[0.35fr_1fr_auto] md:items-end">
          <label>
            <span className="text-xs font-black uppercase text-gray-500">Date</span>
            <input type="date" value={blockedDate} onChange={(event) => setBlockedDate(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
          </label>
          <label>
            <span className="text-xs font-black uppercase text-gray-500">Reason</span>
            <input value={blockedReason} onChange={(event) => setBlockedReason(event.target.value)} placeholder="e.g. Holiday, match day, unavailable" className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm" />
          </label>
          <Button type="button" disabled={saving || !blockedDate} onClick={addBlockedDay} className="bg-black hover:bg-gray-900">
            Add blocked day
          </Button>
        </div>

        <div className="space-y-3">
          {blockedDays.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">No blocked days yet.</p>
          ) : blockedDays.map((day) => (
            <div key={day.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-black uppercase text-[#000000]">{formatDate(day.blocked_date)}</p>
                {day.reason && <p className="mt-1 text-sm text-gray-600">{day.reason}</p>}
              </div>
              <button type="button" disabled={deletingBlockedDayId === day.id} onClick={() => deleteBlockedDay(day.id)} className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-xs font-bold uppercase text-[#FA0201] hover:bg-red-100 disabled:opacity-60">
                {deletingBlockedDayId === day.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
