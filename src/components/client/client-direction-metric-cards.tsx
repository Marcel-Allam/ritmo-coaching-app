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

type BodyweightEntry = {
  id: string;
  entry_date: string;
  bodyweight_kg: number;
};

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

type DirectionPoint = {
  date: string;
  label: string;
  value: number;
};

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

const getGeneratedTitle = (config: Pick<ChartConfig, 'source_type' | 'exercise_name' | 'metric_key'>) => {
  if (config.source_type === 'bodyweight') return 'Bodyweight';
  return `${config.exercise_name || 'Exercise'} ${metricLabelMap[config.metric_key].titleLabel}`;
};

const getWindowStartPoint = (points: DirectionPoint[], latest: DirectionPoint | null, days: number) => {
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
  const bench = exerciseNames.find((name) => name.toLowerCase().includes('bench')) || exerciseNames[0] || null;
  const squat = exerciseNames.find((name) => name.toLowerCase().includes('squat')) || exerciseNames[1] || exerciseNames[0] || null;

  return [1, 2, 3].map((slot) => {
    if (slot === 1) return { client_id: clientId, slot, source_type: 'exercise', exercise_name: bench, metric_key: 'estimated_1rm', title: null };
    if (slot === 2 && hasBodyweightData) return { client_id: clientId, slot, source_type: 'bodyweight', exercise_name: null, metric_key: 'bodyweight', title: null };
    return { client_id: clientId, slot, source_type: 'exercise', exercise_name: squat || bench, metric_key: 'volume', title: null };
  });
};

const MiniTrend = ({ points }: { points: DirectionPoint[] }) => {
  if (points.length < 2) {
    return <div className="mt-4 flex h-20 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold uppercase text-gray-500">More data needed</div>;
  }

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const trendPoints = points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * 100;
      const y = 80 - ((point.value - min) / range) * 60;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg className="mt-4 h-20 w-full rounded-lg bg-gray-100" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points={trendPoints} fill="none" stroke="currentColor" strokeWidth="4" className="text-[#FA0201]" />
      <line x1="0" y1="82" x2="100" y2="82" stroke="currentColor" strokeWidth="1" className="text-gray-300" />
    </svg>
  );
};

const DirectionMetricCard = ({ config, points }: { config: ChartConfig; points: DirectionPoint[] }) => {
  const metric = metricLabelMap[config.metric_key];
  const latest = points[points.length - 1] || null;
  const previous = points[points.length - 2] || null;
  const fourWeekPoint = getWindowStartPoint(points, latest, 28);
  const latestValue = latest?.value ?? null;
  const sessionChange = calculatePercentChange(latestValue, previous?.value ?? null);
  const fourWeekChange = calculatePercentChange(latestValue, fourWeekPoint?.value ?? null);

  return (
    <Card>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-gray-500">Direction card</p>
          <h2 className="mt-1 text-xl font-black uppercase text-[#000000]">{getGeneratedTitle(config)}</h2>
          <p className="mt-1 text-xs font-bold uppercase text-gray-500">{metric.label}</p>
        </div>
        <Link href="/client/training/history" className="rounded-lg border border-black px-3 py-2 text-[10px] font-bold uppercase text-black hover:bg-black hover:text-white">
          View log
        </Link>
      </div>

      <MiniTrend points={points} />

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-gray-100 p-3">
          <p className="text-xs font-bold uppercase text-gray-500">Latest</p>
          <p className="mt-1 text-lg font-black text-[#000000]">{formatValue(latestValue, metric.suffix)}</p>
        </div>
        <div className="rounded-lg bg-gray-100 p-3">
          <p className="text-xs font-bold uppercase text-gray-500">1 session</p>
          <p className="mt-1 text-lg font-black text-[#000000]">{formatPercent(sessionChange)}</p>
        </div>
        <div className="rounded-lg bg-gray-100 p-3">
          <p className="text-xs font-bold uppercase text-gray-500">4 weeks</p>
          <p className="mt-1 text-lg font-black text-[#000000]">{formatPercent(fourWeekChange)}</p>
        </div>
      </div>
    </Card>
  );
};

export function ClientDirectionMetricCards({ clientId }: { clientId: string }) {
  const [configs, setConfigs] = useState<ChartConfig[]>([]);
  const [exercisePoints, setExercisePoints] = useState<ExerciseSessionPoint[]>([]);
  const [bodyweightEntries, setBodyweightEntries] = useState<BodyweightEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDirectionCards = async () => {
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
          .select(`id, actual_weight_kg, actual_reps, completed, workout_sessions!inner(completed_at, status, client_id), program_exercises!inner(exercise_name)`)
          .eq('workout_sessions.client_id', clientId)
          .eq('workout_sessions.status', 'completed')
          .order('created_at', { ascending: true }),
        supabase.from('bodyweight_entries').select('id, entry_date, bodyweight_kg').eq('client_id', clientId).order('entry_date', { ascending: true }),
      ]);

      if (configResult.error || performedSetsResult.error || bodyweightResult.error) {
        setError(configResult.error?.message || performedSetsResult.error?.message || bodyweightResult.error?.message || 'Could not load direction cards.');
        setLoading(false);
        return;
      }

      const groupedExercisePoints = groupExerciseSets((performedSetsResult.data ?? []) as unknown as RawPerformedSet[]);
      const bodyweightData = (bodyweightResult.data ?? []) as BodyweightEntry[];
      const loadedConfigs = (configResult.data ?? []) as ChartConfig[];
      const exerciseNames = Array.from(new Set(groupedExercisePoints.map((point) => point.exerciseName))).sort();
      const defaults = getDefaultConfigs(clientId, exerciseNames, bodyweightData.length > 0);
      const hydratedConfigs = [1, 2, 3]
        .map((slot) => loadedConfigs.find((config) => config.slot === slot) || defaults[slot - 1])
        .filter((config) => config.source_type === 'bodyweight' || Boolean(config.exercise_name));

      setConfigs(hydratedConfigs);
      setExercisePoints(groupedExercisePoints);
      setBodyweightEntries(bodyweightData);
      setLoading(false);
    };

    loadDirectionCards();
  }, [clientId]);

  const getDirectionPoints = useMemo(() => {
    return (config: ChartConfig): DirectionPoint[] => {
      if (config.source_type === 'bodyweight') {
        return bodyweightEntries.map((entry) => ({
          date: entry.entry_date,
          label: formatShortDate(entry.entry_date),
          value: roundToOneDecimal(Number(entry.bodyweight_kg)),
        }));
      }

      return exercisePoints
        .filter((point) => point.exerciseName === config.exercise_name)
        .map((point) => {
          const value = point[config.metric_key as ExerciseMetricKey];
          if (value === null || value === undefined) return null;
          return { date: point.date, label: formatShortDate(point.date), value: Number(value) };
        })
        .filter((point): point is DirectionPoint => Boolean(point));
    };
  }, [bodyweightEntries, exercisePoints]);

  if (loading) {
    return <Card><p className="text-sm font-semibold text-gray-700">Loading direction cards...</p></Card>;
  }

  if (error) {
    return <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>;
  }

  if (configs.length === 0) {
    return (
      <Card>
        <p className="font-bold uppercase text-[#000000]">No direction cards yet.</p>
        <p className="mt-2 text-sm text-gray-600">Once Marcel adds focus metrics, they will appear here.</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {configs.map((config) => (
        <DirectionMetricCard key={`${config.client_id}-${config.slot}`} config={config} points={getDirectionPoints(config)} />
      ))}
    </div>
  );
}
