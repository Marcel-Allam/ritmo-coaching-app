'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/ui/section-header';
import { Badge } from '@/components/ui/badge';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';

interface ClientRecord {
  id: string;
  full_name: string;
  next_review_date: string | null;
  current_focus: string | null;
}

interface ReviewLogRecord {
  id: string;
  review_date: string;
  client_status: string;
  main_win: string | null;
  main_issue: string | null;
  decisions_made: string | null;
  client_actions: string | null;
  coach_actions: string | null;
  plan_changes: string | null;
  next_review_date: string | null;
  private_notes: string | null;
  created_at: string;
}

interface ReviewLogForm {
  reviewDate: string;
  clientStatus: string;
  mainWin: string;
  mainIssue: string;
  decisionsMade: string;
  clientActions: string;
  coachActions: string;
  planChanges: string;
  nextReviewDate: string;
  privateNotes: string;
  updateClientFocus: boolean;
  newClientFocus: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): ReviewLogForm => ({
  reviewDate: todayIso(),
  clientStatus: 'on_track',
  mainWin: '',
  mainIssue: '',
  decisionsMade: '',
  clientActions: '',
  coachActions: '',
  planChanges: '',
  nextReviewDate: '',
  privateNotes: '',
  updateClientFocus: true,
  newClientFocus: '',
});

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const formatStatus = (value: string) => value.replaceAll('_', ' ');

const statusVariant = (status: string) => {
  if (status === 'on_track') return 'success';
  if (status === 'needs_attention') return 'warning';
  if (status === 'at_risk') return 'danger';
  return 'default';
};

export default function ClientReviewLogPage() {
  const params = useParams();
  const clientId = params.id as string;
  const { user } = useAuth();

  const [client, setClient] = useState<ClientRecord | null>(null);
  const [logs, setLogs] = useState<ReviewLogRecord[]>([]);
  const [form, setForm] = useState<ReviewLogForm>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadReviewLogs = async () => {
    if (!isSupabaseConfigured) {
      setMessage('Supabase environment variables are not configured.');
      setIsLoading(false);
      return;
    }

    const supabase = createClient();

    const [clientResult, logResult] = await Promise.all([
      supabase
        .from('clients')
        .select('id, full_name, next_review_date, current_focus')
        .eq('id', clientId)
        .single(),
      supabase
        .from('client_review_logs')
        .select('id, review_date, client_status, main_win, main_issue, decisions_made, client_actions, coach_actions, plan_changes, next_review_date, private_notes, created_at')
        .eq('client_id', clientId)
        .order('review_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (clientResult.error) {
      setMessage(clientResult.error.message);
      setIsLoading(false);
      return;
    }

    if (logResult.error) {
      setMessage(logResult.error.message);
      setIsLoading(false);
      return;
    }

    const loadedClient = clientResult.data as ClientRecord;
    setClient(loadedClient);
    setLogs((logResult.data ?? []) as ReviewLogRecord[]);
    setForm((current) => ({
      ...current,
      nextReviewDate: loadedClient.next_review_date ?? '',
      newClientFocus: loadedClient.current_focus ?? '',
    }));
    setIsLoading(false);
  };

  useEffect(() => {
    loadReviewLogs();
  }, [clientId]);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleCheckboxChange = (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({
      ...current,
      updateClientFocus: event.target.checked,
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!client) {
      setMessage('Client record not loaded.');
      return;
    }

    if (!form.reviewDate) {
      setMessage('Review date is required.');
      return;
    }

    if (!form.mainWin.trim() && !form.mainIssue.trim() && !form.decisionsMade.trim()) {
      setMessage('Add at least a main win, main issue, or decisions made.');
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const supabase = createClient();

    const { error: logError } = await supabase.from('client_review_logs').insert({
      client_id: client.id,
      coach_id: user?.id ?? null,
      review_date: form.reviewDate,
      client_status: form.clientStatus,
      main_win: form.mainWin.trim() || null,
      main_issue: form.mainIssue.trim() || null,
      decisions_made: form.decisionsMade.trim() || null,
      client_actions: form.clientActions.trim() || null,
      coach_actions: form.coachActions.trim() || null,
      plan_changes: form.planChanges.trim() || null,
      next_review_date: form.nextReviewDate || null,
      private_notes: form.privateNotes.trim() || null,
    });

    if (logError) {
      setMessage(logError.message);
      setIsSaving(false);
      return;
    }

    const clientUpdate: Record<string, string | null> = {
      next_review_date: form.nextReviewDate || null,
    };

    if (form.updateClientFocus) {
      clientUpdate.current_focus = form.newClientFocus.trim() || null;
    }

    const { error: clientUpdateError } = await supabase
      .from('clients')
      .update(clientUpdate)
      .eq('id', client.id);

    if (clientUpdateError) {
      setMessage(clientUpdateError.message);
      setIsSaving(false);
      return;
    }

    setForm(emptyForm());
    setMessage('Review log saved. Client focus and next review date updated.');
    setIsSaving(false);
    setIsLoading(true);
    await loadReviewLogs();
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <Card>
          <p className="font-semibold text-gray-700">Loading review log...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight text-[#000000]">Review Log</h1>
          <p className="mt-1 text-sm text-gray-600">
            Internal post-call and review notes for {client?.full_name ?? 'this client'}.
          </p>
        </div>
        <Link href={`/coach/clients/${clientId}`}>
          <Button type="button" variant="outline">Back to client</Button>
        </Link>
      </div>

      {message && (
        <Card className="mb-6">
          <p className="text-sm font-semibold text-gray-700">{message}</p>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_0.9fr]">
        <section>
          <SectionHeader title="NEW REVIEW LOG" accent />
          <Card>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  type="date"
                  label="Review Date"
                  name="reviewDate"
                  value={form.reviewDate}
                  onChange={handleInputChange}
                  required
                />
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase text-gray-600">Client Status</label>
                  <select
                    name="clientStatus"
                    value={form.clientStatus}
                    onChange={handleInputChange}
                    className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-[#000000]"
                  >
                    <option value="on_track">On track</option>
                    <option value="needs_attention">Needs attention</option>
                    <option value="at_risk">At risk</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>

              <Textarea
                label="Main Win"
                name="mainWin"
                placeholder="What went well since the last review?"
                value={form.mainWin}
                onChange={handleInputChange}
              />
              <Textarea
                label="Main Issue"
                name="mainIssue"
                placeholder="What is the main bottleneck or problem?"
                value={form.mainIssue}
                onChange={handleInputChange}
              />
              <Textarea
                label="Decisions Made"
                name="decisionsMade"
                placeholder="What did you decide during the review?"
                value={form.decisionsMade}
                onChange={handleInputChange}
              />
              <Textarea
                label="Client Actions"
                name="clientActions"
                placeholder="What does the client need to do next?"
                value={form.clientActions}
                onChange={handleInputChange}
              />
              <Textarea
                label="Coach Actions"
                name="coachActions"
                placeholder="What do you need to do after this review?"
                value={form.coachActions}
                onChange={handleInputChange}
              />
              <Textarea
                label="Plan Changes"
                name="planChanges"
                placeholder="Training, nutrition, schedule, or task changes agreed."
                value={form.planChanges}
                onChange={handleInputChange}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  type="date"
                  label="Next Review Date"
                  name="nextReviewDate"
                  value={form.nextReviewDate}
                  onChange={handleInputChange}
                />
                <Input
                  type="text"
                  label="Client Focus"
                  name="newClientFocus"
                  placeholder="e.g. Hit 3 sessions and keep protein consistent"
                  value={form.newClientFocus}
                  onChange={handleInputChange}
                />
              </div>

              <label className="flex items-center gap-3 text-sm font-semibold uppercase text-gray-700">
                <input
                  type="checkbox"
                  checked={form.updateClientFocus}
                  onChange={handleCheckboxChange}
                  className="h-5 w-5 rounded border-gray-300 accent-[#FA0201]"
                />
                Update client profile focus
              </label>

              <Textarea
                label="Private Notes"
                name="privateNotes"
                placeholder="Private context that should not be shown to the client."
                value={form.privateNotes}
                onChange={handleInputChange}
              />

              <div className="flex justify-end">
                <Button type="submit" isLoading={isSaving} className="bg-[#FA0201] hover:bg-red-700">
                  Save review log
                </Button>
              </div>
            </form>
          </Card>
        </section>

        <section>
          <SectionHeader title="REVIEW HISTORY" accent />
          <div className="space-y-4">
            {logs.length === 0 ? (
              <Card>
                <p className="text-sm text-gray-600">No review logs saved yet.</p>
              </Card>
            ) : (
              logs.map((log) => (
                <Card key={log.id}>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-gray-500">{formatDate(log.review_date)}</p>
                      <p className="mt-1 text-lg font-black uppercase text-[#000000]">Review record</p>
                    </div>
                    <Badge variant={statusVariant(log.client_status) as any}>{formatStatus(log.client_status)}</Badge>
                  </div>

                  <div className="space-y-3 text-sm">
                    {log.main_win && (
                      <div>
                        <p className="text-xs font-bold uppercase text-gray-500">Win</p>
                        <p className="text-gray-800">{log.main_win}</p>
                      </div>
                    )}
                    {log.main_issue && (
                      <div>
                        <p className="text-xs font-bold uppercase text-gray-500">Issue</p>
                        <p className="text-gray-800">{log.main_issue}</p>
                      </div>
                    )}
                    {log.decisions_made && (
                      <div>
                        <p className="text-xs font-bold uppercase text-gray-500">Decisions</p>
                        <p className="whitespace-pre-wrap text-gray-800">{log.decisions_made}</p>
                      </div>
                    )}
                    {log.client_actions && (
                      <div>
                        <p className="text-xs font-bold uppercase text-gray-500">Client Actions</p>
                        <p className="whitespace-pre-wrap text-gray-800">{log.client_actions}</p>
                      </div>
                    )}
                    {log.coach_actions && (
                      <div>
                        <p className="text-xs font-bold uppercase text-gray-500">Coach Actions</p>
                        <p className="whitespace-pre-wrap text-gray-800">{log.coach_actions}</p>
                      </div>
                    )}
                    {log.plan_changes && (
                      <div>
                        <p className="text-xs font-bold uppercase text-gray-500">Plan Changes</p>
                        <p className="whitespace-pre-wrap text-gray-800">{log.plan_changes}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-bold uppercase text-gray-500">Next Review</p>
                      <p className="text-gray-800">{formatDate(log.next_review_date)}</p>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
