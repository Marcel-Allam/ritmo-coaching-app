'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
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

type KeyLiftForm = {
  liftName: string;
  weightKg: string;
  reps: string;
  rpe: string;
  rir: string;
  videoUrl: string;
  notes: string;
};

const buildInitialForm = (): KeyLiftForm => ({
  liftName: '',
  weightKg: '',
  reps: '',
  rpe: '',
  rir: '',
  videoUrl: '',
  notes: '',
});

const parseOptionalNumber = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsedValue = Number(trimmedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const parseOptionalInteger = (value: string) => {
  const parsedValue = parseOptionalNumber(value);
  if (parsedValue === null) return null;
  return Number.isInteger(parsedValue) ? parsedValue : null;
};

const estimateOneRepMax = (weightKg: number | null, reps: number | null) => {
  if (weightKg === null || reps === null || reps < 1) return null;

  // Epley estimate. This is not used as a prescription; it is a simple trend
  // signal for the coach to compare top sets over time.
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
};

export default function KeyLiftSubmissionPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [formData, setFormData] = useState<KeyLiftForm>(buildInitialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const loadLinkedClient = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Client login is not ready.');
        setLoading(false);
        return;
      }

      const supabase = createClient();

      // Client submissions must always use the client record linked to the
      // authenticated user. This prevents the client from manually submitting
      // data against another client profile.
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        setMessage('This login is not linked to a client profile.');
        setLoading(false);
        return;
      }

      setClient(data as ClientRecord);
      setLoading(false);
    };

    loadLinkedClient();
  }, [user]);

  const estimatedOneRepMax = useMemo(() => {
    return estimateOneRepMax(
      parseOptionalNumber(formData.weightKg),
      parseOptionalInteger(formData.reps)
    );
  }, [formData.weightKg, formData.reps]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;

    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const validateForm = () => {
    const weightKg = parseOptionalNumber(formData.weightKg);
    const reps = parseOptionalInteger(formData.reps);
    const rpe = parseOptionalNumber(formData.rpe);
    const rir = parseOptionalNumber(formData.rir);

    if (!formData.liftName.trim()) {
      return 'Add the lift name.';
    }

    if (weightKg === null || weightKg <= 0) {
      return 'Add a valid weight in kg.';
    }

    if (reps === null || reps <= 0) {
      return 'Add a valid whole-number rep count.';
    }

    if (rpe !== null && (rpe < 1 || rpe > 10)) {
      return 'RPE must be between 1 and 10.';
    }

    if (rir !== null && (rir < 0 || rir > 10)) {
      return 'RIR must be between 0 and 10.';
    }

    return null;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!client) {
      setMessage('No linked client profile found.');
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setMessage(validationError);
      setIsSuccess(false);
      return;
    }

    setSaving(true);
    setMessage(null);
    setIsSuccess(false);

    const supabase = createClient();
    const weightKg = parseOptionalNumber(formData.weightKg);
    const reps = parseOptionalInteger(formData.reps);
    const rpe = parseOptionalNumber(formData.rpe);
    const rir = parseOptionalNumber(formData.rir);
    const videoUrl = formData.videoUrl.trim();
    const notes = formData.notes.trim();
    const e1rm = estimateOneRepMax(weightKg, reps);

    // Attach this submission to the newest active key-lift task if one exists.
    // The task link is optional because key lift entries can still be useful
    // even when the coach has not created a formal assigned task yet.
    const { data: taskData } = await supabase
      .from('assigned_tasks')
      .select('id')
      .eq('client_id', client.id)
      .eq('task_type', 'key_lift')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    const assignedTaskId = taskData?.[0]?.id ?? null;

    // Dedicated table for structured progression analytics.
    const { error: keyLiftError } = await supabase.from('key_lift_entries').insert({
      client_id: client.id,
      lift_name: formData.liftName.trim(),
      weight_kg: weightKg,
      reps,
      rpe,
      rir,
      video_url: videoUrl || null,
      notes: notes || null,
    });

    if (keyLiftError) {
      setMessage(keyLiftError.message);
      setSaving(false);
      return;
    }

    const summary = [
      `Lift: ${formData.liftName.trim()}`,
      `Weight: ${weightKg}kg`,
      `Reps: ${reps}`,
      `Estimated 1RM: ${e1rm ?? 'Not calculated'}kg`,
      `RPE: ${rpe ?? 'Not provided'}`,
      `RIR: ${rir ?? 'Not provided'}`,
      `Video URL: ${videoUrl || 'Not provided'}`,
      `Notes: ${notes || 'Not provided'}`,
    ].join('\n');

    // Generic queue row so the coach sees the lift in the same review workflow
    // as weekly check-ins, workout check-ins, nutrition, and bodyweight.
    const { error: submissionError } = await supabase.from('task_submissions').insert({
      client_id: client.id,
      assigned_task_id: assignedTaskId,
      submission_type: 'key_lift',
      answer_value: e1rm ?? weightKg,
      answer_text: summary,
      review_status: 'new',
      followup_required: Boolean(notes || videoUrl || (rpe !== null && rpe >= 9)),
    });

    if (submissionError) {
      setMessage(submissionError.message);
      setSaving(false);
      return;
    }

    setIsSuccess(true);
    setMessage('Key lift submitted successfully. Returning to your hub...');
    setSaving(false);
    setFormData(buildInitialForm());

    setTimeout(() => {
      router.push('/client');
    }, 1200);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <PageHeader title="KEY LIFT" />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
            <Card>
              <p>Loading key lift form...</p>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader
        title="KEY LIFT"
        subtitle={client ? `For ${client.full_name}` : undefined}
      />

      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
          {message && (
            <Card
              className={`mb-6 p-4 ${
                isSuccess ? 'bg-green-50 border-green-200' : 'border-red-300 bg-red-50'
              }`}
            >
              <p
                className={`font-semibold uppercase text-sm ${
                  isSuccess ? 'text-green-800' : 'text-red-800'
                }`}
              >
                {isSuccess ? '✓ ' : ''}
                {message}
              </p>
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              type="text"
              label="LIFT NAME"
              name="liftName"
              placeholder="e.g. Bench press, squat, deadlift"
              value={formData.liftName}
              onChange={handleInputChange}
              required
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                type="number"
                label="WEIGHT (KG)"
                name="weightKg"
                placeholder="e.g. 120"
                value={formData.weightKg}
                onChange={handleInputChange}
                step="0.5"
                required
              />
              <Input
                type="number"
                label="REPS"
                name="reps"
                placeholder="e.g. 5"
                value={formData.reps}
                onChange={handleInputChange}
                step="1"
                required
              />
            </div>

            {estimatedOneRepMax !== null && (
              <Card className="border-2 border-[#FA0201] bg-white">
                <p className="text-xs font-bold uppercase text-gray-500">Estimated 1RM</p>
                <p className="mt-1 text-3xl font-black text-[#000000]">{estimatedOneRepMax}kg</p>
                <p className="mt-2 text-sm text-gray-600">Used as a trend signal for coaching review, not as a max-out prescription.</p>
              </Card>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                type="number"
                label="RPE"
                name="rpe"
                placeholder="Optional, 1-10"
                value={formData.rpe}
                onChange={handleInputChange}
                step="0.5"
              />
              <Input
                type="number"
                label="RIR"
                name="rir"
                placeholder="Optional, 0-10"
                value={formData.rir}
                onChange={handleInputChange}
                step="0.5"
              />
            </div>

            <Input
              type="url"
              label="VIDEO URL"
              name="videoUrl"
              placeholder="Optional link to form video"
              value={formData.videoUrl}
              onChange={handleInputChange}
            />

            <Textarea
              label="NOTES"
              name="notes"
              placeholder="Any context your coach should know?"
              value={formData.notes}
              onChange={handleInputChange}
            />

            <div className="pb-8">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                disabled={saving || !client}
                className="bg-[#FA0201] hover:bg-red-700 disabled:opacity-60"
              >
                {saving ? 'SAVING...' : 'SUBMIT'}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
