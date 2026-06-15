'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type NutritionTrackingMode = 'simple' | 'calories_protein' | 'macros' | 'habits';

type ClientRecord = {
  id: string;
  full_name: string;
};

type ClientSettingsRecord = {
  nutrition_enabled: boolean;
  nutrition_tracking_mode: NutritionTrackingMode;
  bodyweight_enabled: boolean;
};

type AssignedTaskRecord = {
  id: string;
  task_type: string;
};

interface FormData {
  nutritionDate: string;
  calories: string;
  protein: string;
  carbs: string;
  fats: string;
  habitCompleted: boolean;
  nutritionAdherence: number;
  nutritionNotes: string;
  bodyweight: string;
  weightDate: string;
  bodyweightNotes: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const defaultSettings: ClientSettingsRecord = {
  nutrition_enabled: false,
  nutrition_tracking_mode: 'simple',
  bodyweight_enabled: true,
};

const buildInitialForm = (): FormData => ({
  nutritionDate: todayIso(),
  calories: '',
  protein: '',
  carbs: '',
  fats: '',
  habitCompleted: false,
  nutritionAdherence: 0,
  nutritionNotes: '',
  bodyweight: '',
  weightDate: todayIso(),
  bodyweightNotes: '',
});

const parseOptionalNumber = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const modeLabel: Record<NutritionTrackingMode, string> = {
  simple: 'Simple check-in',
  calories_protein: 'Calories + protein',
  macros: 'Full macros',
  habits: 'Habit / portion tracking',
};

const RatingButtons = ({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (val: number) => void;
  label: string;
}) => (
  <div className="mb-6">
    <label className="block text-sm font-semibold uppercase mb-3">{label}</label>
    <div className="flex gap-2 flex-wrap">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
        <button
          key={num}
          type="button"
          onClick={() => onChange(num)}
          className={`w-10 h-10 rounded font-bold uppercase text-sm transition-colors ${
            value === num
              ? 'bg-[#FA0201] text-white'
              : 'bg-white border-2 border-gray-300 text-black hover:border-[#FA0201]'
          }`}
        >
          {num}
        </button>
      ))}
    </div>
  </div>
);

export default function NutritionBodyweightPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [settings, setSettings] = useState<ClientSettingsRecord>(defaultSettings);
  const [tasks, setTasks] = useState<AssignedTaskRecord[]>([]);
  const [formData, setFormData] = useState<FormData>(buildInitialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadClientContext = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Client login is not ready.');
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('user_id', user.id)
        .single();

      if (clientError || !clientData) {
        setMessage('This login is not linked to a client profile.');
        setLoading(false);
        return;
      }

      const linkedClient = clientData as ClientRecord;
      setClient(linkedClient);

      const [settingsResult, taskResult] = await Promise.all([
        supabase
          .from('client_settings')
          .select('nutrition_enabled, nutrition_tracking_mode, bodyweight_enabled')
          .eq('client_id', linkedClient.id)
          .maybeSingle(),
        supabase
          .from('assigned_tasks')
          .select('id, task_type')
          .eq('client_id', linkedClient.id)
          .eq('active', true),
      ]);

      if (settingsResult.error) {
        setMessage(settingsResult.error.message);
        setLoading(false);
        return;
      }

      if (taskResult.error) {
        setMessage(taskResult.error.message);
        setLoading(false);
        return;
      }

      setSettings((settingsResult.data as ClientSettingsRecord | null) ?? defaultSettings);
      setTasks((taskResult.data ?? []) as AssignedTaskRecord[]);
      setLoading(false);
    };

    loadClientContext();
  }, [user]);

  const assignedTaskByType = useMemo(() => {
    return tasks.reduce<Record<string, string>>((lookup, task) => {
      lookup[task.task_type] = task.id;
      return lookup;
    }, {});
  }, [tasks]);

  const handleInputChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const saveTaskSubmission = async ({
    assignedTaskId,
    clientId,
    submissionType,
    answerValue,
    answerText,
    followupRequired,
  }: {
    assignedTaskId: string | null;
    clientId: string;
    submissionType: string;
    answerValue?: number | null;
    answerText: string;
    followupRequired: boolean;
  }) => {
    const supabase = createClient();

    // Task submissions power the coach review queue, while the specialised tables
    // store the structured metrics used by dashboards and future trend logic.
    return supabase.from('task_submissions').insert({
      client_id: clientId,
      assigned_task_id: assignedTaskId,
      submission_type: submissionType,
      answer_value: answerValue ?? null,
      answer_text: answerText,
      review_status: 'new',
      followup_required: followupRequired,
    });
  };

  const validateForm = () => {
    if (!settings.nutrition_enabled && !settings.bodyweight_enabled) {
      return 'Nutrition and bodyweight tracking are both switched off for this client.';
    }

    if (settings.nutrition_enabled && !formData.nutritionDate) {
      return 'Add the nutrition date.';
    }

    if (settings.nutrition_enabled && settings.nutrition_tracking_mode === 'habits' && formData.nutritionAdherence === 0) {
      return 'Add a nutrition adherence rating from 1 to 10.';
    }

    if (settings.bodyweight_enabled && !formData.bodyweight.trim()) {
      return 'Add your bodyweight.';
    }

    if (settings.bodyweight_enabled && !formData.weightDate) {
      return 'Add the date weighed.';
    }

    return null;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!client) {
      setMessage('No linked client profile found.');
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setMessage(validationError);
      return;
    }

    setSaving(true);
    setMessage(null);

    const supabase = createClient();

    if (settings.nutrition_enabled) {
      const calories = parseOptionalNumber(formData.calories);
      const protein = parseOptionalNumber(formData.protein);
      const carbs = parseOptionalNumber(formData.carbs);
      const fats = parseOptionalNumber(formData.fats);
      const nutritionNotes = formData.nutritionNotes.trim() || null;

      const { error: nutritionError } = await supabase.from('nutrition_submissions').insert({
        client_id: client.id,
        submission_date: formData.nutritionDate,
        tracking_mode: settings.nutrition_tracking_mode,
        calories: ['calories_protein', 'macros'].includes(settings.nutrition_tracking_mode) ? calories : null,
        protein_g: ['calories_protein', 'macros'].includes(settings.nutrition_tracking_mode) ? protein : null,
        carbs_g: settings.nutrition_tracking_mode === 'macros' ? carbs : null,
        fats_g: settings.nutrition_tracking_mode === 'macros' ? fats : null,
        habit_completed: settings.nutrition_tracking_mode === 'habits' ? formData.habitCompleted : null,
        notes: nutritionNotes,
        review_status: 'new',
      });

      if (nutritionError) {
        setMessage(nutritionError.message);
        setSaving(false);
        return;
      }

      const nutritionSummary = [
        `Mode: ${modeLabel[settings.nutrition_tracking_mode]}`,
        `Date: ${formData.nutritionDate}`,
        `Calories: ${calories ?? 'Not provided'}`,
        `Protein: ${protein ?? 'Not provided'}`,
        `Carbs: ${settings.nutrition_tracking_mode === 'macros' ? carbs ?? 'Not provided' : 'Not required'}`,
        `Fats: ${settings.nutrition_tracking_mode === 'macros' ? fats ?? 'Not provided' : 'Not required'}`,
        `Habit completed: ${settings.nutrition_tracking_mode === 'habits' ? (formData.habitCompleted ? 'Yes' : 'No') : 'Not required'}`,
        `Adherence: ${formData.nutritionAdherence || 'Not provided'}/10`,
        `Notes: ${nutritionNotes ?? 'Not provided'}`,
      ].join('\n');

      const { error: taskSubmissionError } = await saveTaskSubmission({
        assignedTaskId: assignedTaskByType.nutrition ?? null,
        clientId: client.id,
        submissionType: 'nutrition',
        answerValue: formData.nutritionAdherence || null,
        answerText: nutritionSummary,
        followupRequired: Boolean(nutritionNotes),
      });

      if (taskSubmissionError) {
        setMessage(taskSubmissionError.message);
        setSaving(false);
        return;
      }
    }

    if (settings.bodyweight_enabled) {
      const bodyweight = parseOptionalNumber(formData.bodyweight);

      if (bodyweight === null) {
        setMessage('Bodyweight must be a valid number.');
        setSaving(false);
        return;
      }

      const bodyweightNotes = formData.bodyweightNotes.trim() || null;

      const { error: bodyweightError } = await supabase.from('bodyweight_entries').insert({
        client_id: client.id,
        entry_date: formData.weightDate,
        bodyweight_kg: bodyweight,
        notes: bodyweightNotes,
      });

      if (bodyweightError) {
        setMessage(bodyweightError.message);
        setSaving(false);
        return;
      }

      const { error: taskSubmissionError } = await saveTaskSubmission({
        assignedTaskId: assignedTaskByType.bodyweight ?? null,
        clientId: client.id,
        submissionType: 'bodyweight',
        answerValue: bodyweight,
        answerText: [`Bodyweight: ${bodyweight}kg`, `Date: ${formData.weightDate}`, `Notes: ${bodyweightNotes ?? 'Not provided'}`].join('\n'),
        followupRequired: false,
      });

      if (taskSubmissionError) {
        setMessage(taskSubmissionError.message);
        setSaving(false);
        return;
      }
    }

    setMessage('Nutrition and bodyweight submitted successfully. Returning to your hub...');
    setSaving(false);
    setFormData(buildInitialForm());
    setTimeout(() => router.push('/client'), 1200);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <PageHeader title="NUTRITION & BODYWEIGHT" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
            <Card><p className="font-semibold text-gray-700">Loading nutrition and bodyweight form...</p></Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader title="NUTRITION & BODYWEIGHT" subtitle={client ? `For ${client.full_name}` : undefined} />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
          {message && (
            <Card className="mb-6 p-4">
              <p className="text-gray-800 font-semibold text-sm">{message}</p>
            </Card>
          )}

          {!settings.nutrition_enabled && !settings.bodyweight_enabled ? (
            <Card>
              <p className="text-lg font-black uppercase text-[#000000]">No tracking required</p>
              <p className="mt-2 text-sm text-gray-600">
                Nutrition and bodyweight tracking are both switched off for this client. Your coach can turn them on in client settings if needed.
              </p>
            </Card>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-8">
              {settings.nutrition_enabled && (
                <section>
                  <SectionHeader title="NUTRITION" />
                  <Card className="space-y-6">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-bold uppercase text-gray-500">Tracking mode</p>
                      <p className="mt-1 text-sm font-bold text-[#000000]">{modeLabel[settings.nutrition_tracking_mode]}</p>
                    </div>

                    <Input
                      type="date"
                      label="DATE"
                      name="nutritionDate"
                      value={formData.nutritionDate}
                      onChange={handleInputChange}
                      required
                    />

                    {settings.nutrition_tracking_mode === 'simple' && (
                      <Textarea
                        label="NUTRITION NOTES"
                        name="nutritionNotes"
                        placeholder="What should your coach know about your nutrition today?"
                        value={formData.nutritionNotes}
                        onChange={handleInputChange}
                      />
                    )}

                    {['calories_protein', 'macros'].includes(settings.nutrition_tracking_mode) && (
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          type="number"
                          label="CALORIES"
                          name="calories"
                          placeholder="Kcal"
                          value={formData.calories}
                          onChange={handleInputChange}
                          step="10"
                        />
                        <Input
                          type="number"
                          label="PROTEIN (G)"
                          name="protein"
                          placeholder="grams"
                          value={formData.protein}
                          onChange={handleInputChange}
                          step="1"
                        />
                      </div>
                    )}

                    {settings.nutrition_tracking_mode === 'macros' && (
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          type="number"
                          label="CARBS (G)"
                          name="carbs"
                          placeholder="grams"
                          value={formData.carbs}
                          onChange={handleInputChange}
                          step="1"
                        />
                        <Input
                          type="number"
                          label="FATS (G)"
                          name="fats"
                          placeholder="grams"
                          value={formData.fats}
                          onChange={handleInputChange}
                          step="1"
                        />
                      </div>
                    )}

                    {settings.nutrition_tracking_mode === 'habits' && (
                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <p className="text-sm font-bold uppercase text-[#000000]">Habit completed?</p>
                        <p className="mt-1 text-sm text-gray-600">Tick this if you completed the nutrition habit agreed with your coach.</p>
                        <button
                          type="button"
                          onClick={() => setFormData((current) => ({ ...current, habitCompleted: !current.habitCompleted }))}
                          className={`mt-4 rounded-full px-4 py-2 text-xs font-black uppercase ${
                            formData.habitCompleted ? 'bg-[#FA0201] text-white' : 'bg-gray-200 text-[#000000]'
                          }`}
                        >
                          {formData.habitCompleted ? 'Completed' : 'Not completed'}
                        </button>
                      </div>
                    )}

                    {settings.nutrition_tracking_mode !== 'simple' && (
                      <Textarea
                        label="NUTRITION NOTES"
                        name="nutritionNotes"
                        placeholder="Any useful context for your coach?"
                        value={formData.nutritionNotes}
                        onChange={handleInputChange}
                      />
                    )}

                    <RatingButtons
                      value={formData.nutritionAdherence}
                      onChange={(value) => setFormData((current) => ({ ...current, nutritionAdherence: value }))}
                      label="Nutrition Adherence"
                    />
                  </Card>
                </section>
              )}

              {settings.bodyweight_enabled && (
                <section>
                  <SectionHeader title="BODYWEIGHT" />
                  <Card className="space-y-6">
                    <Input
                      type="number"
                      label="WEIGHT (KG)"
                      name="bodyweight"
                      placeholder="Weight in kg"
                      value={formData.bodyweight}
                      onChange={handleInputChange}
                      step="0.1"
                      required
                    />

                    <Input
                      type="date"
                      label="DATE WEIGHED"
                      name="weightDate"
                      value={formData.weightDate}
                      onChange={handleInputChange}
                      required
                    />

                    <Textarea
                      label="BODYWEIGHT NOTES"
                      name="bodyweightNotes"
                      placeholder="Any observations about your bodyweight?"
                      value={formData.bodyweightNotes}
                      onChange={handleInputChange}
                    />
                  </Card>
                </section>
              )}

              <div className="pb-8">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  fullWidth
                  disabled={saving || !client}
                  className="bg-[#FA0201] hover:bg-red-700"
                >
                  {saving ? 'SAVING...' : 'SUBMIT'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
