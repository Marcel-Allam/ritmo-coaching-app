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

const estimateOneRepMax = (weight: number, reps: number) => {
  if (!weight || !reps) return null;
  if (reps === 1) return roundToOneDecimal(weight);

  // Epley estimate: simple, transparent, and useful enough for early trend tracking.
  return roundToOneDecimal(weight * (1 + reps / 30));
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

      const completedSets = sessionSets.filter((set) => set.completed && set.actual_weight_kg && set.actual_reps);

      if (completedSets.length === 0) return null;

      const topSet = completedSets.reduce((best, current) => {
        const bestWeight = best.actual_weight_kg ?? 0;
        const bestReps = best.actual_reps ?? 0;
        const currentWeight = current.actual_weight_kg ?? 0;
        const currentReps = current.actual_reps ?? 0;

        if (currentWeight > bestWeight) return current;
        if (currentWeight === bestWeight && currentReps > bestReps) return current;
        return best;
      }, completedSets[0]);

      const topWeight = Number(topSet.actual_weight_kg ?? 0);
      const topReps = Number(topSet.actual_reps ?? 0);
      const topRpe = topSet.actual_rpe === null ? null : Number(topSet.actual_rpe);
      const totalVolume = completedSets.reduce((total, set) => {
        return total + Number(set.actual_weight_kg ?? 0) * Number(set.actual_reps ?? 0);
      }, 0);

      return {
        date: completedAt,
        exerciseName,
        topWeight,
        topReps,
        topRpe,
        estimatedOneRepMax: estimateOneRepMax(topWeight, topReps),
        totalVolume: roundToOneDecimal(totalVolume),
        completedSets: completedSets.length,
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

const TrendChart = ({ title, points, suffix = '' }: { title: string; points: ChartPoint[]; suffix?: string }) => {
  const width = 640;
  const height = 220;
  const padding = 34;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  const values = points.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
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
        <p className="text-xs font-semibold text-gray-500">
          {points.length} point{points.length === 1 ? '' : 's'}
        </p>
      </div>

      {points.length === 0 ? (
        <div className="flex h-56 items-center justify-center rounded-lg bg-gray-50">
          <p className="text-sm font-semibold text-gray-500">Not enough data yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[520px] rounded-lg bg-gray-50">
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

const FutureTrackingCard = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4">
    <p className="text-sm font-bold uppercase text-[#000000]">{title}</p>
    <p className="mt-1 text-xs text-gray-600">{description}</p>
    <p className="mt-3 inline-block rounded bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">Future upgrade</p>
  </div>
);

export default function ClientExerciseProgressPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [sessionPoints, setSessionPoints] = useState<ExerciseSessionPoint[]>([]);
  const [selectedExercise, setSelectedExercise] = useState('');
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

  const latestPoint = selectedPoints[selectedPoints.length - 1] ?? null;
  const previousPoint = selectedPoints[selectedPoints.length - 2] ?? null;
  const bestWeight = selectedPoints.length ? Math.max(...selectedPoints.map((point) => point.topWeight)) : 0;
  const bestEstimatedOneRepMax = selectedPoints.length
    ? Math.max(...selectedPoints.map((point) => point.estimatedOneRepMax ?? 0))
    : 0;
  const latestEstimatedOneRepMax = latestPoint?.estimatedOneRepMax ?? null;
  const previousEstimatedOneRepMax = previousPoint?.estimatedOneRepMax ?? null;
  const estimatedOneRepMaxChange = latestEstimatedOneRepMax !== null && previousEstimatedOneRepMax !== null
    ? roundToOneDecimal(latestEstimatedOneRepMax - previousEstimatedOneRepMax)
    : null;

  const topWeightChartPoints = selectedPoints.map((point) => ({
    label: formatDate(point.date).replace(' 2026', ''),
    value: point.topWeight,
  }));

  const estimatedOneRepMaxChartPoints = selectedPoints
    .filter((point) => point.estimatedOneRepMax !== null)
    .map((point) => ({
      label: formatDate(point.date).replace(' 2026', ''),
      value: point.estimatedOneRepMax as number,
    }));

  const volumeChartPoints = selectedPoints.map((point) => ({
    label: formatDate(point.date).replace(' 2026', ''),
    value: point.totalVolume,
  }));

  const rpeChartPoints = selectedPoints
    .filter((point) => point.topRpe !== null)
    .map((point) => ({
      label: formatDate(point.date).replace(' 2026', ''),
      value: point.topRpe as number,
    }));

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
                <div className="md:col-span-1">
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
                <div className="rounded-xl bg-black p-4 text-white md:col-span-2">
                  <p className="text-xs font-bold uppercase text-gray-400">Selected exercise</p>
                  <p className="mt-1 text-xl font-black uppercase">{selectedExercise}</p>
                  <p className="mt-2 text-xs text-gray-300">Built from completed workout session set data.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <MetricCard
                  label="Logged sessions"
                  value={`${selectedPoints.length}`}
                  helper="Completed sessions"
                />
                <MetricCard
                  label="Best top set"
                  value={`${roundToOneDecimal(bestWeight)}kg`}
                  helper="Heaviest logged set"
                />
                <MetricCard
                  label="Best est. 1RM"
                  value={bestEstimatedOneRepMax ? `${roundToOneDecimal(bestEstimatedOneRepMax)}kg` : '—'}
                  helper="Epley estimate"
                />
                <MetricCard
                  label="Latest change"
                  value={estimatedOneRepMaxChange === null ? '—' : `${estimatedOneRepMaxChange > 0 ? '+' : ''}${estimatedOneRepMaxChange}kg`}
                  helper="Latest est. 1RM vs previous"
                />
              </div>
            </div>
          )}
        </Card>
      </section>

      {exerciseNames.length > 0 && (
        <section>
          <SectionHeader title="INTERACTIVE TREND CARDS" accent />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <TrendChart title="Top set load" points={topWeightChartPoints} suffix="kg" />
            <TrendChart title="Estimated 1RM" points={estimatedOneRepMaxChartPoints} suffix="kg" />
            <TrendChart title="Session volume" points={volumeChartPoints} suffix="kg" />
            <TrendChart title="Top set RPE" points={rpeChartPoints} />
          </div>
        </section>
      )}

      <section>
        <SectionHeader title="FUTURE ANALYTICS ROADMAP" accent />
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <FutureTrackingCard
              title="Muscle group volume"
              description="Use exercise catalogue tags to group completed sets by chest, back, quads, hamstrings, glutes, delts, and arms."
            />
            <FutureTrackingCard
              title="Progress alerts"
              description="Automatic flags for stalled lifts, repeated high RPE, missed volume, and sudden performance drops."
            />
            <FutureTrackingCard
              title="Client-facing graphs"
              description="A simplified client dashboard showing progress without overwhelming them with coach-level analytics."
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
