'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type SourceType = 'exercise' | 'bodyweight';
type ExerciseMetricKey = 'estimated_1rm' | 'top_weight' | 'volume' | 'top_reps' | 'completed_sets' | 'avg_reps_per_set';
type MetricKey = ExerciseMetricKey | 'bodyweight';

type ChartConfig = {
  id?: string;
  client_id: string;
  slot: number;
  source_type: SourceType;
  exercise_name: string | null;
  metric_key: MetricKey;
  title: string | null;
};

type RawPerformedSet = {
  id: string;
  actual_weight_kg: number | null;
  actual_reps: number | null;
  completed: boolean;
  workout_sessions: { completed_at: string | null; status: string } | null;
  program_exercises: { exercise_name: string } | null;
};

type BodyweightEntry = { id: string; entry_date: string; bodyweight_kg: number };

type ExerciseSessionPoint = {
  date: string;
  exerciseName: string;
  estimated_1rm: number | null;
  top_weight: number;
  volume: number;
  top_reps: number;
  completed_sets: number;
  avg_reps_per_set: number;
};

type ChartPoint = { date: string; label: string; value: number };

type EditableSlot = {
  slot: number;
  source_type: SourceType;
  exercise_name: string;
  metric_key: MetricKey;
};

const exerciseMetrics: Array<{ key: ExerciseMetricKey; label: string; suffix: string }> = [
  { key: 'estimated_1rm', label: 'Estimated 1RM', suffix: 'kg' },
  { key: 'top_weight', label: 'Top load', suffix: 'kg' },
  { key: 'volume', label: 'Volume', suffix: 'kg' },
  { key: 'top_reps', label: 'Top-set reps', suffix: ' reps' },
  { key: 'completed_sets', label: 'Completed sets', suffix: ' sets' },
  { key: 'avg_reps_per_set', label: 'Average reps/set', suffix: ' reps' },
];

const metricLabelMap: Record<MetricKey, { label: string; titleLabel: string; suffix: string }> = {
  estimated_1rm: { label: 'Estimated 1RM', titleLabel: 'estimated 1RM', suffix: 'kg' },
  top_weight: { label: 'Top load', titleLabel: 'top load', suffix: 'kg' },
  volume: { label: 'Volume', titleLabel: 'volume', suffix: 'kg' },
  top_reps: { label: 'Top-set reps', titleLabel: 'top-set reps', suffix: ' reps' },
  completed_sets: { label: 'Completed sets', titleLabel: 'completed sets', suffix: ' sets' },
  avg_reps_per_set: { label: 'Average reps/set', titleLabel: 'average reps/set', suffix: ' reps' },
  bodyweight: { label: 'Bodyweight', titleLabel: 'bodyweight', suffix: 'kg' },
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;
const formatShortDate = (value: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(value));

const estimateOneRepMax = (weight: number, reps: number) => {
  if (!weight || !reps) return null;
  if (reps === 1) return roundToOneDecimal(weight);
  return roundToOneDecimal(weight * (1 + reps / 30));
};

const formatValue = (value: number | null, suffix: string) => {
  if (value === null || Number.isNaN(value)) return '—';
  return `${roundToOneDecimal(value)}${suffix}`;
};

const formatPercent = (value: number | null) => {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value > 0 ? '+' : ''}${roundToOneDecimal(value)}%`;
};

const calculatePercentChange = (current: number | null, previous: number | null) => {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
};

const getGeneratedChartTitle = (config: Pick<ChartConfig, 'source_type' | 'exercise_name' | 'metric_key'>) => {
  if (config.source_type === 'bodyweight') return 'Bodyweight';
  return `${config.exercise_name || 'Exercise'} ${metricLabelMap[config.metric_key].titleLabel}`;
};

const getWindowStartPoint = (points: ChartPoint[], latest: ChartPoint | null, days: number) => {
  if (!latest) return null;
  const threshold = new Date(latest.date).getTime() - days * 24 * 60 * 60 * 1000;
  const candidates = points.filter((point) => new Date(point.date).getTime() >= threshold && point.date !== latest.date);
  return candidates[0] || null;
};

const groupExerciseSets = (sets: RawPerformedSet[]) => {
  const grouped = new Map<string, RawPerformedSet[]>();

  sets.forEach((set) => {
    const exerciseName = set.program_exercises?.exercise_name;
    const completedAt = set.workout_sessions?.completed_at;
    if (!exerciseName || !completedAt || !set.completed) return;
    grouped.set(`${exerciseName}__${completedAt}`, [...(grouped.get(`${exerciseName}__${completedAt}`) || []), set]);
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
        const bestEstimate = estimateOneRepMax(Number(best.actual_weight_kg ?? 0), Number(best.actual_reps ?? 0)) ?? 0;
        const currentEstimate = estimateOneRepMax(Number(current.actual_weight_kg ?? 0), Number(current.actual_reps ?? 0)) ?? 0;
        if (currentEstimate > bestEstimate) return current;
        if (currentEstimate === bestEstimate && Number(current.actual_weight_kg ?? 0) > Number(best.actual_weight_kg ?? 0)) return current;
        return best;
      }, completedSets[0]);

      const topWeight = Number(bestSet.actual_weight_kg ?? 0);
      const topReps = Number(bestSet.actual_reps ?? 0);
      const totalVolume = completedSets.reduce((total, set) => total + Number(set.actual_weight_kg ?? 0) * Number(set.actual_reps ?? 0), 0);
      const totalReps = completedSets.reduce((total, set) => total + Number(set.actual_reps ?? 0), 0);

      return {
        date: completedAt,
        exerciseName,
        estimated_1rm: estimateOneRepMax(topWeight, topReps),
        top_weight: topWeight,
        volume: roundToOneDecimal(totalVolume),
        top_reps: topReps,
        completed_sets: completedSets.length,
        avg_reps_per_set: roundToOneDecimal(totalReps / completedSets.length),
      };
    })
    .filter((point): point is ExerciseSessionPoint => Boolean(point))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const getDefaultConfigs = (clientId: string, exerciseNames: string[], hasBodyweightData: boolean): ChartConfig[] => {
  const defaults: ChartConfig[] = [];
  const bench = exerciseNames.find((name) => name.toLowerCase().includes('bench')) || exerciseNames[0];
  const squat = exerciseNames.find((name) => name.toLowerCase().includes('squat')) || exerciseNames[1] || exerciseNames[0];

  if (bench) defaults.push({ client_id: clientId, slot: 1, source_type: 'exercise', exercise_name: bench, metric_key: 'estimated_1rm', title: null });
  if (hasBodyweightData) defaults.push({ client_id: clientId, slot: 2, source_type: 'bodyweight', exercise_name: null, metric_key: 'bodyweight', title: null });
  if (squat && defaults.length < 3) defaults.push({ client_id: clientId, slot: defaults.length + 1, source_type: 'exercise', exercise_name: squat, metric_key: 'volume', title: null });

  return [1, 2, 3].map((slot) => {
    const existing = defaults[slot - 1];
    if (existing) return { ...existing, slot };
    return { client_id: clientId, slot, source_type: 'exercise', exercise_name: exerciseNames[0] || null, metric_key: 'estimated_1rm', title: null };
  });
};

const MiniLineChart = ({ points, suffix }: { points: ChartPoint[]; suffix: string }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const width = 360;
  const height = 150;
  const padding = 24;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const values = points.map((point) => point.value);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const paddedMin = minValue === maxValue ? Math.max(0, minValue - 1) : minValue;
  const paddedMax = minValue === maxValue ? maxValue + 1 : maxValue;
  const valueRange = paddedMax - paddedMin || 1;
  const selectedPoint = selectedIndex === null ? points[points.length - 1] : points[selectedIndex];

  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : padding + (index / (points.length - 1)) * chartWidth;
    const y = padding + chartHeight - ((point.value - paddedMin) / valueRange) * chartHeight;
    return { ...point, x, y };
  });

  const linePath = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  if (points.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-lg bg-gray-50">
        <p className="text-xs font-semibold uppercase text-gray-500">No data yet</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-gray-50 p-2">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-[10px] font-bold uppercase text-gray-500">Selected</p>
        <p className="text-xs font-black text-[#000000]">{selectedPoint ? `${formatShortDate(selectedPoint.date)} · ${formatValue(selectedPoint.value, suffix)}` : '—'}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#D1D5DB" strokeWidth="2" />
        <path d={linePath} fill="none" stroke="#FA0201" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {coordinates.map((point, index) => (
          <g key={`${point.label}-${index}`} className="cursor-pointer" onClick={() => setSelectedIndex(index)}>
            <circle cx={point.x} cy={point.y} r={selectedIndex === index || (selectedIndex === null && index === points.length - 1) ? 7 : 5} fill="#FA0201" />
            {(index === 0 || index === coordinates.length - 1) && (
              <text x={point.x} y={height - 6} textAnchor="middle" className="fill-gray-500 text-[10px] font-semibold">{point.label}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};

const ChartCard = ({ config, points }: { config: ChartConfig; points: ChartPoint[] }) => {
  const metric = metricLabelMap[config.metric_key];
  const latest = points[points.length - 1] || null;
  const previous = points[points.length - 2] || null;
  const fourWeekPoint = getWindowStartPoint(points, latest, 28);
  const latestValue = latest?.value ?? null;
  const sessionChange = calculatePercentChange(latestValue, previous?.value ?? null);
  const fourWeekChange = calculatePercentChange(latestValue, fourWeekPoint?.value ?? null);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black uppercase text-[#000000]">{getGeneratedChartTitle(config)}</p>
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">{metric.label}</p>
        </div>
        <div className="rounded bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">Slot {config.slot}</div>
      </div>
      <MiniLineChart points={points} suffix={metric.suffix} />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-50 p-2"><p className="text-[10px] font-bold uppercase text-gray-500">Latest</p><p className="text-sm font-black text-[#000000]">{formatValue(latestValue, metric.suffix)}</p></div>
        <div className="rounded-lg bg-gray-50 p-2"><p className="text-[10px] font-bold uppercase text-gray-500">1 session</p><p className="text-sm font-black text-[#000000]">{formatPercent(sessionChange)}</p></div>
        <div className="rounded-lg bg-gray-50 p-2"><p className="text-[10px] font-bold uppercase text-gray-500">4 weeks</p><p className="text-sm font-black text-[#000000]">{formatPercent(fourWeekChange)}</p></div>
      </div>
    </div>
  );
};

export function ClientMetricChartDashboardAuto({ clientId }: { clientId: string }) {
  const [configs, setConfigs] = useState<ChartConfig[]>([]);
  const [exercisePoints, setExercisePoints] = useState<ExerciseSessionPoint[]>([]);
  const [bodyweightEntries, setBodyweightEntries] = useState<BodyweightEntry[]>([]);
  const [editableSlots, setEditableSlots] = useState<EditableSlot[]>([]);
  const [isConfiguring, setIsConfiguring] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const [configResult, performedSetsResult, bodyweightResult] = await Promise.all([
      supabase.from('client_metric_chart_configs').select('id, client_id, slot, source_type, exercise_name, metric_key, title').eq('client_id', clientId).order('slot', { ascending: true }),
      supabase
        .from('performed_sets')
        .select(`
          id,
          actual_weight_kg,
          actual_reps,
          completed,
          workout_sessions!inner(completed_at, status, client_id),
          program_exercises!inner(exercise_name)
        `)
        .eq('workout_sessions.client_id', clientId)
        .eq('workout_sessions.status', 'completed')
        .order('created_at', { ascending: true }),
      supabase.from('bodyweight_entries').select('id, entry_date, bodyweight_kg').eq('client_id', clientId).order('entry_date', { ascending: true }),
    ]);

    if (configResult.error || performedSetsResult.error || bodyweightResult.error) {
      setError(configResult.error?.message || performedSetsResult.error?.message || bodyweightResult.error?.message || 'Could not load performance charts.');
      setLoading(false);
      return;
    }

    const groupedExercisePoints = groupExerciseSets((performedSetsResult.data ?? []) as unknown as RawPerformedSet[]);
    const bodyweightData = (bodyweightResult.data ?? []) as BodyweightEntry[];
    const loadedConfigs = (configResult.data ?? []) as ChartConfig[];
    const exerciseNames = Array.from(new Set(groupedExercisePoints.map((point) => point.exerciseName))).sort();
    const hydratedConfigs = loadedConfigs.length > 0
      ? [1, 2, 3].map((slot) => loadedConfigs.find((config) => config.slot === slot)).filter((config): config is ChartConfig => Boolean(config))
      : getDefaultConfigs(clientId, exerciseNames, bodyweightData.length > 0);

    setConfigs(hydratedConfigs);
    setExercisePoints(groupedExercisePoints);
    setBodyweightEntries(bodyweightData);
    setEditableSlots(hydratedConfigs.map((config) => ({ slot: config.slot, source_type: config.source_type, exercise_name: config.exercise_name || exerciseNames[0] || '', metric_key: config.metric_key })));
    setLoading(false);
  };

  useEffect(() => { loadDashboard(); }, [clientId]);

  const exerciseNames = useMemo(() => Array.from(new Set(exercisePoints.map((point) => point.exerciseName))).sort(), [exercisePoints]);
  const hasBodyweightData = bodyweightEntries.length > 0;

  const getChartPoints = (config: ChartConfig): ChartPoint[] => {
    if (config.source_type === 'bodyweight') {
      return bodyweightEntries.map((entry) => ({ date: entry.entry_date, label: formatShortDate(entry.entry_date), value: roundToOneDecimal(Number(entry.bodyweight_kg)) }));
    }

    return exercisePoints
      .filter((point) => point.exerciseName === config.exercise_name)
      .map((point) => {
        const value = point[config.metric_key as ExerciseMetricKey];
        if (value === null || value === undefined) return null;
        return { date: point.date, label: formatShortDate(point.date), value: Number(value) };
      })
      .filter((point): point is ChartPoint => Boolean(point));
  };

  const updateEditableSlot = (slot: number, patch: Partial<EditableSlot>) => {
    setEditableSlots((current) => current.map((item) => {
      if (item.slot !== slot) return item;
      const next = { ...item, ...patch };
      if (patch.source_type === 'bodyweight') {
        next.metric_key = 'bodyweight';
        next.exercise_name = '';
      }
      if (patch.source_type === 'exercise' && item.source_type !== 'exercise') {
        next.metric_key = 'estimated_1rm';
        next.exercise_name = exerciseNames[0] || '';
      }
      return next;
    }));
  };

  const saveSlot = async (slot: EditableSlot) => {
    if (!isSupabaseConfigured) return;
    if (slot.source_type === 'exercise' && !slot.exercise_name) {
      setError('Choose an exercise before saving this chart.');
      return;
    }

    setSavingSlot(slot.slot);
    setError(null);

    const payload = {
      client_id: clientId,
      slot: slot.slot,
      source_type: slot.source_type,
      exercise_name: slot.source_type === 'exercise' ? slot.exercise_name : null,
      metric_key: slot.source_type === 'bodyweight' ? 'bodyweight' : slot.metric_key,
      title: null,
    };

    const supabase = createClient();
    const { error: saveError } = await supabase.from('client_metric_chart_configs').upsert(payload, { onConflict: 'client_id,slot' });

    if (saveError) {
      setError(saveError.message);
      setSavingSlot(null);
      return;
    }

    setSavingSlot(null);
    await loadDashboard();
  };

  if (loading) return <Card>Loading performance charts...</Card>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-gray-700">Choose up to 3 client-specific performance charts for this profile. Titles are generated automatically from the source and metric.</p>
        <button type="button" onClick={() => setIsConfiguring((value) => !value)} className="rounded-lg bg-black px-4 py-3 text-sm font-bold uppercase text-white hover:bg-gray-900">
          {isConfiguring ? 'Close configure' : 'Configure charts'}
        </button>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      {isConfiguring && (
        <div className="rounded-xl border-2 border-[#FA0201] bg-white p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase text-[#000000]">Configure profile charts</p>
              <p className="mt-1 text-xs font-semibold uppercase text-gray-500">Maximum 3 chart slots. Titles are automatic.</p>
            </div>
            <Link href={`/coach/clients/${clientId}/progress`} className="text-xs font-bold uppercase text-[#FA0201] hover:underline">Open full progress page</Link>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {editableSlots.map((slot) => (
              <div key={slot.slot} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="mb-3 text-xs font-black uppercase text-[#000000]">Chart slot {slot.slot}</p>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Source</span>
                    <select value={slot.source_type} onChange={(event) => updateEditableSlot(slot.slot, { source_type: event.target.value as SourceType })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#000000]">
                      <option value="exercise">Exercise</option>
                      <option value="bodyweight" disabled={!hasBodyweightData}>Bodyweight{hasBodyweightData ? '' : ' (no data)'}</option>
                    </select>
                  </label>

                  {slot.source_type === 'exercise' && (
                    <>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Exercise</span>
                        <select value={slot.exercise_name} onChange={(event) => updateEditableSlot(slot.slot, { exercise_name: event.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#000000]">
                          {exerciseNames.length === 0 ? <option value="">No exercise data</option> : exerciseNames.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10px] font-bold uppercase text-gray-500">Y-axis / metric</span>
                        <select value={slot.metric_key} onChange={(event) => updateEditableSlot(slot.slot, { metric_key: event.target.value as MetricKey })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-[#000000]">
                          {exerciseMetrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
                        </select>
                      </label>
                    </>
                  )}

                  <div className="rounded-lg bg-white px-3 py-2">
                    <p className="text-[10px] font-bold uppercase text-gray-500">Generated title</p>
                    <p className="text-xs font-black uppercase text-[#000000]">{getGeneratedChartTitle({ source_type: slot.source_type, exercise_name: slot.exercise_name, metric_key: slot.source_type === 'bodyweight' ? 'bodyweight' : slot.metric_key })}</p>
                  </div>

                  <button type="button" onClick={() => saveSlot(slot)} disabled={savingSlot === slot.slot} className="w-full rounded-lg bg-[#FA0201] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60">
                    {savingSlot === slot.slot ? 'Saving...' : 'Save slot'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {configs.slice(0, 3).map((config) => <ChartCard key={`${config.slot}-${config.metric_key}-${config.exercise_name || 'bodyweight'}`} config={config} points={getChartPoints(config)} />)}
      </div>
    </div>
  );
}
