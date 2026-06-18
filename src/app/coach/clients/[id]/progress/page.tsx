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
};

type RawPerformedSet = {
  id: string;
  set_order: number;
  actual_weight_kg: number | null;
  actual_reps: number | null;
  actual_rpe: number | null;
  completed: boolean;
  workout_sessions: {
    completed_at: string | null;
    status: string;
  } | null;
  program_exercises: {
    exercise_name: string;
  } | null;
};

type ExerciseSessionPoint = {
  date: string;
  exerciseName: string;
  topWeight: number;
  topReps: number;
  topRpe: number | null;
  estimatedOneRepMax: number | null;
  totalVolume: number;
  completedSets: number;
  averageRepsPerSet: number;
};

type MetricKey = 'estimatedOneRepMax' | 'topWeight' | 'totalVolume' | 'topReps' | 'completedSets' | 'averageRepsPerSet';
type TimeWindowKey = 'all' | '4w' | '12w' | '24w';

type ChartPoint = {
  date: string;
  label: string;
  value: number;
  raw: ExerciseSessionPoint;
};

const metricOptions: Array<{ key: MetricKey; label: string; suffix: string; description: string }> = [
  { key: 'estimatedOneRepMax', label: 'Estimated 1RM', suffix: 'kg', description: 'Best-set strength estimate session to session.' },
  { key: 'topWeight', label: 'Top load', suffix: 'kg', description: 'Heaviest working set logged in each session.' },
  { key: 'totalVolume', label: 'Session volume', suffix: 'kg', description: 'Total completed load: weight × reps across completed sets.' },
  { key: 'topReps', label: 'Top-set reps', suffix: ' reps', description: 'Reps achieved on the heaviest set.' },
  { key: 'completedSets', label: 'Completed sets', suffix: ' sets', description: 'Number of completed sets for the selected exercise.' },
  { key: 'averageRepsPerSet', label: 'Avg reps/set', suffix: ' reps', description: 'Average completed reps per set in that session.' },
];

const timeWindowOptions: Array<{ key: TimeWindowKey; label: string; days: number | null }> = [
  { key: 'all', label: 'All time', days: null },
  { key: '4w', label: '4 weeks', days: 28 },
  { key: '12w', label: '12 weeks', days: 84 },
  { key: '24w', label: '24 weeks', days: 168 },
];

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const formatShortDate = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(value));

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

const estimateOneRepMax = (weight: number, reps: number) => {
  if (!weight || !reps) return null;
  if (reps === 1) return roundToOneDecimal(weight);

  // Epley estimate: simple, transparent, and useful enough for early trend tracking.
  return roundToOneDecimal(weight * (1 + reps / 30));
};

const getMetricValue = (point: ExerciseSessionPoint, metric: MetricKey) => {
  const value = point[metric];
  if (value === null || value === undefined) return null;
  return Number(value);
};

const formatMetricValue = (value: number | null, suffix: string) => {
  if (value === null || Number.isNaN(value)) return '—';
  return `${roundToOneDecimal(value)}${suffix}`;
};

const formatPercent = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return '—';
  if (value === 0) return '0%';
  return `${value > 0 ? '+' : ''}${roundToOneDecimal(value)}%`;
};

const calculatePercentChange = (current: number | null, previous: number | null) => {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
};

const getWindowStartPoint = (points: ChartPoint[], latestPoint: ChartPoint | null, days: number) => {
  if (!latestPoint) return null;
  const threshold = new Date(latestPoint.date).getTime() - days * 24 * 60 * 60 * 1000;
  const candidates = points.filter((point) => new Date(point.date).getTime() >= threshold && point.date !== latestPoint.date);
  return candidates[0] || null;
};

const groupSetsIntoSessionPoints = (sets: RawPerformedSet[]) => {
  const grouped = new Map<string, RawPerformedSet[]>();

  sets.forEach((set) => {
    const exerciseName = set.program_exercises?.exercise_name;
    const completedAt = set.workout_sessions?.completed_at;

    if (!exerciseName || !completedAt || !set.completed) return;

    const key = `${exerciseName}__${completedAt}`;
    grouped.set(key, [...(grouped.get(key) || []), set]);
  });

  return Array.from(grouped.values())
    .map((sessionSets): ExerciseSessionPoint | null => {
      const firstSet = sessionSets[0];
      const exerciseName = firstSet.program_exercises?.exercise_name;
      const completedAt = firstSet.workout_sessions?.completed_at;

      if (!exerciseName || !completedAt) return null;

      const completedSets = sessionSets.filter((set) => set.completed && set.actual_weight_kg !== null && set.actual_reps !== null);

      if (completedSets.length === 0) return null;

      const bestSet = completedSets.reduce((best, current) => {
        const bestWeight = Number(best.actual_weight_kg ?? 0);
        const bestReps = Number(best.actual_reps ?? 0);
        const bestEstimatedOneRepMax = estimateOneRepMax(bestWeight, bestReps) ?? 0;
        const currentWeight = Number(current.actual_weight_kg ?? 0);
        const currentReps = Number(current.actual_reps ?? 0);
        const currentEstimatedOneRepMax = estimateOneRepMax(currentWeight, currentReps) ?? 0;

        if (currentEstimatedOneRepMax > bestEstimatedOneRepMax) return current;
        if (currentEstimatedOneRepMax === bestEstimatedOneRepMax && currentWeight > bestWeight) return current;
        return best;
      }, completedSets[0]);

      const topWeight = Number(bestSet.actual_weight_kg ?? 0);
      const topReps = Number(bestSet.actual_reps ?? 0);
      const topRpe = bestSet.actual_rpe === null ? null : Number(bestSet.actual_rpe);
      const totalVolume = completedSets.reduce((total, set) => {
        return total + Number(set.actual_weight_kg ?? 0) * Number(set.actual_reps ?? 0);
      }, 0);
      const totalReps = completedSets.reduce((total, set) => total + Number(set.actual_reps ?? 0), 0);

      return {
        date: completedAt,
        exerciseName,
        topWeight,
        topReps,
        topRpe,
        estimatedOneRepMax: estimateOneRepMax(topWeight, topReps),
        totalVolume: roundToOneDecimal(totalVolume),
        completedSets: completedSets.length,
        averageRepsPerSet: roundToOneDecimal(totalReps / completedSets.length),
      };
    })
    .filter((point): point is ExerciseSessionPoint => Boolean(point))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const MetricCard = ({ label, value, helper }: { label: string; value: string; helper: string }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-black text-[#000000]">{value}</p>
    <p className="mt-1 text-xs font-semibold text-gray-600">{helper}</p>
  </div>
);

const InteractiveTrendChart = ({
  title,
  points,
  suffix,
}: {
  title: string;
  points: ChartPoint[];
  suffix: string;
}) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const width = 760;
  const height = 300;
  const leftPadding = 70;
  const rightPadding = 34;
  const topPadding = 34;
  const bottomPadding = 54;
  const chartWidth = width - leftPadding - rightPadding;
  const chartHeight = height - topPadding - bottomPadding;
  const values = points.map((point) => point.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const paddedMin = minValue === maxValue ? Math.max(0, minValue - 1) : minValue;
  const paddedMax = minValue === maxValue ? maxValue + 1 : maxValue;
  const valueRange = paddedMax - paddedMin || 1;
  const selectedPoint = selectedIndex === null ? points[points.length - 1] : points[selectedIndex];

  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? leftPadding + chartWidth / 2 : leftPadding + (index / (points.length - 1)) * chartWidth;
    const y = topPadding + chartHeight - ((point.value - paddedMin) / valueRange) * chartHeight;
    return { ...point, x, y };
  });

  const linePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const yTicks = [paddedMax, paddedMin + valueRange * 0.5, paddedMin];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-[#000000]">{title}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-gray-500">Click a point to inspect a session.</p>
        </div>
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-right">
          <p className="text-xs font-bold uppercase text-gray-500">Selected</p>
          <p className="text-sm font-black text-[#000000]">{selectedPoint ? `${formatShortDate(selectedPoint.date)} · ${formatMetricValue(selectedPoint.value, suffix)}` : 'No point'}</p>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg bg-gray-50">
          <p className="text-sm font-semibold text-gray-500">Not enough data yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px] rounded-lg bg-gray-50">
            {yTicks.map((tick) => {
              const y = topPadding + chartHeight - ((tick - paddedMin) / valueRange) * chartHeight;
              return (
                <g key={tick}>
                  <line x1={leftPadding} y1={y} x2={width - rightPadding} y2={y} stroke="#E5E7EB" strokeWidth="1" />
                  <text x={leftPadding - 12} y={y + 4} textAnchor="end" className="fill-gray-500 text-[11px] font-semibold">
                    {roundToOneDecimal(tick)}{suffix}
                  </text>
                </g>
              );
            })}
            <line x1={leftPadding} y1={topPadding} x2={leftPadding} y2={height - bottomPadding} stroke="#D1D5DB" strokeWidth="2" />
            <line x1={leftPadding} y1={height - bottomPadding} x2={width - rightPadding} y2={height - bottomPadding} stroke="#D1D5DB" strokeWidth="2" />
            <path d={linePath} fill="none" stroke="#FA0201" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            {coordinates.map((point, index) => (
              <g key={`${point.label}-${point.x}`} className="cursor-pointer" onClick={() => setSelectedIndex(index)}>
                <circle cx={point.x} cy={point.y} r={selectedIndex === index || (selectedIndex === null && index === points.length - 1) ? 8 : 6} fill="#FA0201" />
                <text x={point.x} y={height - 22} textAnchor="middle" className="fill-gray-600 text-[10px] font-semibold">
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

export default function ClientExerciseProgressPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [sessionPoints, setSessionPoints] = useState<ExerciseSessionPoint[]>([]);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('estimatedOneRepMax');
  const [selectedWindow, setSelectedWindow] = useState<TimeWindowKey>('12w');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProgress = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const [clientResult, performedSetsResult] = await Promise.all([
        supabase
          .from('clients')
          .select('id, full_name, email')
          .eq('id', clientId)
          .single(),
        supabase
          .from('performed_sets')
          .select(`
            id,
            set_order,
            actual_weight_kg,
            actual_reps,
            actual_rpe,
            completed,
            workout_sessions!inner(completed_at, status, client_id),
            program_exercises!inner(exercise_name)
          `)
          .eq('workout_sessions.client_id', clientId)
          .eq('workout_sessions.status', 'completed')
          .order('created_at', { ascending: true }),
      ]);

      if (clientResult.error || !clientResult.data) {
        setError(clientResult.error?.message || 'Client not found.');
        setLoading(false);
        return;
      }

      if (performedSetsResult.error) {
        setError(performedSetsResult.error.message);
        setLoading(false);
        return;
      }

      const groupedPoints = groupSetsIntoSessionPoints((performedSetsResult.data ?? []) as unknown as RawPerformedSet[]);
      const exerciseNames = Array.from(new Set(groupedPoints.map((point) => point.exerciseName))).sort();

      setClient(clientResult.data as ClientRecord);
      setSessionPoints(groupedPoints);
      setSelectedExercise(exerciseNames[0] || '');
      setLoading(false);
    };

    loadProgress();
  }, [clientId]);

  const exerciseNames = useMemo(() => {
    return Array.from(new Set(sessionPoints.map((point) => point.exerciseName))).sort();
  }, [sessionPoints]);

  const selectedPoints = useMemo(() => {
    return sessionPoints.filter((point) => point.exerciseName === selectedExercise);
  }, [selectedExercise, sessionPoints]);

  const activeMetric = metricOptions.find((metric) => metric.key === selectedMetric) || metricOptions[0];
  const activeWindow = timeWindowOptions.find((windowOption) => windowOption.key === selectedWindow) || timeWindowOptions[0];

  const filteredPoints = useMemo(() => {
    if (!activeWindow.days || selectedPoints.length === 0) return selectedPoints;
    const latestDate = new Date(selectedPoints[selectedPoints.length - 1].date).getTime();
    const threshold = latestDate - activeWindow.days * 24 * 60 * 60 * 1000;
    return selectedPoints.filter((point) => new Date(point.date).getTime() >= threshold);
  }, [activeWindow.days, selectedPoints]);

  const chartPoints = filteredPoints
    .map((point) => {
      const value = getMetricValue(point, selectedMetric);
      if (value === null) return null;
      return {
        date: point.date,
        label: formatShortDate(point.date),
        value,
        raw: point,
      };
    })
    .filter((point): point is ChartPoint => Boolean(point));

  const latestChartPoint = chartPoints[chartPoints.length - 1] || null;
  const previousChartPoint = chartPoints[chartPoints.length - 2] || null;
  const oneWeekStartPoint = getWindowStartPoint(chartPoints, latestChartPoint, 7);
  const fourWeekStartPoint = getWindowStartPoint(chartPoints, latestChartPoint, 28);
  const latestValue = latestChartPoint?.value ?? null;
  const bestValue = chartPoints.length ? Math.max(...chartPoints.map((point) => point.value)) : null;
  const sessionChangePercent = calculatePercentChange(latestValue, previousChartPoint?.value ?? null);
  const oneWeekChangePercent = calculatePercentChange(latestValue, oneWeekStartPoint?.value ?? null);
  const fourWeekChangePercent = calculatePercentChange(latestValue, fourWeekStartPoint?.value ?? null);

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading exercise progress...</Card></div>;
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
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Exercise Progress</h1>
          <p className="mt-1 text-sm text-gray-700">{client.full_name}{client.email ? ` • ${client.email}` : ''}</p>
        </div>
        <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">
          Back to client
        </Link>
      </div>

      <section>
        <SectionHeader title="EXERCISE TRACKING" accent />
        <Card>
          {exerciseNames.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-sm font-semibold text-gray-700">No completed performed sets yet.</p>
              <p className="mt-2 text-xs text-gray-500">Once the client completes workouts through Start your workout, exercise trends will appear here.</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Exercise</label>
                  <select
                    value={selectedExercise}
                    onChange={(event) => setSelectedExercise(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                  >
                    {exerciseNames.map((exerciseName) => (
                      <option key={exerciseName} value={exerciseName}>{exerciseName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Metric</label>
                  <select
                    value={selectedMetric}
                    onChange={(event) => setSelectedMetric(event.target.value as MetricKey)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                  >
                    {metricOptions.map((metric) => (
                      <option key={metric.key} value={metric.key}>{metric.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Window</label>
                  <select
                    value={selectedWindow}
                    onChange={(event) => setSelectedWindow(event.target.value as TimeWindowKey)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                  >
                    {timeWindowOptions.map((windowOption) => (
                      <option key={windowOption.key} value={windowOption.key}>{windowOption.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl bg-black p-4 text-white">
                <p className="text-xs font-bold uppercase text-gray-400">Tracking view</p>
                <p className="mt-1 text-xl font-black uppercase">{selectedExercise} · {activeMetric.label}</p>
                <p className="mt-2 text-xs text-gray-300">{activeMetric.description}</p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <MetricCard label="Latest" value={formatMetricValue(latestValue, activeMetric.suffix)} helper="Most recent completed session" />
                <MetricCard label="Session change" value={formatPercent(sessionChangePercent)} helper="Latest vs previous session" />
                <MetricCard label="1-week change" value={formatPercent(oneWeekChangePercent)} helper="Latest vs first point in last 7 days" />
                <MetricCard label="4-week change" value={formatPercent(fourWeekChangePercent)} helper="Latest vs first point in last 28 days" />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <MetricCard label="Best in window" value={formatMetricValue(bestValue, activeMetric.suffix)} helper={activeWindow.label} />
                <MetricCard label="Data points" value={`${chartPoints.length}`} helper="Completed exercise sessions" />
                <MetricCard label="All logged sessions" value={`${selectedPoints.length}`} helper="For selected exercise" />
              </div>
            </div>
          )}
        </Card>
      </section>

      {exerciseNames.length > 0 && (
        <section>
          <SectionHeader title="INTERACTIVE TREND GRAPH" accent />
          <InteractiveTrendChart title={`${activeMetric.label} over time`} points={chartPoints} suffix={activeMetric.suffix} />
        </section>
      )}
    </div>
  );
}
