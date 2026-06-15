'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = {
  id: string;
  full_name: string;
  email: string | null;
  current_focus: string | null;
};

type BodyweightEntry = {
  id: string;
  entry_date: string;
  bodyweight_kg: number;
  notes: string | null;
};

type ChartPoint = {
  label: string;
  value: number;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

const getSevenDayAverage = (entries: BodyweightEntry[]) => {
  const latestSeven = entries.slice(-7);
  if (latestSeven.length === 0) return null;

  const total = latestSeven.reduce((sum, entry) => sum + Number(entry.bodyweight_kg), 0);
  return roundToOneDecimal(total / latestSeven.length);
};

const getChange = (entries: BodyweightEntry[]) => {
  if (entries.length < 2) return null;

  const first = entries[0];
  const latest = entries[entries.length - 1];
  return roundToOneDecimal(Number(latest.bodyweight_kg) - Number(first.bodyweight_kg));
};

const MetricCard = ({ label, value, helper }: { label: string; value: string; helper: string }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-black text-[#000000]">{value}</p>
    <p className="mt-1 text-xs font-semibold text-gray-600">{helper}</p>
  </div>
);

const TrendChart = ({ title, points, suffix = '' }: { title: string; points: ChartPoint[]; suffix?: string }) => {
  const width = 720;
  const height = 260;
  const padding = 38;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const values = points.map((point) => point.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const valueRange = maxValue - minValue || 1;

  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : padding + (index / (points.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((point.value - minValue) / valueRange) * chartHeight;
    return { ...point, x, y };
  });

  const linePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-sm font-bold uppercase text-[#000000]">{title}</p>
        <p className="text-xs font-semibold text-gray-500">{points.length} entries</p>
      </div>

      {points.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg bg-gray-50">
          <p className="text-sm font-semibold text-gray-500">No bodyweight data yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[620px] rounded-lg bg-gray-50">
            <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#D1D5DB" strokeWidth="2" />
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#D1D5DB" strokeWidth="2" />
            <path d={linePath} fill="none" stroke="#FA0201" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {coordinates.map((point) => (
              <g key={`${point.label}-${point.x}`}>
                <circle cx={point.x} cy={point.y} r="6" fill="#FA0201" />
                <text x={point.x} y={point.y - 12} textAnchor="middle" className="fill-black text-[11px] font-bold">
                  {point.value}{suffix}
                </text>
                <text x={point.x} y={height - 10} textAnchor="middle" className="fill-gray-600 text-[10px] font-semibold">
                  {point.label}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
};

const FutureOverlayCard = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4">
    <p className="text-sm font-bold uppercase text-[#000000]">{title}</p>
    <p className="mt-1 text-xs text-gray-600">{description}</p>
    <p className="mt-3 inline-block rounded bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">Future overlay</p>
  </div>
);

export default function ClientBodyweightTrendPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [entries, setEntries] = useState<BodyweightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBodyweightTrend = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const [clientResult, bodyweightResult] = await Promise.all([
        supabase
          .from('clients')
          .select('id, full_name, email, current_focus')
          .eq('id', clientId)
          .single(),
        supabase
          .from('bodyweight_entries')
          .select('id, entry_date, bodyweight_kg, notes')
          .eq('client_id', clientId)
          .order('entry_date', { ascending: true }),
      ]);

      if (clientResult.error || !clientResult.data) {
        setError(clientResult.error?.message || 'Client not found.');
        setLoading(false);
        return;
      }

      if (bodyweightResult.error) {
        setError(bodyweightResult.error.message);
        setLoading(false);
        return;
      }

      setClient(clientResult.data as ClientRecord);
      setEntries((bodyweightResult.data ?? []) as BodyweightEntry[]);
      setLoading(false);
    };

    loadBodyweightTrend();
  }, [clientId]);

  const latestEntry = entries[entries.length - 1] ?? null;
  const firstEntry = entries[0] ?? null;
  const sevenDayAverage = getSevenDayAverage(entries);
  const totalChange = getChange(entries);
  const lowestEntry = entries.length
    ? entries.reduce((lowest, entry) => (Number(entry.bodyweight_kg) < Number(lowest.bodyweight_kg) ? entry : lowest), entries[0])
    : null;
  const highestEntry = entries.length
    ? entries.reduce((highest, entry) => (Number(entry.bodyweight_kg) > Number(highest.bodyweight_kg) ? entry : highest), entries[0])
    : null;

  const chartPoints = useMemo(() => {
    return entries.map((entry) => ({
      label: formatDate(entry.entry_date).replace(' 2026', ''),
      value: roundToOneDecimal(Number(entry.bodyweight_kg)),
    }));
  }, [entries]);

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading bodyweight trend...</Card></div>;
  }

  if (error || !client) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <p className="text-sm font-semibold text-red-700">{error || 'Client not found.'}</p>
          <Link href={`/coach/clients/${clientId}`} className="mt-4 inline-block text-sm font-bold uppercase text-[#FA0201] hover:underline">
            Back to client
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Bodyweight Trend</h1>
          <p className="mt-1 text-sm text-gray-700">{client.full_name}{client.email ? ` • ${client.email}` : ''}</p>
        </div>
        <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">
          Back to client
        </Link>
      </div>

      <section>
        <SectionHeader title="BODYWEIGHT SNAPSHOT" accent />
        <Card>
          {entries.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-sm font-semibold text-gray-700">No bodyweight entries yet.</p>
              <p className="mt-2 text-xs text-gray-500">Once the client submits bodyweight logs, trend analysis will appear here.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <MetricCard
                  label="Latest"
                  value={`${roundToOneDecimal(Number(latestEntry?.bodyweight_kg ?? 0))}kg`}
                  helper={latestEntry ? formatDate(latestEntry.entry_date) : 'No latest entry'}
                />
                <MetricCard
                  label="7-entry average"
                  value={sevenDayAverage === null ? '—' : `${sevenDayAverage}kg`}
                  helper="Rolling average"
                />
                <MetricCard
                  label="Total change"
                  value={totalChange === null ? '—' : `${totalChange > 0 ? '+' : ''}${totalChange}kg`}
                  helper={firstEntry ? `Since ${formatDate(firstEntry.entry_date)}` : 'Needs 2 entries'}
                />
                <MetricCard
                  label="Range"
                  value={lowestEntry && highestEntry ? `${roundToOneDecimal(Number(lowestEntry.bodyweight_kg))}-${roundToOneDecimal(Number(highestEntry.bodyweight_kg))}kg` : '—'}
                  helper="Lowest to highest"
                />
              </div>

              <TrendChart title="Bodyweight over time" points={chartPoints} suffix="kg" />
            </div>
          )}
        </Card>
      </section>

      {entries.length > 0 && (
        <section>
          <SectionHeader title="RECENT BODYWEIGHT LOGS" accent />
          <Card>
            <div className="space-y-3">
              {entries.slice(-10).reverse().map((entry) => (
                <div key={entry.id} className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase text-[#000000]">{formatDate(entry.entry_date)}</p>
                    {entry.notes && <p className="mt-1 text-sm text-gray-600">{entry.notes}</p>}
                  </div>
                  <p className="text-2xl font-black text-[#000000]">{roundToOneDecimal(Number(entry.bodyweight_kg))}kg</p>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      <section>
        <SectionHeader title="FUTURE BODYWEIGHT ANALYTICS" accent />
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FutureOverlayCard
              title="Nutrition overlay"
              description="Overlay calorie adherence, protein targets, and missed nutrition logs against bodyweight movement."
            />
            <FutureOverlayCard
              title="Training load overlay"
              description="Compare bodyweight trend with volume, completed sessions, and strength progression."
            />
            <FutureOverlayCard
              title="Goal-rate alerts"
              description="Flag when weight loss or gain is faster/slower than the intended coaching target."
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
