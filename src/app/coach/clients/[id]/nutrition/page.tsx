'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = {
  id: string;
  full_name: string;
  email: string | null;
  current_focus: string | null;
};

type NutritionSubmissionRecord = {
  id: string;
  submitted_at: string;
  entry_date?: string | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  notes?: string | null;
};

type TaskSubmissionRecord = {
  id: string;
  submitted_at: string;
  submission_type: string;
  answer_value: number | null;
  answer_text: string | null;
  review_status: string;
  followup_required: boolean;
};

type NutritionEntry = {
  id: string;
  submitted_at: string;
  entry_date: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  notes: string | null;
  source: 'nutrition_submissions' | 'task_submissions';
  review_status?: string | null;
};

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const round = (value: number) => Math.round(value);

const safeNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractFromText = (text: string | null, keys: string[]) => {
  if (!text) return null;

  for (const key of keys) {
    const pattern = new RegExp(`${key}\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)`, 'i');
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }

  return null;
};

const getAverage = (entries: NutritionEntry[], key: keyof Pick<NutritionEntry, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>) => {
  const values = entries.map((entry) => entry[key]).filter((value): value is number => typeof value === 'number');
  if (values.length === 0) return null;

  return round(values.reduce((total, value) => total + value, 0) / values.length);
};

const getLoggedDays = (entries: NutritionEntry[]) => {
  const uniqueDates = new Set(
    entries.map((entry) => (entry.entry_date || entry.submitted_at).slice(0, 10))
  );

  return uniqueDates.size;
};

const getThirtyDayWindow = () => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setDate(end.getDate() - 29);
  start.setHours(0, 0, 0, 0);

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    startTimestamp: start.toISOString(),
    endTimestamp: end.toISOString(),
  };
};

const MetricCard = ({ label, value, helper }: { label: string; value: string | number; helper: string }) => (
  <div className="rounded-xl border border-gray-200 bg-white p-4">
    <p className="text-xs font-bold uppercase text-gray-500">{label}</p>
    <p className="mt-2 text-3xl font-black text-[#000000]">{value}</p>
    <p className="mt-1 text-xs font-semibold text-gray-600">{helper}</p>
  </div>
);

const NutritionBar = ({ label, value, max, suffix }: { label: string; value: number | null; max: number; suffix: string }) => {
  const percentage = value === null ? 0 : Math.min((value / max) * 100, 100);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="text-sm font-bold uppercase text-[#000000]">{label}</p>
        <p className="text-sm font-black text-[#000000]">{value === null ? '—' : `${value}${suffix}`}</p>
      </div>
      <div className="h-4 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-[#FA0201]" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

const FutureNutritionCard = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4">
    <p className="text-sm font-bold uppercase text-[#000000]">{title}</p>
    <p className="mt-1 text-xs text-gray-600">{description}</p>
    <p className="mt-3 inline-block rounded bg-black px-2 py-1 text-[10px] font-bold uppercase text-white">Future nutrition layer</p>
  </div>
);

export default function ClientNutritionPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [nutritionEntries, setNutritionEntries] = useState<NutritionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadNutrition = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const windowRange = getThirtyDayWindow();
      const supabase = createClient();

      const clientResult = await supabase
        .from('clients')
        .select('id, full_name, email, current_focus')
        .eq('id', clientId)
        .single();

      if (clientResult.error || !clientResult.data) {
        setError(clientResult.error?.message || 'Client not found.');
        setLoading(false);
        return;
      }

      const taskSubmissionsResult = await supabase
        .from('task_submissions')
        .select('id, submitted_at, submission_type, answer_value, answer_text, review_status, followup_required')
        .eq('client_id', clientId)
        .gte('submitted_at', windowRange.startTimestamp)
        .lte('submitted_at', windowRange.endTimestamp)
        .in('submission_type', ['nutrition', 'nutrition_submission', 'food_log'])
        .order('submitted_at', { ascending: false });

      if (taskSubmissionsResult.error) {
        setError(taskSubmissionsResult.error.message);
        setLoading(false);
        return;
      }

      let dedicatedNutritionEntries: NutritionEntry[] = [];

      const dedicatedNutritionResult = await supabase
        .from('nutrition_submissions')
        .select('*')
        .eq('client_id', clientId)
        .gte('submitted_at', windowRange.startTimestamp)
        .lte('submitted_at', windowRange.endTimestamp)
        .order('submitted_at', { ascending: false });

      if (!dedicatedNutritionResult.error && dedicatedNutritionResult.data) {
        dedicatedNutritionEntries = (dedicatedNutritionResult.data as NutritionSubmissionRecord[]).map((entry) => ({
          id: entry.id,
          submitted_at: entry.submitted_at,
          entry_date: entry.entry_date || entry.submitted_at,
          calories: safeNumber(entry.calories),
          protein_g: safeNumber(entry.protein_g),
          carbs_g: safeNumber(entry.carbs_g),
          fat_g: safeNumber(entry.fat_g),
          notes: entry.notes || null,
          source: 'nutrition_submissions',
          review_status: null,
        }));
      }

      const taskEntries = ((taskSubmissionsResult.data ?? []) as TaskSubmissionRecord[]).map((submission) => ({
        id: submission.id,
        submitted_at: submission.submitted_at,
        entry_date: submission.submitted_at,
        calories: safeNumber(submission.answer_value) ?? extractFromText(submission.answer_text, ['calories', 'kcal', 'cals']),
        protein_g: extractFromText(submission.answer_text, ['protein', 'protein_g', 'p']),
        carbs_g: extractFromText(submission.answer_text, ['carbs', 'carbohydrates', 'carbs_g', 'c']),
        fat_g: extractFromText(submission.answer_text, ['fat', 'fats', 'fat_g', 'f']),
        notes: submission.answer_text,
        source: 'task_submissions' as const,
        review_status: submission.review_status,
      }));

      setClient(clientResult.data as ClientRecord);
      setNutritionEntries([...dedicatedNutritionEntries, ...taskEntries].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()));
      setLoading(false);
    };

    loadNutrition();
  }, [clientId]);

  const windowRange = getThirtyDayWindow();
  const loggedDays = getLoggedDays(nutritionEntries);
  const loggingRate = Math.round((loggedDays / 30) * 100);
  const avgCalories = getAverage(nutritionEntries, 'calories');
  const avgProtein = getAverage(nutritionEntries, 'protein_g');
  const avgCarbs = getAverage(nutritionEntries, 'carbs_g');
  const avgFat = getAverage(nutritionEntries, 'fat_g');
  const entriesWithMacros = nutritionEntries.filter((entry) => entry.protein_g !== null || entry.carbs_g !== null || entry.fat_g !== null).length;

  const recentNotes = useMemo(() => {
    return nutritionEntries
      .filter((entry) => entry.notes)
      .slice(0, 6);
  }, [nutritionEntries]);

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading nutrition tracking...</Card></div>;
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
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Nutrition Tracking</h1>
          <p className="mt-1 text-sm text-gray-700">{client.full_name}{client.email ? ` • ${client.email}` : ''}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-gray-500">{formatDate(windowRange.startDate)} → {formatDate(windowRange.endDate)}</p>
        </div>
        <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">
          Back to client
        </Link>
      </div>

      <section>
        <SectionHeader title="NUTRITION SNAPSHOT" accent />
        <Card>
          {nutritionEntries.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center">
              <p className="text-sm font-semibold text-gray-700">No nutrition submissions in the last 30 days.</p>
              <p className="mt-2 text-xs text-gray-500">Once nutrition logs are submitted, calorie and macro summaries will appear here.</p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <MetricCard label="Logging rate" value={`${loggingRate}%`} helper={`${loggedDays}/30 days logged`} />
                <MetricCard label="Avg calories" value={avgCalories === null ? '—' : avgCalories} helper="Available logged entries" />
                <MetricCard label="Avg protein" value={avgProtein === null ? '—' : `${avgProtein}g`} helper="Available macro entries" />
                <MetricCard label="Macro detail" value={entriesWithMacros} helper="Entries with macro data" />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <NutritionBar label="Calories" value={avgCalories} max={3500} suffix=" kcal" />
                <NutritionBar label="Protein" value={avgProtein} max={250} suffix="g" />
                <NutritionBar label="Carbs" value={avgCarbs} max={450} suffix="g" />
                <NutritionBar label="Fat" value={avgFat} max={150} suffix="g" />
              </div>
            </div>
          )}
        </Card>
      </section>

      {nutritionEntries.length > 0 && (
        <section>
          <SectionHeader title="RECENT NUTRITION LOGS" accent />
          <Card>
            <div className="space-y-3">
              {nutritionEntries.slice(0, 10).map((entry) => (
                <div key={`${entry.source}-${entry.id}`} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-black uppercase text-[#000000]">{formatDate(entry.entry_date || entry.submitted_at)}</p>
                        <Badge variant={entry.review_status === 'reviewed' ? 'success' : 'default'}>
                          {entry.source === 'nutrition_submissions' ? 'nutrition log' : entry.review_status || 'task log'}
                        </Badge>
                      </div>
                      {entry.notes && <p className="mt-2 text-sm text-gray-600">{entry.notes}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-right text-xs font-bold uppercase text-gray-600 md:grid-cols-4">
                      <span>{entry.calories === null ? '—' : `${entry.calories} kcal`}</span>
                      <span>{entry.protein_g === null ? '—' : `${entry.protein_g}g P`}</span>
                      <span>{entry.carbs_g === null ? '—' : `${entry.carbs_g}g C`}</span>
                      <span>{entry.fat_g === null ? '—' : `${entry.fat_g}g F`}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      {recentNotes.length > 0 && (
        <section>
          <SectionHeader title="COACHING NOTES FROM LOGS" accent />
          <Card>
            <div className="space-y-3">
              {recentNotes.map((entry) => (
                <div key={`note-${entry.source}-${entry.id}`} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <p className="text-xs font-bold uppercase text-gray-500">{formatDate(entry.entry_date || entry.submitted_at)}</p>
                  <p className="mt-1 text-sm text-gray-700">{entry.notes}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>
      )}

      <section>
        <SectionHeader title="FUTURE NUTRITION INTELLIGENCE" accent />
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <FutureNutritionCard
              title="Nutrition targets"
              description="Add client-specific calorie, protein, carb, and fat targets with adherence scoring."
            />
            <FutureNutritionCard
              title="Bodyweight overlay"
              description="Compare calorie consistency against bodyweight trends and training performance."
            />
            <FutureNutritionCard
              title="Meal pattern flags"
              description="Spot low-protein days, missed meals, weekend drift, and inconsistent logging."
            />
            <FutureNutritionCard
              title="Adjustment prompts"
              description="Suggest when to reduce calories, hold targets, increase food, or check adherence first."
            />
          </div>
        </Card>
      </section>
    </div>
  );
}
