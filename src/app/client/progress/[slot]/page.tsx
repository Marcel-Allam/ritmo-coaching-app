'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type MetricKey = 'estimated_1rm' | 'top_weight' | 'volume' | 'top_reps' | 'completed_sets' | 'avg_reps_per_set' | 'bodyweight';
type Config = { slot: number; source_type: 'exercise' | 'bodyweight'; exercise_name: string | null; metric_key: MetricKey; title: string | null };
type Point = { date: string; value: number };
type RawSet = { actual_weight_kg: number | null; actual_reps: number | null; completed: boolean; workout_sessions: { completed_at: string | null } | null; program_exercises: { exercise_name: string } | null };

const meta: Record<MetricKey, { label: string; suffix: string; title: string }> = {
  estimated_1rm: { label: 'Estimated 1RM', suffix: 'kg', title: 'estimated 1RM' },
  top_weight: { label: 'Top load', suffix: 'kg', title: 'top load' },
  volume: { label: 'Volume', suffix: 'kg', title: 'volume' },
  top_reps: { label: 'Top-set reps', suffix: ' reps', title: 'top-set reps' },
  completed_sets: { label: 'Completed sets', suffix: ' sets', title: 'completed sets' },
  avg_reps_per_set: { label: 'Average reps/set', suffix: ' reps', title: 'average reps/set' },
  bodyweight: { label: 'Bodyweight', suffix: 'kg', title: 'bodyweight' },
};

const round = (value: number) => Math.round(value * 10) / 10;
const estimate = (weight: number, reps: number) => (weight && reps ? round(weight * (1 + reps / 30)) : 0);
const formatDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(date));
const formatValue = (value: number | null, suffix: string) => (value === null || Number.isNaN(value) ? '—' : `${round(value)}${suffix}`);

const titleFor = (config: Config) => {
  if (config.title) return config.title;
  if (config.source_type === 'bodyweight') return 'Bodyweight';
  return `${config.exercise_name || 'Exercise'} ${meta[config.metric_key].title}`;
};

const buildExercisePoints = (sets: RawSet[], config: Config): Point[] => {
  const grouped = new Map<string, RawSet[]>();

  sets.forEach((set) => {
    if (!set.completed || set.program_exercises?.exercise_name !== config.exercise_name || !set.workout_sessions?.completed_at) return;
    const key = set.workout_sessions.completed_at;
    grouped.set(key, [...(grouped.get(key) || []), set]);
  });

  return Array.from(grouped.entries())
    .map(([date, sessionSets]) => {
      const completedSets = sessionSets.filter((set) => set.actual_weight_kg !== null && set.actual_reps !== null);
      const weights = completedSets.map((set) => Number(set.actual_weight_kg));
      const reps = completedSets.map((set) => Number(set.actual_reps));
      const volumes = completedSets.map((set) => Number(set.actual_weight_kg) * Number(set.actual_reps));
      const estimates = completedSets.map((set) => estimate(Number(set.actual_weight_kg), Number(set.actual_reps)));
      const totalReps = reps.reduce((total, value) => total + value, 0);
      const totalVolume = volumes.reduce((total, value) => total + value, 0);

      let value = 0;
      if (config.metric_key === 'estimated_1rm') value = Math.max(...estimates, 0);
      if (config.metric_key === 'top_weight') value = Math.max(...weights, 0);
      if (config.metric_key === 'volume') value = totalVolume;
      if (config.metric_key === 'top_reps') value = Math.max(...reps, 0);
      if (config.metric_key === 'completed_sets') value = completedSets.length;
      if (config.metric_key === 'avg_reps_per_set') value = completedSets.length ? totalReps / completedSets.length : 0;

      return { date, value: round(value) };
    })
    .filter((point) => point.value > 0)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const Graph = ({ points }: { points: Point[] }) => {
  if (points.length < 2) return <div className="flex h-80 items-center justify-center rounded-xl bg-gray-100 text-sm font-bold uppercase text-gray-500">More data needed</div>;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const line = points.map((point, index) => `${(index / Math.max(points.length - 1, 1)) * 100},${84 - ((point.value - min) / range) * 64}`).join(' ');

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-80 w-full rounded-xl bg-gray-100" aria-hidden="true">
      <line x1="0" y1="84" x2="100" y2="84" stroke="currentColor" strokeWidth="0.5" className="text-gray-300" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" className="text-[#FA0201]" />
    </svg>
  );
};

export default function ClientProgressDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const slot = Number(params.slot);
  const [config, setConfig] = useState<Config | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured || !user) {
        setError('Account is not ready yet.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: clientData, error: clientError } = await supabase.from('clients').select('id').eq('user_id', user.id).single();
      if (clientError || !clientData) {
        setError('This account is not linked to a client record yet.');
        setLoading(false);
        return;
      }

      const clientId = (clientData as { id: string }).id;
      const [configResult, setResult, bodyweightResult] = await Promise.all([
        supabase.from('client_metric_chart_configs').select('slot, source_type, exercise_name, metric_key, title').eq('client_id', clientId).order('slot', { ascending: true }),
        supabase
          .from('performed_sets')
          .select('actual_weight_kg, actual_reps, completed, workout_sessions!inner(completed_at, status, client_id), program_exercises!inner(exercise_name)')
          .eq('workout_sessions.client_id', clientId)
          .eq('workout_sessions.status', 'completed')
          .order('created_at', { ascending: true }),
        supabase.from('bodyweight_entries').select('entry_date, bodyweight_kg').eq('client_id', clientId).order('entry_date', { ascending: true }),
      ]);

      if (configResult.error || setResult.error || bodyweightResult.error) {
        setError(configResult.error?.message || setResult.error?.message || bodyweightResult.error?.message || 'Could not load progress data.');
        setLoading(false);
        return;
      }

      const rawSets = (setResult.data ?? []) as unknown as RawSet[];
      const bodyweightPoints = ((bodyweightResult.data ?? []) as { entry_date: string; bodyweight_kg: number }[]).map((entry) => ({ date: entry.entry_date, value: round(Number(entry.bodyweight_kg)) }));
      const exerciseNames = Array.from(new Set(rawSets.map((set) => set.program_exercises?.exercise_name).filter((name): name is string => Boolean(name)))).sort();
      const bench = exerciseNames.find((name) => name.toLowerCase().includes('bench')) || exerciseNames[0] || null;
      const squat = exerciseNames.find((name) => name.toLowerCase().includes('squat')) || exerciseNames[1] || exerciseNames[0] || null;
      const fallback: Config[] = [
        { slot: 1, source_type: 'exercise', exercise_name: bench, metric_key: 'estimated_1rm', title: null },
        bodyweightPoints.length ? { slot: 2, source_type: 'bodyweight', exercise_name: null, metric_key: 'bodyweight', title: null } : { slot: 2, source_type: 'exercise', exercise_name: squat || bench, metric_key: 'volume', title: null },
        { slot: 3, source_type: 'exercise', exercise_name: squat || bench, metric_key: 'volume', title: null },
      ];
      const chosenConfig = ((configResult.data ?? []) as Config[]).find((item) => item.slot === slot) || fallback[slot - 1] || null;

      if (!chosenConfig) {
        setError('Progress graph not found.');
        setLoading(false);
        return;
      }

      setConfig(chosenConfig);
      setPoints(chosenConfig.source_type === 'bodyweight' ? bodyweightPoints : buildExercisePoints(rawSets, chosenConfig));
      setLoading(false);
    };

    load();
  }, [slot, user]);

  const metric = config ? meta[config.metric_key] : null;
  const latest = points.at(-1)?.value ?? null;

  if (loading) return <div><PageHeader title="PROGRESS DATA" /><div className="mx-auto max-w-6xl px-4 py-6 md:px-8"><Card><p className="font-semibold text-gray-700">Loading progress data...</p></Card></div></div>;
  if (error || !config || !metric) return <div><PageHeader title="PROGRESS DATA" /><div className="mx-auto max-w-6xl px-4 py-6 md:px-8"><Card><p className="text-sm font-semibold text-red-700">{error || 'Progress graph unavailable.'}</p></Card></div></div>;

  return (
    <div>
      <PageHeader title="PROGRESS DATA" subtitle={titleFor(config)} />
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 md:px-8">
        <Link href="/client" className="inline-flex rounded-lg border border-gray-300 bg-white px-4 py-3 text-xs font-black uppercase text-[#000000] hover:bg-gray-100">Back to hub</Link>
        <Card className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">{metric.label}</p>
              <h1 className="mt-2 text-3xl font-black uppercase text-[#000000]">{titleFor(config)}</h1>
            </div>
            <div className="rounded-xl bg-gray-100 p-4"><p className="text-[10px] font-bold uppercase text-gray-500">Latest</p><p className="text-2xl font-black text-[#000000]">{formatValue(latest, metric.suffix)}</p></div>
          </div>
          <Graph points={points} />
        </Card>
        <Card>
          <h2 className="text-lg font-black uppercase text-[#000000]">Your data</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead><tr className="border-b border-gray-200 text-xs font-black uppercase text-gray-500"><th className="py-3 pr-4">Date</th><th className="py-3 pr-4">Value</th></tr></thead>
              <tbody>
                {points.length === 0 ? <tr><td colSpan={2} className="py-4 text-sm font-semibold text-gray-600">No data logged yet.</td></tr> : points.slice().reverse().map((point) => (
                  <tr key={`${point.date}-${point.value}`} className="border-b border-gray-100"><td className="py-3 pr-4 font-semibold text-gray-700">{formatDate(point.date)}</td><td className="py-3 pr-4 font-black text-[#000000]">{formatValue(point.value, metric.suffix)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
