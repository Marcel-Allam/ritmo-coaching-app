'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type MetricKey = 'estimated_1rm' | 'top_weight' | 'volume' | 'top_reps' | 'completed_sets' | 'avg_reps_per_set' | 'bodyweight';

type ChartConfig = {
  client_id: string;
  slot: number;
  source_type: 'exercise' | 'bodyweight';
  exercise_name: string | null;
  metric_key: MetricKey;
  title: string | null;
};

type RawSet = {
  actual_weight_kg: number | null;
  actual_reps: number | null;
  completed: boolean;
  workout_sessions: { completed_at: string | null } | null;
  program_exercises: { exercise_name: string } | null;
};

type Point = { date: string; value: number };

type ExercisePoint = Point & {
  exerciseName: string;
  estimated_1rm: number | null;
  top_weight: number;
  volume: number;
  top_reps: number;
  completed_sets: number;
  avg_reps_per_set: number;
};

const metricMeta: Record<MetricKey, { label: string; title: string; suffix: string }> = {
  estimated_1rm: { label: 'Estimated 1RM', title: 'estimated 1RM', suffix: 'kg' },
  top_weight: { label: 'Top load', title: 'top load', suffix: 'kg' },
  volume: { label: 'Volume', title: 'volume', suffix: 'kg' },
  top_reps: { label: 'Top-set reps', title: 'top-set reps', suffix: ' reps' },
  completed_sets: { label: 'Completed sets', title: 'completed sets', suffix: ' sets' },
  avg_reps_per_set: { label: 'Average reps/set', title: 'average reps/set', suffix: ' reps' },
  bodyweight: { label: 'Bodyweight', title: 'bodyweight', suffix: 'kg' },
};

const round = (value: number) => Math.round(value * 10) / 10;
const oneRepMax = (weight: number, reps: number) => (weight && reps ? round(weight * (1 + reps / 30)) : null);
const valueText = (value: number | null, suffix: string) => (value === null || Number.isNaN(value) ? '—' : `${round(value)}${suffix}`);

const titleFor = (config: ChartConfig) => {
  if (config.title) return config.title;
  if (config.source_type === 'bodyweight') return 'Bodyweight';
  return `${config.exercise_name || 'Exercise'} ${metricMeta[config.metric_key].title}`;
};

const buildExercisePoints = (sets: RawSet[]) => {
  const grouped = new Map<string, RawSet[]>();

  sets.forEach((set) => {
    const exerciseName = set.program_exercises?.exercise_name;
    const completedAt = set.workout_sessions?.completed_at;
    if (!exerciseName || !completedAt || !set.completed) return;
    const key = `${exerciseName}-${completedAt}`;
    grouped.set(key, [...(grouped.get(key) || []), set]);
  });

  return Array.from(grouped.values())
    .map((sessionSets): ExercisePoint | null => {
      const firstSet = sessionSets[0];
      const exerciseName = firstSet.program_exercises?.exercise_name;
      const completedAt = firstSet.workout_sessions?.completed_at;
      if (!exerciseName || !completedAt) return null;

      const completedSets = sessionSets.filter((set) => set.actual_weight_kg !== null && set.actual_reps !== null);
      if (completedSets.length === 0) return null;

      const bestSet = completedSets.reduce((best, current) => {
        const bestScore = oneRepMax(Number(best.actual_weight_kg), Number(best.actual_reps)) ?? 0;
        const currentScore = oneRepMax(Number(current.actual_weight_kg), Number(current.actual_reps)) ?? 0;
        return currentScore > bestScore ? current : best;
      }, completedSets[0]);

      const topWeight = Number(bestSet.actual_weight_kg);
      const topReps = Number(bestSet.actual_reps);
      const totalVolume = completedSets.reduce((total, set) => total + Number(set.actual_weight_kg) * Number(set.actual_reps), 0);
      const totalReps = completedSets.reduce((total, set) => total + Number(set.actual_reps), 0);

      return {
        date: completedAt,
        value: 0,
        exerciseName,
        estimated_1rm: oneRepMax(topWeight, topReps),
        top_weight: topWeight,
        volume: round(totalVolume),
        top_reps: topReps,
        completed_sets: completedSets.length,
        avg_reps_per_set: round(totalReps / completedSets.length),
      };
    })
    .filter((point): point is ExercisePoint => Boolean(point))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const MiniGraph = ({ points }: { points: Point[] }) => {
  if (points.length < 2) return <div className="flex h-full min-h-[96px] items-center justify-center rounded-xl bg-gray-100 text-center text-xs font-bold uppercase text-gray-500">More data needed</div>;

  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const polyline = points.map((point, index) => `${(index / Math.max(points.length - 1, 1)) * 100},${84 - ((point.value - min) / range) * 64}`).join(' ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full min-h-[96px] w-full rounded-xl bg-gray-100" aria-hidden="true">
      <line x1="0" y1="84" x2="100" y2="84" stroke="currentColor" strokeWidth="1" className="text-gray-300" />
      <polyline points={polyline} fill="none" stroke="currentColor" strokeWidth="4" className="text-[#FA0201]" />
    </svg>
  );
};

const ProgressTile = ({ config, points }: { config: ChartConfig; points: Point[] }) => {
  const metric = metricMeta[config.metric_key];
  const latest = points.at(-1)?.value ?? null;

  return (
    <Link href={`/client/progress/${config.slot}`} className="group block focus:outline-none focus:ring-2 focus:ring-[#FA0201] focus:ring-offset-2">
      <Card className="flex aspect-square flex-col justify-between p-5 transition group-hover:-translate-y-0.5 group-hover:border-[#FA0201] group-hover:shadow-lg">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-[#FA0201]">Progress graph</p>
          <h2 className="mt-2 line-clamp-2 text-lg font-black uppercase leading-tight text-[#000000]">{titleFor(config)}</h2>
          <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">{metric.label}</p>
        </div>
        <div className="my-4 flex-1"><MiniGraph points={points} /></div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase text-gray-500">Latest</p>
            <p className="text-xl font-black text-[#000000]">{valueText(latest, metric.suffix)}</p>
          </div>
          <p className="text-[10px] font-black uppercase text-[#000000] group-hover:text-[#FA0201]">View data →</p>
        </div>
      </Card>
    </Link>
  );
};

export function ClientProgressGraphTiles({ clientId }: { clientId: string }) {
  const [configs, setConfigs] = useState<ChartConfig[]>([]);
  const [exercisePoints, setExercisePoints] = useState<ExercisePoint[]>([]);
  const [bodyweightPoints, setBodyweightPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const [configResult, performedSetsResult, bodyweightResult] = await Promise.all([
        supabase.from('client_metric_chart_configs').select('client_id, slot, source_type, exercise_name, metric_key, title').eq('client_id', clientId).order('slot', { ascending: true }),
        supabase
          .from('performed_sets')
          .select('actual_weight_kg, actual_reps, completed, workout_sessions!inner(completed_at, status, client_id), program_exercises!inner(exercise_name)')
          .eq('workout_sessions.client_id', clientId)
          .eq('workout_sessions.status', 'completed')
          .order('created_at', { ascending: true }),
        supabase.from('bodyweight_entries').select('entry_date, bodyweight_kg').eq('client_id', clientId).order('entry_date', { ascending: true }),
      ]);

      if (configResult.error || performedSetsResult.error || bodyweightResult.error) {
        setError(configResult.error?.message || performedSetsResult.error?.message || bodyweightResult.error?.message || 'Could not load progress graphs.');
        setLoading(false);
        return;
      }

      const exerciseData = buildExercisePoints((performedSetsResult.data ?? []) as unknown as RawSet[]);
      const bodyweightData = ((bodyweightResult.data ?? []) as { entry_date: string; bodyweight_kg: number }[]).map((entry) => ({ date: entry.entry_date, value: round(Number(entry.bodyweight_kg)) }));
      const exerciseNames = Array.from(new Set(exerciseData.map((point) => point.exerciseName))).sort();
      const bench = exerciseNames.find((name) => name.toLowerCase().includes('bench')) || exerciseNames[0] || null;
      const squat = exerciseNames.find((name) => name.toLowerCase().includes('squat')) || exerciseNames[1] || exerciseNames[0] || null;
      const fallbackConfigs: ChartConfig[] = [
        { client_id: clientId, slot: 1, source_type: 'exercise', exercise_name: bench, metric_key: 'estimated_1rm', title: null },
        bodyweightData.length > 0
          ? { client_id: clientId, slot: 2, source_type: 'bodyweight', exercise_name: null, metric_key: 'bodyweight', title: null }
          : { client_id: clientId, slot: 2, source_type: 'exercise', exercise_name: squat || bench, metric_key: 'volume', title: null },
        { client_id: clientId, slot: 3, source_type: 'exercise', exercise_name: squat || bench, metric_key: 'volume', title: null },
      ];

      const loadedConfigs = (configResult.data ?? []) as ChartConfig[];
      const hydratedConfigs = [1, 2, 3]
        .map((slot) => loadedConfigs.find((config) => config.slot === slot) || fallbackConfigs[slot - 1])
        .filter((config) => config.source_type === 'bodyweight' || Boolean(config.exercise_name));

      setConfigs(hydratedConfigs);
      setExercisePoints(exerciseData);
      setBodyweightPoints(bodyweightData);
      setLoading(false);
    };

    load();
  }, [clientId]);

  const getPoints = useMemo(() => (config: ChartConfig): Point[] => {
    if (config.source_type === 'bodyweight') return bodyweightPoints;

    return exercisePoints
      .filter((point) => point.exerciseName === config.exercise_name)
      .map((point) => {
        const value = point[config.metric_key as keyof ExercisePoint];
        return typeof value === 'number' ? { date: point.date, value } : null;
      })
      .filter((point): point is Point => Boolean(point));
  }, [bodyweightPoints, exercisePoints]);

  if (loading) return <Card><p className="text-sm font-semibold text-gray-700">Loading progress graphs...</p></Card>;
  if (error) return <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>;
  if (configs.length === 0) return <Card><p className="font-bold uppercase text-[#000000]">No progress graphs yet.</p><p className="mt-2 text-sm text-gray-600">Once Marcel adds focus metrics, they will appear here.</p></Card>;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {configs.map((config) => <ProgressTile key={`${config.client_id}-${config.slot}`} config={config} points={getPoints(config)} />)}
    </div>
  );
}
