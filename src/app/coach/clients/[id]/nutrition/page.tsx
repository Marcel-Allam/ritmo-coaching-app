'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = { id: string; full_name: string; email: string | null };
type ClientSettingsRecord = {
  nutrition_enabled: boolean;
  nutrition_tracking_mode: 'simple' | 'calories_protein' | 'macros' | 'habits';
};
type NutritionLogRecord = {
  id: string;
  submitted_at: string;
  submission_date: string;
  tracking_mode: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fats_g: number | null;
  habit_completed: boolean | null;
  notes: string | null;
  review_status: string;
};

const defaultSettings: ClientSettingsRecord = {
  nutrition_enabled: false,
  nutrition_tracking_mode: 'simple',
};

const modeLabel: Record<ClientSettingsRecord['nutrition_tracking_mode'], string> = {
  simple: 'Simple check-in',
  calories_protein: 'Calories + protein',
  macros: 'Full macros',
  habits: 'Habit / portion tracking',
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
};

const average = (values: Array<number | null>) => {
  const clean = values.filter((value): value is number => typeof value === 'number');
  if (clean.length === 0) return null;
  return Math.round(clean.reduce((total, value) => total + Number(value), 0) / clean.length);
};

const getWindow = () => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10), startTimestamp: start.toISOString(), endTimestamp: end.toISOString() };
};

const MetricCard = ({ label, value, helper }: { label: string; value: string | number; helper: string }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-black text-[#000000]">{value}</p>
    <p className="mt-1 text-xs font-semibold text-gray-600">{helper}</p>
  </div>
);

export default function ClientNutritionPage() {
  const params = useParams();
  const clientId = params.id as string;
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [settings, setSettings] = useState<ClientSettingsRecord>(defaultSettings);
  const [logs, setLogs] = useState<NutritionLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPage = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const range = getWindow();
      const [clientResult, settingsResult] = await Promise.all([
        supabase.from('clients').select('id, full_name, email').eq('id', clientId).single(),
        supabase.from('client_settings').select('nutrition_enabled, nutrition_tracking_mode').eq('client_id', clientId).maybeSingle(),
      ]);

      if (clientResult.error || !clientResult.data) {
        setError(clientResult.error?.message || 'Client not found.');
        setLoading(false);
        return;
      }

      if (settingsResult.error) {
        setError(settingsResult.error.message);
        setLoading(false);
        return;
      }

      const activeSettings = (settingsResult.data as ClientSettingsRecord | null) ?? defaultSettings;
      setClient(clientResult.data as ClientRecord);
      setSettings(activeSettings);

      if (!activeSettings.nutrition_enabled) {
        setLoading(false);
        return;
      }

      const logsResult = await supabase
        .from('nutrition_submissions')
        .select('id, submitted_at, submission_date, tracking_mode, calories, protein_g, carbs_g, fats_g, habit_completed, notes, review_status')
        .eq('client_id', clientId)
        .gte('submitted_at', range.startTimestamp)
        .lte('submitted_at', range.endTimestamp)
        .order('submitted_at', { ascending: false });

      if (logsResult.error) {
        setError(logsResult.error.message);
        setLoading(false);
        return;
      }

      setLogs((logsResult.data ?? []) as NutritionLogRecord[]);
      setLoading(false);
    };

    loadPage();
  }, [clientId]);

  const range = getWindow();
  const loggedDays = new Set(logs.map((log) => log.submission_date)).size;
  const loggingRate = Math.round((loggedDays / 30) * 100);
  const avgCalories = average(logs.map((log) => log.calories));
  const avgProtein = average(logs.map((log) => log.protein_g));
  const avgCarbs = average(logs.map((log) => log.carbs_g));
  const avgFats = average(logs.map((log) => log.fats_g));
  const habitWins = logs.filter((log) => log.habit_completed).length;

  if (loading) return <div className="p-6 md:p-8"><Card>Loading nutrition tracking...</Card></div>;

  if (error || !client) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <p className="text-sm font-semibold text-red-700">{error || 'Client not found.'}</p>
          <Link href={`/coach/clients/${clientId}`} className="mt-4 inline-block text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
        </Card>
      </div>
    );
  }

  if (!settings.nutrition_enabled) {
    return (
      <div className="space-y-8 p-6 md:p-8">
        <div className="flex justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Nutrition Tracking</h1>
            <p className="mt-1 text-sm text-gray-700">{client.full_name}{client.email ? ` • ${client.email}` : ''}</p>
          </div>
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
        </div>
        <SectionHeader title="NUTRITION DISABLED" accent />
        <Card>
          <p className="text-lg font-black uppercase text-[#000000]">Nutrition tracking is off for this client.</p>
          <p className="mt-2 text-sm text-gray-700">Turn this on only when nutrition tracking is useful for the client.</p>
          <Link href={`/coach/clients/${clientId}/settings`} className="mt-5 inline-block rounded-lg bg-[#FA0201] px-5 py-3 text-sm font-bold uppercase text-white hover:bg-red-700">Open Client Settings</Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Nutrition Tracking</h1>
          <p className="mt-1 text-sm text-gray-700">{client.full_name}{client.email ? ` • ${client.email}` : ''}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-gray-500">{formatDate(range.startDate)} → {formatDate(range.endDate)} • {modeLabel[settings.nutrition_tracking_mode]}</p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Link href={`/coach/clients/${clientId}/settings`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Client Settings</Link>
          <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">Back to client</Link>
        </div>
      </div>

      <section>
        <SectionHeader title="NUTRITION SNAPSHOT" accent />
        <Card>
          {logs.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-sm font-semibold text-gray-700">Nutrition is enabled, but there are no logs in the last 30 days.</p>
              <p className="mt-2 text-xs text-gray-500">Once the client starts logging, the summary will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <MetricCard label="Logging rate" value={`${loggingRate}%`} helper={`${loggedDays}/30 days logged`} />
              <MetricCard label="Avg calories" value={avgCalories ?? '—'} helper="Available logs" />
              <MetricCard label="Avg protein" value={avgProtein === null ? '—' : `${avgProtein}g`} helper="Available logs" />
              <MetricCard label="Habit wins" value={habitWins} helper="Habit-based completions" />
            </div>
          )}
        </Card>
      </section>

      {settings.nutrition_tracking_mode === 'macros' && logs.length > 0 && (
        <section>
          <SectionHeader title="MACRO AVERAGES" accent />
          <Card>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <MetricCard label="Avg carbs" value={avgCarbs === null ? '—' : `${avgCarbs}g`} helper="Full macro mode" />
              <MetricCard label="Avg fats" value={avgFats === null ? '—' : `${avgFats}g`} helper="Full macro mode" />
              <MetricCard label="Logs" value={logs.length} helper="Last 30 days" />
            </div>
          </Card>
        </section>
      )}

      {logs.length > 0 && (
        <section>
          <SectionHeader title="RECENT NUTRITION LOGS" accent />
          <Card>
            <div className="space-y-3">
              {logs.slice(0, 10).map((log) => (
                <div key={log.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black uppercase text-[#000000]">{formatDate(log.submission_date)}</p>
                        <Badge variant={log.review_status === 'reviewed' ? 'success' : 'default'}>{log.tracking_mode}</Badge>
                      </div>
                      {log.notes && <p className="mt-2 text-sm text-gray-600">{log.notes}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-right text-xs font-bold uppercase text-gray-600 md:grid-cols-4">
                      <span>{log.calories === null ? '—' : `${log.calories} kcal`}</span>
                      <span>{log.protein_g === null ? '—' : `${log.protein_g}g P`}</span>
                      <span>{log.carbs_g === null ? '—' : `${log.carbs_g}g C`}</span>
                      <span>{log.fats_g === null ? '—' : `${log.fats_g}g F`}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
