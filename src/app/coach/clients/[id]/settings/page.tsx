'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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

type NutritionTrackingMode = 'simple' | 'calories_protein' | 'macros' | 'habits';

type ClientSettingsRecord = {
  client_id: string;
  nutrition_enabled: boolean;
  nutrition_tracking_mode: NutritionTrackingMode;
  show_calorie_target: boolean;
  show_protein_target: boolean;
  show_macro_targets: boolean;
  bodyweight_enabled: boolean;
  progress_photos_enabled: boolean;
  workout_rpe_enabled: boolean;
  client_feedback_enabled: boolean;
  training_availability_enabled: boolean;
  show_key_lift_card: boolean;
  show_bodyweight_card: boolean;
  show_calorie_guideline_card: boolean;
  show_today_actions_card: boolean;
  show_upcoming_actions_card: boolean;
  show_latest_feedback_card: boolean;
};

const defaultSettings = (clientId: string): ClientSettingsRecord => ({
  client_id: clientId,
  nutrition_enabled: false,
  nutrition_tracking_mode: 'simple',
  show_calorie_target: false,
  show_protein_target: true,
  show_macro_targets: false,
  bodyweight_enabled: true,
  progress_photos_enabled: false,
  workout_rpe_enabled: true,
  client_feedback_enabled: true,
  training_availability_enabled: true,
  show_key_lift_card: true,
  show_bodyweight_card: true,
  show_calorie_guideline_card: false,
  show_today_actions_card: true,
  show_upcoming_actions_card: true,
  show_latest_feedback_card: true,
});

const ToggleRow = ({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
    <div>
      <p className="text-sm font-bold uppercase text-[#000000]">{title}</p>
      <p className="mt-1 text-sm text-gray-600">{description}</p>
    </div>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-fit rounded-full px-4 py-2 text-xs font-black uppercase ${
        checked ? 'bg-[#FA0201] text-white' : 'bg-gray-200 text-[#000000]'
      }`}
    >
      {checked ? 'On' : 'Off'}
    </button>
  </div>
);

export default function ClientSettingsPage() {
  const params = useParams();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [settings, setSettings] = useState<ClientSettingsRecord>(defaultSettings(clientId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSettings = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      const supabase = createClient();

      const [clientResult, settingsResult] = await Promise.all([
        supabase
          .from('clients')
          .select('id, full_name, email, current_focus')
          .eq('id', clientId)
          .single(),
        supabase
          .from('client_settings')
          .select('client_id, nutrition_enabled, nutrition_tracking_mode, show_calorie_target, show_protein_target, show_macro_targets, bodyweight_enabled, progress_photos_enabled, workout_rpe_enabled, client_feedback_enabled, training_availability_enabled, show_key_lift_card, show_bodyweight_card, show_calorie_guideline_card, show_today_actions_card, show_upcoming_actions_card, show_latest_feedback_card')
          .eq('client_id', clientId)
          .maybeSingle(),
      ]);

      if (clientResult.error || !clientResult.data) {
        setError(clientResult.error?.message || 'Client not found.');
        setLoading(false);
        return;
      }

      if (settingsResult.error) {
        setError(settingsResult.error.message);
        setLoading(false);
        return;
      }

      const fallbackSettings = defaultSettings(clientId);
      setClient(clientResult.data as ClientRecord);
      setSettings({
        ...fallbackSettings,
        ...((settingsResult.data as Partial<ClientSettingsRecord> | null) ?? {}),
      });
      setLoading(false);
    };

    loadSettings();
  }, [clientId]);

  const updateSetting = <K extends keyof ClientSettingsRecord>(key: K, value: ClientSettingsRecord[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setMessage(null);
  };

  const handleSave = async () => {
    if (!isSupabaseConfigured) return;

    setSaving(true);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { error: saveError } = await supabase.from('client_settings').upsert(
      {
        client_id: clientId,
        nutrition_enabled: settings.nutrition_enabled,
        nutrition_tracking_mode: settings.nutrition_tracking_mode,
        show_calorie_target: settings.show_calorie_target,
        show_protein_target: settings.show_protein_target,
        show_macro_targets: settings.show_macro_targets,
        bodyweight_enabled: settings.bodyweight_enabled,
        progress_photos_enabled: settings.progress_photos_enabled,
        workout_rpe_enabled: settings.workout_rpe_enabled,
        client_feedback_enabled: settings.client_feedback_enabled,
        training_availability_enabled: settings.training_availability_enabled,
        show_key_lift_card: settings.show_key_lift_card,
        show_bodyweight_card: settings.show_bodyweight_card,
        show_calorie_guideline_card: settings.show_calorie_guideline_card,
        show_today_actions_card: settings.show_today_actions_card,
        show_upcoming_actions_card: settings.show_upcoming_actions_card,
        show_latest_feedback_card: settings.show_latest_feedback_card,
      },
      { onConflict: 'client_id' }
    );

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setMessage('Client settings saved.');
    setSaving(false);
  };

  if (loading) {
    return <div className="p-6 md:p-8"><Card>Loading client settings...</Card></div>;
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
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Client Settings</h1>
          <p className="mt-1 text-sm text-gray-700">{client.full_name}{client.email ? ` • ${client.email}` : ''}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-gray-500">Control what this client tracks and what appears on their Hub.</p>
        </div>
        <Link href={`/coach/clients/${clientId}`} className="text-sm font-bold uppercase text-[#FA0201] hover:underline">
          Back to client
        </Link>
      </div>

      <section>
        <SectionHeader title="NUTRITION SETTINGS" accent />
        <Card>
          <div className="space-y-4">
            <ToggleRow
              title="Nutrition tracking"
              description="Turn nutrition logging on or off for this client. When off, the nutrition dashboard shows a setup prompt instead of tracking data."
              checked={settings.nutrition_enabled}
              onChange={(checked) => updateSetting('nutrition_enabled', checked)}
            />

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <label className="block text-sm font-bold uppercase text-[#000000]">Tracking mode</label>
              <p className="mt-1 text-sm text-gray-600">Choose the lowest-friction method that still gives useful coaching signal.</p>
              <select
                value={settings.nutrition_tracking_mode}
                onChange={(event) => updateSetting('nutrition_tracking_mode', event.target.value as NutritionTrackingMode)}
                className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
              >
                <option value="simple">Simple check-in</option>
                <option value="calories_protein">Calories + protein</option>
                <option value="macros">Full macros</option>
                <option value="habits">Habit / portion tracking</option>
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <ToggleRow
                title="Show calorie target"
                description="Useful for calorie-aware clients. Keep off for low-friction clients."
                checked={settings.show_calorie_target}
                onChange={(checked) => updateSetting('show_calorie_target', checked)}
              />
              <ToggleRow
                title="Show protein target"
                description="Usually worth keeping on because protein is central to strength and physique outcomes."
                checked={settings.show_protein_target}
                onChange={(checked) => updateSetting('show_protein_target', checked)}
              />
              <ToggleRow
                title="Show macro targets"
                description="Only use for clients who track full macros already."
                checked={settings.show_macro_targets}
                onChange={(checked) => updateSetting('show_macro_targets', checked)}
              />
            </div>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="CLIENT HUB CARDS" accent />
        <Card>
          <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-bold uppercase text-[#000000]">Dashboard visibility</p>
            <p className="mt-1 text-sm text-gray-600">
              These toggles control motivation and guidance cards on the client Hub. They do not force the client to submit extra data.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ToggleRow
              title="Key lift progress card"
              description="Shows 1-week and 4-week strength trend when key lift data exists. Useful for strength-focused clients."
              checked={settings.show_key_lift_card}
              onChange={(checked) => updateSetting('show_key_lift_card', checked)}
            />
            <ToggleRow
              title="Bodyweight progress card"
              description="Shows 1-week and 4-week bodyweight trend when weigh-ins exist. Useful for fat loss, gaining, or maintenance goals."
              checked={settings.show_bodyweight_card}
              onChange={(checked) => updateSetting('show_bodyweight_card', checked)}
            />
            <ToggleRow
              title="Calorie guideline card"
              description="Shows a simple calorie-direction prompt based on bodyweight trend. Keep this off for clients who should not focus on calories."
              checked={settings.show_calorie_guideline_card}
              onChange={(checked) => updateSetting('show_calorie_guideline_card', checked)}
            />
            <ToggleRow
              title="Today actions card"
              description="Shows what the client should do today, such as scheduled workouts or active tasks."
              checked={settings.show_today_actions_card}
              onChange={(checked) => updateSetting('show_today_actions_card', checked)}
            />
            <ToggleRow
              title="Upcoming actions card"
              description="Shows tomorrow and upcoming tasks so the client knows what is coming next."
              checked={settings.show_upcoming_actions_card}
              onChange={(checked) => updateSetting('show_upcoming_actions_card', checked)}
            />
            <ToggleRow
              title="Latest feedback card"
              description="Shows the latest visible coach feedback on the client Hub."
              checked={settings.show_latest_feedback_card}
              onChange={(checked) => updateSetting('show_latest_feedback_card', checked)}
            />
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="OTHER CLIENT SETTINGS" accent />
        <Card>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ToggleRow
              title="Bodyweight tracking"
              description="Controls whether bodyweight is expected as a regular tracking signal."
              checked={settings.bodyweight_enabled}
              onChange={(checked) => updateSetting('bodyweight_enabled', checked)}
            />
            <ToggleRow
              title="Progress photos"
              description="Placeholder setting for future progress photo workflows."
              checked={settings.progress_photos_enabled}
              onChange={(checked) => updateSetting('progress_photos_enabled', checked)}
            />
            <ToggleRow
              title="Workout RPE"
              description="Controls whether RPE should remain part of workout logging."
              checked={settings.workout_rpe_enabled}
              onChange={(checked) => updateSetting('workout_rpe_enabled', checked)}
            />
            <ToggleRow
              title="Client feedback visibility"
              description="Controls whether client-facing feedback should be shown in the client portal."
              checked={settings.client_feedback_enabled}
              onChange={(checked) => updateSetting('client_feedback_enabled', checked)}
            />
            <ToggleRow
              title="Training availability"
              description="Controls whether availability collection should be part of this client's workflow."
              checked={settings.training_availability_enabled}
              onChange={(checked) => updateSetting('training_availability_enabled', checked)}
            />
          </div>
        </Card>
      </section>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
        {message && <p className="text-sm font-semibold text-green-700">{message}</p>}
        {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-[#FA0201] px-5 py-3 text-sm font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
