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

const ratingOptions = Array.from({ length: 10 }, (_, index) => index + 1);

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
      setMessage('Choose an overall week rating from 1 to 10.');
      return;
    }

    if (!biggestWin.trim() || !biggestChallenge.trim() || !issues.trim() || !helpNeeded.trim()) {
      setMessage('Complete all five check-in questions before submitting. Write “None” if a section does not apply.');
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
      biggest_win: biggestWin.trim(),
      biggest_challenge: biggestChallenge.trim(),
      pain_or_issues: issues.trim(),
      help_needed_on_call: helpNeeded.trim(),
      review_status: 'new',
    });

    if (checkinError) {
      setMessage(checkinError.message);
      setSaving(false);
      return;
    }

    const summary = [
      `Rating: ${ratingNumber}/10`,
      `Win: ${biggestWin.trim()}`,
      `Challenge: ${biggestChallenge.trim()}`,
      `Issues: ${issues.trim()}`,
      `Help needed: ${helpNeeded.trim()}`,
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
        <main className="mx-auto max-w-2xl px-4 py-6 md:px-8">
          <Card><p>Loading check-in...</p></Card>
        </main>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="WEEKLY CHECK-IN" subtitle={client ? `For ${client.full_name}` : undefined} />
      <main className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        {message && (
          <Card className="mb-6">
            <p className="text-sm font-semibold text-gray-800">{message}</p>
          </Card>
        )}

        <Card className="mb-6 border-2 border-gray-200 bg-gray-50">
          <p className="text-xs font-bold uppercase text-gray-500">Weekly accountability</p>
          <h2 className="mt-1 text-xl font-black uppercase text-[#000000]">Tell your coach what actually happened this week.</h2>
          <p className="mt-2 text-sm text-gray-700">
            Be specific. This is used to adjust your training, nutrition focus, and next check-in — not to judge you.
          </p>
        </Card>

        <form onSubmit={submitCheckin} className="space-y-8">
          <section>
            <SectionHeader title="1. OVERALL WEEK RATING" />
            <Card>
              <label className="block text-sm font-bold uppercase text-[#000000]">How would you rate this week overall?</label>
              <p className="mt-1 text-sm text-gray-600">1 = very poor, 10 = excellent. Think training, nutrition, energy, routine, and stress.</p>
              <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
                {ratingOptions.map((rating) => {
                  const isSelected = weekRating === String(rating);
                  return (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => setWeekRating(String(rating))}
                      className={`rounded-lg border-2 px-3 py-2 text-sm font-black transition ${
                        isSelected
                          ? 'border-[#FA0201] bg-[#FA0201] text-white'
                          : 'border-gray-300 bg-white text-[#000000] hover:border-[#FA0201]'
                      }`}
                      aria-pressed={isSelected}
                    >
                      {rating}
                    </button>
                  );
                })}
              </div>
            </Card>
          </section>

          <section>
            <SectionHeader title="2. BIGGEST WIN" />
            <Card>
              <Textarea
                label="What was your biggest win this week?"
                value={biggestWin}
                onChange={(event) => setBiggestWin(event.target.value)}
                placeholder="Example: Hit all 3 sessions, got protein in every day, slept better, or pushed through a stressful week."
                required
              />
            </Card>
          </section>

          <section>
            <SectionHeader title="3. BIGGEST CHALLENGE" />
            <Card>
              <Textarea
                label="What was the biggest thing that made progress harder?"
                value={biggestChallenge}
                onChange={(event) => setBiggestChallenge(event.target.value)}
                placeholder="Example: Work stress, missed sessions, low energy, poor planning, hunger, social meals, motivation, time."
                required
              />
            </Card>
          </section>

          <section>
            <SectionHeader title="4. PAIN, RECOVERY OR ISSUES" />
            <Card>
              <Textarea
                label="Any pain, injury, fatigue, sleep, stress, or recovery issues?"
                value={issues}
                onChange={(event) => setIssues(event.target.value)}
                placeholder="Write “None” if there were no issues. Include where the issue is, when it happens, and whether it affected training."
                required
              />
            </Card>
          </section>

          <section>
            <SectionHeader title="5. COACH SUPPORT" />
            <Card>
              <Textarea
                label="What do you need help with before or on the next check-in?"
                value={helpNeeded}
                onChange={(event) => setHelpNeeded(event.target.value)}
                placeholder="Example: Adjust a workout, food structure, accountability, schedule, exercise swap, confidence with the plan. Write “None” if nothing."
                required
              />
            </Card>
          </section>

          <Button type="submit" variant="primary" size="lg" fullWidth disabled={saving || !client} className="bg-[#FA0201] hover:bg-red-700 disabled:opacity-60">
            {saving ? 'SAVING...' : 'SUBMIT WEEKLY CHECK-IN'}
          </Button>
        </form>
      </main>
    </div>
  );
}
