'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { ClientMetricChartDashboard } from '@/components/coach/client-metric-chart-dashboard';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ClientRecord = {
  id: string;
  full_name: string;
  tdee_gender: string | null;
  date_of_birth: string | null;
  height_cm: number | null;
};

type LatestBodyweight = {
  bodyweight_kg: number;
  entry_date: string;
};

type HubSettings = {
  calorie_target: string;
  calorie_adjustment: string;
  protein_target_g: string;
  protein_multiplier: string;
  carb_target_g: string;
  fat_target_g: string;
  show_bodyweight_card: boolean;
  show_submit_bodyweight: boolean;
  show_next_workout_card: boolean;
  show_coaching_status_card: boolean;
  show_progress_cards: boolean;
  target_notes: string;
};

const defaults: HubSettings = {
  calorie_target: '',
  calorie_adjustment: '-500',
  protein_target_g: '',
  protein_multiplier: '1.8',
  carb_target_g: '',
  fat_target_g: '',
  show_bodyweight_card: true,
  show_submit_bodyweight: true,
  show_next_workout_card: true,
  show_coaching_status_card: true,
  show_progress_cards: true,
  target_notes: '',
};

const numberOrNull = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const decimalOrNull = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundToTen = (value: number) => Math.round(value / 10) * 10;

const ageFromDob = (dob: string) => {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDelta = today.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) age -= 1;
  return age;
};

const activityMultiplierForWorkouts = (workoutsPast7Days: number) => {
  if (workoutsPast7Days <= 0) return 1.2;
  if (workoutsPast7Days === 1) return 1.3;
  if (workoutsPast7Days === 2) return 1.4;
  if (workoutsPast7Days === 3) return 1.5;
  if (workoutsPast7Days === 4) return 1.6;
  if (workoutsPast7Days === 5) return 1.7;
  return 1.8;
};

const calculateBmr = ({ client, latestBodyweight }: { client: ClientRecord | null; latestBodyweight: LatestBodyweight | null }) => {
  if (!client?.tdee_gender || !client.date_of_birth || !client.height_cm || !latestBodyweight) return null;

  const age = ageFromDob(client.date_of_birth);
  const bodyweightKg = Number(latestBodyweight.bodyweight_kg);
  const heightCm = Number(client.height_cm);
  const sexOffset = client.tdee_gender === 'standard_minus' ? -161 : 5;

  return roundToTen((10 * bodyweightKg) + (6.25 * heightCm) - (5 * age) + sexOffset);
};

const EstimateTile = ({ label, value, helper }: { label: string; value: string; helper: string }) => (
  <div className="rounded-xl bg-gray-100 p-4">
    <p className="text-[10px] font-bold uppercase text-gray-500">{label}</p>
    <p className="mt-2 text-2xl font-black text-[#000000]">{value}</p>
    <p className="mt-1 text-xs font-semibold text-gray-600">{helper}</p>
  </div>
);

const TargetInput = ({ label, value, placeholder, helper, onChange }: { label: string; value: string; placeholder: string; helper: string; onChange: (value: string) => void }) => (
  <label className="block rounded-xl border border-gray-200 bg-white p-4">
    <span className="block text-sm font-black uppercase text-[#000000]">{label}</span>
    <input
      type="number"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="mt-3 w-full rounded-lg border-2 border-gray-300 px-3 py-3 text-sm font-bold text-black"
    />
    <span className="mt-2 block text-xs font-semibold text-gray-600">{helper}</span>
  </label>
);

export default function CoachClientHubSettingsPage() {
  const params = useParams();
  const clientId = params.id as string;
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [latestBodyweight, setLatestBodyweight] = useState<LatestBodyweight | null>(null);
  const [workoutsPast7Days, setWorkoutsPast7Days] = useState(0);
  const [settings, setSettings] = useState<HubSettings>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const [clientResult, settingsResult, bodyweightResult, workoutResult] = await Promise.all([
        supabase.from('clients').select('id, full_name, tdee_gender, date_of_birth, height_cm').eq('id', clientId).single(),
        supabase.from('client_hub_settings').select('*').eq('client_id', clientId).maybeSingle(),
        supabase.from('bodyweight_entries').select('bodyweight_kg, entry_date').eq('client_id', clientId).order('entry_date', { ascending: false }).limit(1),
        supabase.from('workout_sessions').select('id').eq('client_id', clientId).eq('status', 'completed').gte('completed_at', sevenDaysAgo.toISOString()),
      ]);

      if (clientResult.error || !clientResult.data) {
        setError(clientResult.error?.message || 'Client not found.');
        setLoading(false);
        return;
      }

      if (settingsResult.error || bodyweightResult.error || workoutResult.error) {
        setError(settingsResult.error?.message || bodyweightResult.error?.message || workoutResult.error?.message || 'Could not load hub settings.');
        setLoading(false);
        return;
      }

      setClient(clientResult.data as ClientRecord);
      setLatestBodyweight(((bodyweightResult.data ?? []) as LatestBodyweight[])[0] ?? null);
      setWorkoutsPast7Days((workoutResult.data ?? []).length);

      const row = settingsResult.data as any;
      if (row) {
        setSettings({
          calorie_target: row.calorie_target?.toString() || '',
          calorie_adjustment: row.calorie_adjustment?.toString() || '-500',
          protein_target_g: row.protein_target_g?.toString() || '',
          protein_multiplier: row.protein_multiplier?.toString() || '1.8',
          carb_target_g: row.carb_target_g?.toString() || '',
          fat_target_g: row.fat_target_g?.toString() || '',
          show_bodyweight_card: Boolean(row.show_bodyweight_card),
          show_submit_bodyweight: Boolean(row.show_submit_bodyweight),
          show_next_workout_card: Boolean(row.show_next_workout_card),
          show_coaching_status_card: Boolean(row.show_coaching_status_card),
          show_progress_cards: Boolean(row.show_progress_cards),
          target_notes: row.target_notes || '',
        });
      }
      setLoading(false);
    };

    load();
  }, [clientId]);

  const bmr = useMemo(() => calculateBmr({ client, latestBodyweight }), [client, latestBodyweight]);
  const activityMultiplier = useMemo(() => activityMultiplierForWorkouts(workoutsPast7Days), [workoutsPast7Days]);
  const estimatedTdee = bmr !== null ? roundToTen(bmr * activityMultiplier) : null;
  const calorieAdjustment = numberOrNull(settings.calorie_adjustment) ?? -500;
  const calculatedCalorieTarget = estimatedTdee !== null ? roundToTen(estimatedTdee + calorieAdjustment) : null;
  const proteinMultiplier = decimalOrNull(settings.protein_multiplier) ?? 1.8;
  const calculatedProteinTarget = latestBodyweight ? Math.round(Number(latestBodyweight.bodyweight_kg) * proteinMultiplier) : null;

  const patch = <K extends keyof HubSettings>(key: K, value: HubSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  const applyCalculatedTargets = () => {
    setSettings((current) => ({
      ...current,
      calorie_target: calculatedCalorieTarget !== null ? calculatedCalorieTarget.toString() : current.calorie_target,
      protein_target_g: calculatedProteinTarget !== null ? calculatedProteinTarget.toString() : current.protein_target_g,
    }));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isSupabaseConfigured) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const resolvedCalorieTarget = numberOrNull(settings.calorie_target) ?? calculatedCalorieTarget;
    const resolvedProteinTarget = numberOrNull(settings.protein_target_g) ?? calculatedProteinTarget;
    const resolvedCarbTarget = numberOrNull(settings.carb_target_g);
    const resolvedFatTarget = numberOrNull(settings.fat_target_g);

    const supabase = createClient();
    const { error: saveError } = await supabase.from('client_hub_settings').upsert({
      client_id: clientId,
      show_calorie_target: resolvedCalorieTarget !== null,
      calorie_target: resolvedCalorieTarget,
      calorie_adjustment: calorieAdjustment,
      estimated_bmr: bmr,
      estimated_tdee: estimatedTdee,
      activity_multiplier: activityMultiplier,
      workouts_past_7_days: workoutsPast7Days,
      show_protein_target: resolvedProteinTarget !== null,
      protein_target_g: resolvedProteinTarget,
      protein_multiplier: proteinMultiplier,
      show_carb_target: resolvedCarbTarget !== null,
      carb_target_g: resolvedCarbTarget,
      show_fat_target: resolvedFatTarget !== null,
      fat_target_g: resolvedFatTarget,
      show_bodyweight_card: settings.show_bodyweight_card,
      show_submit_bodyweight: settings.show_submit_bodyweight,
      show_next_workout_card: settings.show_next_workout_card,
      show_coaching_status_card: settings.show_coaching_status_card,
      show_progress_cards: true,
      target_notes: settings.target_notes.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' });

    if (saveError) setError(saveError.message);
    else {
      setSettings((current) => ({
        ...current,
        calorie_target: resolvedCalorieTarget?.toString() || '',
        protein_target_g: resolvedProteinTarget?.toString() || '',
        carb_target_g: resolvedCarbTarget?.toString() || '',
        fat_target_g: resolvedFatTarget?.toString() || '',
        show_progress_cards: true,
      }));
      setMessage('Client hub targets saved.');
    }
    setSaving(false);
  };

  if (loading) return <div className="p-6 md:p-8"><Card><p className="font-semibold text-gray-700">Loading hub settings...</p></Card></div>;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Client hub settings</p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-[#000000]">{client?.full_name || 'Client'}</h1>
          <p className="mt-2 text-sm text-gray-600">Set client targets and choose the progress graphs shown on their hub.</p>
        </div>
        <Link href={`/coach/clients/${clientId}`} className="w-fit rounded-lg border border-gray-300 bg-white px-4 py-3 text-xs font-black uppercase text-[#000000] hover:bg-gray-100">Back to client</Link>
      </div>

      {error && <Card className="mb-6 border-2 border-red-200 bg-red-50"><p className="text-sm font-bold text-red-700">{error}</p></Card>}
      {message && <Card className="mb-6 border-2 border-green-200 bg-green-50"><p className="text-sm font-bold text-green-800">{message}</p></Card>}

      <form onSubmit={save} className="space-y-8">
        <section>
          <SectionHeader title="TARGETS" accent />
          <Card className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <EstimateTile label="Latest bodyweight" value={latestBodyweight ? `${latestBodyweight.bodyweight_kg}kg` : 'Missing'} helper={latestBodyweight ? `Logged ${latestBodyweight.entry_date}` : 'Submit bodyweight first'} />
              <EstimateTile label="Estimated BMR" value={bmr !== null ? `${bmr} kcal` : 'Missing'} helper="Mifflin-St Jeor" />
              <EstimateTile label="Workouts past 7 days" value={workoutsPast7Days.toString()} helper={`Multiplier ${activityMultiplier.toFixed(2)}`} />
              <EstimateTile label="Estimated TDEE" value={estimatedTdee !== null ? `${estimatedTdee} kcal` : 'Missing'} helper="BMR × multiplier" />
            </div>

            {bmr === null && (
              <div className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-4">
                <p className="text-sm font-bold text-[#000000]">Calculator needs sex, date of birth, height, and at least one bodyweight entry.</p>
                <p className="mt-1 text-xs font-semibold text-gray-600">You can still enter manual targets below.</p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase text-[#000000]">Calorie adjustment</p>
                    <p className="mt-1 text-xs font-semibold text-gray-600">Calorie target = TDEE plus or minus this amount.</p>
                  </div>
                  <input type="number" value={settings.calorie_adjustment} onChange={(event) => patch('calorie_adjustment', event.target.value)} className="w-32 rounded-lg border-2 border-gray-300 px-3 py-2 text-sm font-bold text-black" />
                </div>
                <input type="range" min="-750" max="500" step="50" value={calorieAdjustment} onChange={(event) => patch('calorie_adjustment', event.target.value)} className="mt-5 w-full accent-[#FA0201]" />
                <p className="mt-3 text-lg font-black text-[#000000]">Calculated: {calculatedCalorieTarget !== null ? `${calculatedCalorieTarget} kcal` : 'missing inputs'}</p>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase text-[#000000]">Protein multiplier</p>
                    <p className="mt-1 text-xs font-semibold text-gray-600">Protein target = bodyweight × multiplier.</p>
                  </div>
                  <p className="text-lg font-black text-[#000000]">{proteinMultiplier.toFixed(1)}g/kg</p>
                </div>
                <input type="range" min="1.6" max="2" step="0.1" value={proteinMultiplier} onChange={(event) => patch('protein_multiplier', event.target.value)} className="mt-5 w-full accent-[#FA0201]" />
                <p className="mt-3 text-lg font-black text-[#000000]">Calculated: {calculatedProteinTarget !== null ? `${calculatedProteinTarget}g` : 'missing bodyweight'}</p>
              </div>
            </div>

            <button type="button" onClick={applyCalculatedTargets} className="rounded-lg bg-black px-5 py-3 text-xs font-black uppercase text-white hover:bg-gray-900">
              Use calculated calorie and protein targets
            </button>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TargetInput label="Calorie target" value={settings.calorie_target} placeholder={calculatedCalorieTarget?.toString() || '2020'} helper="Leave blank to use the calculated calorie target when available." onChange={(value) => patch('calorie_target', value)} />
              <TargetInput label="Protein target" value={settings.protein_target_g} placeholder={calculatedProteinTarget?.toString() || '156'} helper="Leave blank to use the calculated protein target when available." onChange={(value) => patch('protein_target_g', value)} />
              <TargetInput label="Carbohydrate target" value={settings.carb_target_g} placeholder="200" helper="Optional. Leave blank to hide carbs from the client hub." onChange={(value) => patch('carb_target_g', value)} />
              <TargetInput label="Fat target" value={settings.fat_target_g} placeholder="55" helper="Optional. Leave blank to hide fats from the client hub." onChange={(value) => patch('fat_target_g', value)} />
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-black uppercase text-[#000000]">Target notes</span>
              <textarea value={settings.target_notes} onChange={(event) => patch('target_notes', event.target.value)} rows={3} className="w-full rounded-lg border-2 border-gray-300 px-4 py-3 text-sm text-black" placeholder="Optional note shown under targets." />
            </label>
          </Card>
        </section>

        <button type="submit" disabled={saving} className="w-full rounded-lg bg-[#FA0201] px-5 py-4 text-sm font-black uppercase text-white hover:bg-red-700 disabled:opacity-60 md:w-fit">
          {saving ? 'Saving...' : 'Save targets'}
        </button>
      </form>

      <section className="mt-8">
        <SectionHeader title="CLIENT PROGRESS GRAPHS" accent />
        <Card>
          <ClientMetricChartDashboard clientId={clientId} />
        </Card>
      </section>
    </div>
  );
}
