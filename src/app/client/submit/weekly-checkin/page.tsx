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

export default function WeeklyCheckinPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [weekRating, setWeekRating] = useState('');
  const [biggestWin, setBiggestWin] = useState('');
  const [biggestChallenge, setBiggestChallenge] = useState('');
  const [issues, setIssues] = useState('');
  const [helpNeeded, setHelpNeeded] = useState('');
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

    loadClient();
  }, [user]);

  const submitCheckin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!client) {
      setMessage('No linked client profile found.');
      return;
    }

    const ratingNumber = Number(weekRating);
    if (!ratingNumber || ratingNumber < 1 || ratingNumber > 10) {
      setMessage('Add a week rating from 1 to 10.');
      return;
    }

    setSaving(true);
    setMessage(null);

    const supabase = createClient();

    const { data: taskData } = await supabase
      .from('assigned_tasks')
      .select('id')
      .eq('client_id', client.id)
      .eq('task_type', 'weekly_checkin')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    const assignedTaskId = taskData?.[0]?.id ?? null;

    const { error: checkinError } = await supabase.from('weekly_checkins').insert({
      client_id: client.id,
      week_rating: ratingNumber,
      biggest_win: biggestWin.trim() || null,
      biggest_challenge: biggestChallenge.trim() || null,
      pain_or_issues: issues.trim() || null,
      help_needed_on_call: helpNeeded.trim() || null,
      review_status: 'new',
    });

    if (checkinError) {
      setMessage(checkinError.message);
      setSaving(false);
      return;
    }

    const summary = [
      `Rating: ${ratingNumber}/10`,
      `Win: ${biggestWin || 'Not provided'}`,
      `Challenge: ${biggestChallenge || 'Not provided'}`,
      `Issues: ${issues || 'Not provided'}`,
      `Help needed: ${helpNeeded || 'Not provided'}`,
    ].join('\n');

    const { error: submissionError } = await supabase.from('task_submissions').insert({
      client_id: client.id,
      assigned_task_id: assignedTaskId,
      submission_type: 'weekly_checkin',
      answer_value: ratingNumber,
      answer_text: summary,
      review_status: 'new',
      followup_required: Boolean(biggestChallenge.trim() || issues.trim() || helpNeeded.trim()),
    });

    if (submissionError) {
      setMessage(submissionError.message);
      setSaving(false);
      return;
    }

    setMessage('Check-in submitted successfully. Returning to your hub...');
    setSaving(false);
    setTimeout(() => router.push('/client'), 1200);
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="WEEKLY CHECK-IN" />
        <main className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
          <Card><p>Loading check-in...</p></Card>
        </main>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="WEEKLY CHECK-IN" subtitle={client ? `For ${client.full_name}` : undefined} />
      <main className="px-4 py-6 md:px-8 max-w-2xl mx-auto">
        {message && (
          <Card className="mb-6">
            <p className="font-semibold text-sm text-gray-800">{message}</p>
          </Card>
        )}

        <form onSubmit={submitCheckin} className="space-y-8">
          <section>
            <SectionHeader title="WEEK RATING" />
            <label className="block text-sm font-bold uppercase mb-2">Rate your week from 1 to 10</label>
            <input
              type="number"
              min="1"
              max="10"
              value={weekRating}
              onChange={(event) => setWeekRating(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
              required
            />
          </section>

          <section>
            <SectionHeader title="CHECK-IN QUESTIONS" />
            <Textarea label="Biggest Win" value={biggestWin} onChange={(event) => setBiggestWin(event.target.value)} />
          </section>

          <section>
            <Textarea label="Biggest Challenge" value={biggestChallenge} onChange={(event) => setBiggestChallenge(event.target.value)} />
          </section>

          <section>
            <Textarea label="Issues" value={issues} onChange={(event) => setIssues(event.target.value)} />
          </section>

          <section>
            <Textarea label="Help Needed" value={helpNeeded} onChange={(event) => setHelpNeeded(event.target.value)} />
          </section>

          <Button type="submit" variant="primary" size="lg" fullWidth disabled={saving || !client} className="bg-[#FA0201] hover:bg-red-700 disabled:opacity-60">
            {saving ? 'SAVING...' : 'SUBMIT CHECK-IN'}
          </Button>
        </form>
      </main>
    </div>
  );
}
