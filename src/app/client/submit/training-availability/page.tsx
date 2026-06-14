'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

type ClientRecord = { id: string; full_name: string };
type AssignedTaskRecord = { id: string; instructions: string | null };

type TrainingDay = {
  label: string;
  value: string;
};

const trainingDays: TrainingDay[] = [
  { label: 'Monday', value: 'Monday' },
  { label: 'Tuesday', value: 'Tuesday' },
  { label: 'Wednesday', value: 'Wednesday' },
  { label: 'Thursday', value: 'Thursday' },
  { label: 'Friday', value: 'Friday' },
  { label: 'Saturday', value: 'Saturday' },
  { label: 'Sunday', value: 'Sunday' },
];

const promptCopy = `Set your training days now.\n\nWhen your workouts have a clear day attached, they stop being “I’ll fit it in” and become part of the plan. Pick the days you can realistically train next week.`;

export default function TrainingAvailabilityPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [assignedTask, setAssignedTask] = useState<AssignedTaskRecord | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [sessionCount, setSessionCount] = useState('');
  const [preferredTime, setPreferredTime] = useState('Flexible');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const loadClient = async () => {
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

      const { data: taskData } = await supabase
        .from('assigned_tasks')
        .select('id, instructions')
        .eq('client_id', linkedClient.id)
        .eq('task_type', 'training_availability')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      setAssignedTask((taskData?.[0] as AssignedTaskRecord | undefined) ?? null);
      setLoading(false);
    };

    loadClient();
  }, [user]);

  const toggleDay = (day: string) => {
    setSelectedDays((current) => (
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day]
    ));
  };

  const submitAvailability = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!client) {
      setMessage('No linked client profile found.');
      return;
    }

    if (selectedDays.length === 0) {
      setMessage('Pick at least one day you can train.');
      return;
    }

    const sessions = Number(sessionCount);
    if (!sessions || sessions < 1 || sessions > 7) {
      setMessage('Add how many sessions you can realistically complete, from 1 to 7.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const supabase = createClient();
    const summary = [
      `Available days: ${selectedDays.join(', ')}`,
      `Realistic sessions: ${sessions}`,
      `Preferred time: ${preferredTime}`,
      `Limits / notes: ${notes.trim() || 'None provided'}`,
    ].join('\n');

    const { error: submissionError } = await supabase.from('task_submissions').insert({
      client_id: client.id,
      assigned_task_id: assignedTask?.id ?? null,
      submission_type: 'training_availability',
      answer_value: sessions,
      answer_text: summary,
      review_status: 'new',
      followup_required: true,
    });

    if (submissionError) {
      setMessage(submissionError.message);
      setSaving(false);
      return;
    }

    if (assignedTask?.id) {
      const { error: taskError } = await supabase
        .from('assigned_tasks')
        .update({ active: false })
        .eq('id', assignedTask.id);

      if (taskError) {
        setMessage(taskError.message);
        setSaving(false);
        return;
      }
    }

    setMessage('Training availability submitted. Your coach can now schedule your workouts.');
    setSaving(false);
    setTimeout(() => router.push('/client/tasks'), 1200);
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="TRAINING AVAILABILITY" />
        <main className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
          <Card><p>Loading availability form...</p></Card>
        </main>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="TRAINING AVAILABILITY" subtitle={client ? `For ${client.full_name}` : undefined} />
      <main className="px-4 py-6 md:px-8 max-w-2xl mx-auto pb-24 md:pb-8">
        <Card className="mb-6 border-2 border-[#FA0201]/20 bg-white">
          <pre className="whitespace-pre-wrap text-sm font-semibold leading-relaxed text-[#000000] font-sans">
            {assignedTask?.instructions || promptCopy}
          </pre>
        </Card>

        {message && (
          <Card className="mb-6">
            <p className="font-semibold text-sm text-gray-800">{message}</p>
          </Card>
        )}

        <form onSubmit={submitAvailability} className="space-y-8">
          <section>
            <SectionHeader title="DAYS AVAILABLE" accent />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {trainingDays.map((day) => {
                const selected = selectedDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`rounded-lg border-2 px-4 py-3 text-left text-sm font-bold uppercase transition-colors ${
                      selected
                        ? 'border-[#FA0201] bg-[#FA0201] text-white'
                        : 'border-gray-300 bg-white text-[#000000] hover:border-[#FA0201]'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <SectionHeader title="REALISTIC SESSIONS" accent />
            <label className="block text-sm font-bold uppercase mb-2">How many sessions can you realistically complete?</label>
            <input
              type="number"
              min="1"
              max="7"
              value={sessionCount}
              onChange={(event) => setSessionCount(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
              required
            />
          </section>

          <section>
            <SectionHeader title="PREFERRED TIME" accent />
            <select
              value={preferredTime}
              onChange={(event) => setPreferredTime(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
            >
              <option value="Flexible">Flexible</option>
              <option value="Morning">Morning</option>
              <option value="Afternoon">Afternoon</option>
              <option value="Evening">Evening</option>
            </select>
          </section>

          <section>
            <SectionHeader title="LIMITS THIS WEEK" accent />
            <Textarea
              label="Anything your coach should know?"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. Busy Thursday, prefer evening sessions, travelling on Sunday."
            />
          </section>

          <Button type="submit" variant="primary" size="lg" fullWidth disabled={saving || !client} className="bg-[#FA0201] hover:bg-red-700 disabled:opacity-60">
            {saving ? 'SAVING...' : 'SUBMIT TRAINING DAYS'}
          </Button>
        </form>
      </main>
    </div>
  );
}
