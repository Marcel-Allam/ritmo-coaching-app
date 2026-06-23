'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = {
  id: string;
  full_name: string;
};

type HubSettingsRecord = {
  show_submit_bodyweight: boolean;
};

interface FormData {
  bodyweight: string;
  weightDate: string;
  bodyweightNotes: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const buildInitialForm = (): FormData => ({
  bodyweight: '',
  weightDate: todayIso(),
  bodyweightNotes: '',
});

const parseRequiredNumber = (value: string) => {
  const parsedValue = Number(value.trim());
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

export default function SubmitBodyweightPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [settings, setSettings] = useState<HubSettingsRecord>({ show_submit_bodyweight: true });
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

      const { data: settingsData, error: settingsError } = await supabase
        .from('client_hub_settings')
        .select('show_submit_bodyweight')
        .eq('client_id', linkedClient.id)
        .maybeSingle();

      if (settingsError) {
        setMessage(settingsError.message);
        setLoading(false);
        return;
      }

      setSettings((settingsData as HubSettingsRecord | null) ?? { show_submit_bodyweight: true });
      setLoading(false);
    };

    loadClientContext();
  }, [user]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!client) {
      setMessage('No linked client profile found.');
      return;
    }

    if (!settings.show_submit_bodyweight) {
      setMessage('Bodyweight submissions are switched off for this client.');
      return;
    }

    const bodyweight = parseRequiredNumber(formData.bodyweight);
    if (bodyweight === null) {
      setMessage('Bodyweight must be a valid number.');
      return;
    }

    if (!formData.weightDate) {
      setMessage('Add the date weighed.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const supabase = createClient();
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

    setMessage('Bodyweight saved. Returning to your hub...');
    setSaving(false);
    setFormData(buildInitialForm());
    setTimeout(() => router.push('/client'), 900);
  };

  if (loading) {
    return (
      <div className="flex h-screen flex-col overflow-hidden">
        <PageHeader title="SUBMIT BODYWEIGHT" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
            <Card><p className="text-sm font-semibold text-gray-700">Loading bodyweight form...</p></Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <PageHeader title="SUBMIT BODYWEIGHT" subtitle={client ? `For ${client.full_name}` : undefined} />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
          {message && (
            <Card className="mb-6 p-4">
              <p className="text-sm font-semibold text-gray-800">{message}</p>
            </Card>
          )}

          {!settings.show_submit_bodyweight ? (
            <Card>
              <p className="text-lg font-black uppercase text-[#000000]">Bodyweight submissions are off</p>
              <p className="mt-2 text-sm text-gray-600">Your coach has switched this off for now.</p>
            </Card>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card className="space-y-6">
                <Input
                  type="number"
                  step="0.1"
                  label="BODYWEIGHT (KG)"
                  name="bodyweight"
                  placeholder="80.0"
                  value={formData.bodyweight}
                  onChange={handleInputChange}
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
                  label="NOTES"
                  name="bodyweightNotes"
                  placeholder="Optional: anything that might explain today's weight, e.g. poor sleep, higher salt, travel."
                  value={formData.bodyweightNotes}
                  onChange={handleInputChange}
                />
              </Card>

              <Button type="submit" disabled={saving} className="w-full bg-[#FA0201] hover:bg-red-700 disabled:opacity-60">
                {saving ? 'Saving...' : 'Save bodyweight'}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
