'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface FormData {
  workoutDate: string;
  sessionName: string;
  rpe: number;
  energyRating: number;
  volumeCompleted: boolean;
  painReported: boolean;
  painNotes: string;
  notes: string;
}

type ClientRecord = {
  id: string;
  full_name: string;
};

const RatingButtons = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (val: number) => void;
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

export default function WorkoutCheckinPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const [formData, setFormData] = useState<FormData>({
    workoutDate: '',
    sessionName: '',
    rpe: 0,
    energyRating: 0,
    volumeCompleted: false,
    painReported: false,
    painNotes: '',
    notes: '',
  });

  useEffect(() => {
    const loadLinkedClient = async () => {
      if (!isSupabaseConfigured || !user) {
        setMessage('Client login is not ready.');
        setLoading(false);
        return;
      }

      const supabase = createClient();

      // Find the client record linked to the currently logged-in Supabase user.
      // We query by clients.user_id = user.id to prevent clients from manually
      // entering a different client ID. This ensures the form only submits data
      // for the linked client, maintaining proper access control.
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

  const handleInputChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleVolumeCheckboxChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      volumeCompleted: e.target.checked,
    }));
  };

  const handlePainCheckboxChange = (e: ChangeEvent<HTMLInputElement>) => {
    const isPainReported = e.target.checked;

    setFormData((prev) => ({
      ...prev,
      painReported: isPainReported,
      painNotes: isPainReported ? prev.painNotes : '',
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!client) {
      setMessage('No linked client profile found.');
      return;
    }

    if (!formData.workoutDate) {
      setMessage('Add the workout date.');
      return;
    }

    if (!formData.sessionName.trim()) {
      setMessage('Add the session name.');
      return;
    }

    if (formData.rpe < 1 || formData.rpe > 10) {
      setMessage('Select an RPE from 1 to 10.');
      return;
    }

    if (formData.energyRating < 1 || formData.energyRating > 10) {
      setMessage('Select an energy rating from 1 to 10.');
      return;
    }

    if (formData.painReported && !formData.painNotes.trim()) {
      setMessage('Add a short pain note so your coach knows what happened.');
      return;
    }

    setSaving(true);
    setMessage(null);
    setIsSuccess(false);

    const supabase = createClient();

    // Attach the submission to the latest active workout-check-in task if one exists.
    // This synchronizes the detailed workout_checkins table with the generic task_submissions
    // review queue, allowing coaches to track submissions in one place while maintaining
    // specialized workout data in a dedicated table.
    const { data: taskData } = await supabase
      .from('assigned_tasks')
      .select('id')
      .eq('client_id', client.id)
      .eq('task_type', 'workout_checkin')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    const assignedTaskId = taskData?.[0]?.id ?? null;
    const notes = formData.notes.trim();
    const painNotes = formData.painNotes.trim();

    // Determine if coach follow-up is required from key safety/recovery indicators.
    const followupRequired =
      formData.rpe >= 8 ||
      formData.energyRating <= 3 ||
      formData.painReported ||
      !formData.volumeCompleted;

    // Insert workout-specific data into the dedicated workout_checkins table.
    // This maintains detailed exercise history with specialized fields.
    const { error: workoutError } = await supabase.from('workout_checkins').insert({
      client_id: client.id,
      workout_date: formData.workoutDate,
      workout_name: formData.sessionName.trim(),
      completed: formData.volumeCompleted,
      difficulty_rating: formData.rpe,
      energy_rating: formData.energyRating,
      pain_reported: formData.painReported,
      pain_notes: formData.painReported ? painNotes : null,
      workout_notes: notes || null,
      review_status: 'new',
    });

    if (workoutError) {
      setMessage(workoutError.message);
      setSaving(false);
      return;
    }

    // Build a summary for the review queue.
    const summary = [
      `Workout date: ${formData.workoutDate}`,
      `Session: ${formData.sessionName.trim()}`,
      `RPE: ${formData.rpe}/10`,
      `Energy: ${formData.energyRating}/10`,
      `Volume completed: ${formData.volumeCompleted ? 'Yes' : 'No'}`,
      `Pain reported: ${formData.painReported ? 'Yes' : 'No'}`,
      `Pain notes: ${formData.painReported ? painNotes : 'Not reported'}`,
      `Notes: ${notes || 'Not provided'}`,
    ].join('\n');

    // Also insert into task_submissions to populate the coach review queue.
    // This row enables coaches to review all submissions (weekly_checkin, workout_checkin, etc.)
    // in a single queue, while allowing specialized queries on workout_checkins for detailed analytics.
    const { error: submissionError } = await supabase.from('task_submissions').insert({
      client_id: client.id,
      assigned_task_id: assignedTaskId,
      submission_type: 'workout_checkin',
      answer_value: formData.rpe,
      answer_text: summary,
      review_status: 'new',
      followup_required: followupRequired,
    });

    if (submissionError) {
      setMessage(submissionError.message);
      setSaving(false);
      return;
    }

    // Both inserts succeeded; show success and redirect.
    setIsSuccess(true);
    setMessage('Workout check-in submitted successfully. Returning to your hub...');
    setSaving(false);

    setTimeout(() => {
      router.push('/client');
    }, 1200);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
        <PageHeader title="WORKOUT CHECK-IN" />

        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <div className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
            <Card>
              <p>Loading workout check-in...</p>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <PageHeader
        title="WORKOUT CHECK-IN"
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
              type="date"
              label="WORKOUT DATE"
              name="workoutDate"
              value={formData.workoutDate}
              onChange={handleInputChange}
              required
            />

            <Input
              type="text"
              label="SESSION NAME"
              name="sessionName"
              placeholder="e.g. Upper Push, Lower A, Full Body"
              value={formData.sessionName}
              onChange={handleInputChange}
              required
            />

            <RatingButtons
              label="RPE (1-10)"
              value={formData.rpe}
              onChange={(val) =>
                setFormData((prev) => ({
                  ...prev,
                  rpe: val,
                }))
              }
            />

            <RatingButtons
              label="Energy Rating (1-10)"
              value={formData.energyRating}
              onChange={(val) =>
                setFormData((prev) => ({
                  ...prev,
                  energyRating: val,
                }))
              }
            />

            <div className="mb-6 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.volumeCompleted}
                  onChange={handleVolumeCheckboxChange}
                  className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer accent-[#FA0201]"
                />
                <span className="text-sm font-semibold uppercase">
                  Volume Completed
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.painReported}
                  onChange={handlePainCheckboxChange}
                  className="w-6 h-6 rounded border-2 border-gray-300 cursor-pointer accent-[#FA0201]"
                />
                <span className="text-sm font-semibold uppercase">
                  Pain Reported
                </span>
              </label>
            </div>

            {formData.painReported && (
              <Textarea
                label="PAIN NOTES"
                name="painNotes"
                placeholder="Where was the pain, when did it happen, and how severe was it?"
                value={formData.painNotes}
                onChange={handleInputChange}
                required
              />
            )}

            <Textarea
              label="NOTES"
              name="notes"
              placeholder="How did the session feel? Any observations?"
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
