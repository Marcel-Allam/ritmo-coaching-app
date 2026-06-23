'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ProgramSummary = { id: string; title: string; goal: string | null };

type CoachingTargetRecord = {
  current_focus: string | null;
  next_review_date: string | null;
  start_date: string | null;
};

type PeriodisationRecord = {
  id: string;
  program_id: string;
  programme_length_weeks: number;
  current_week: number;
  current_block_name: string;
  current_block_goal: string | null;
  next_block_name: string | null;
};

type StrengthBlock = {
  name: string;
  startWeek: number;
  endWeek: number;
  goal: string;
  nextBlock: string;
};

type Props = { clientId: string; programs: ProgramSummary[] };

const strengthBlocks: StrengthBlock[] = [
  {
    name: 'Calibration',
    startWeek: 0,
    endWeek: 0,
    goal: 'Establish reliable baseline strength estimates from top sets.',
    nextBlock: 'Accumulation',
  },
  {
    name: 'Accumulation',
    startWeek: 1,
    endWeek: 4,
    goal: 'Build technical consistency, repeatable volume, and work capacity.',
    nextBlock: 'Intensification',
  },
  {
    name: 'Intensification',
    startWeek: 5,
    endWeek: 8,
    goal: 'Shift from volume-building into heavier strength work.',
    nextBlock: 'Peak / Realisation',
  },
  {
    name: 'Peak / Realisation',
    startWeek: 9,
    endWeek: 10,
    goal: 'Express strength by reducing excess fatigue and practising heavier specific work.',
    nextBlock: 'Deload / Taper',
  },
  {
    name: 'Deload / Taper',
    startWeek: 11,
    endWeek: 11,
    goal: 'Reduce fatigue while keeping movement quality and confidence high.',
    nextBlock: 'Test / Review',
  },
  {
    name: 'Test / Review',
    startWeek: 12,
    endWeek: 12,
    goal: 'Test progress, review the block, and set direction for the next phase.',
    nextBlock: 'Next block',
  },
];

const defaultProgrammeLength = 12;
const defaultWeek = 0;

const formatDate = (value: string | null) => {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
};

const getWeekNumber = (startDate: string | null) => {
  if (!startDate) return null;
  const start = new Date(startDate);
  const now = new Date();
  const dayDifference = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
  return Math.floor(dayDifference / 7) + 1;
};

const getStrengthBlockByWeek = (week: number) => (
  strengthBlocks.find((block) => week >= block.startWeek && week <= block.endWeek) ?? strengthBlocks[0]
);

const getStrengthBlockByName = (name: string) => (
  strengthBlocks.find((block) => block.name.toLowerCase() === name.toLowerCase())
);

const cleanProgrammeTitle = (title: string | null | undefined) => {
  const fallbackTitle = 'Untitled programme';
  if (!title) return fallbackTitle;

  return title
    .replace(/\s+-\s+calibration start$/i, '')
    .trim() || fallbackTitle;
};

const CoachingTargetsCard = ({ clientId }: { clientId: string }) => {
  const [targets, setTargets] = useState<CoachingTargetRecord | null>(null);
  const [currentFocus, setCurrentFocus] = useState('');
  const [nextReviewDate, setNextReviewDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTargets = async () => {
    if (!isSupabaseConfigured) {
      setError('Supabase environment variables are not configured.');
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { data, error: targetError } = await supabase
      .from('clients')
      .select('current_focus, next_review_date, start_date')
      .eq('id', clientId)
      .single();

    if (targetError || !data) {
      setError(targetError?.message || 'Could not load coaching targets.');
      setLoading(false);
      return;
    }

    const loadedTargets = data as CoachingTargetRecord;
    setTargets(loadedTargets);
    setCurrentFocus(loadedTargets.current_focus ?? '');
    setNextReviewDate(loadedTargets.next_review_date ?? '');
    setLoading(false);
  };

  useEffect(() => {
    loadTargets();
  }, [clientId]);

  const handleStartEditing = () => {
    setCurrentFocus(targets?.current_focus ?? '');
    setNextReviewDate(targets?.next_review_date ?? '');
    setMessage(null);
    setError(null);
    setEditing(true);
  };

  const handleCancelEditing = () => {
    setCurrentFocus(targets?.current_focus ?? '');
    setNextReviewDate(targets?.next_review_date ?? '');
    setEditing(false);
    setMessage(null);
  };

  const handleSaveTargets = async () => {
    if (!isSupabaseConfigured) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: saveError } = await supabase
      .from('clients')
      .update({
        current_focus: currentFocus.trim() || null,
        next_review_date: nextReviewDate || null,
      })
      .eq('id', clientId);

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
      return;
    }

    setTargets((current) => ({
      current_focus: currentFocus.trim() || null,
      next_review_date: nextReviewDate || null,
      start_date: current?.start_date ?? null,
    }));
    setMessage('Coaching targets saved.');
    setEditing(false);
    setSaving(false);
  };

  if (loading) return <Card><p className="text-sm font-semibold text-gray-700">Loading coaching targets...</p></Card>;
  if (error && !targets) return <Card><p className="text-sm font-semibold text-red-700">{error}</p></Card>;

  const weekNumber = getWeekNumber(targets?.start_date ?? null);
  const hasTargets = Boolean(targets?.current_focus && targets?.next_review_date);

  return (
    <section>
      <SectionHeader title="COACHING STATUS" accent />
      <Card variant="dark" className="p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-[#FA0201]">Coaching status</p>
            <h2 className="mt-2 text-3xl font-black uppercase tracking-tight text-white">
              {weekNumber ? `Week ${weekNumber}` : 'Active coaching'}
            </h2>
          </div>
          <button
            type="button"
            onClick={editing ? handleCancelEditing : handleStartEditing}
            className="w-fit rounded-lg border border-white/30 px-4 py-3 text-xs font-black uppercase text-white hover:bg-white hover:text-black"
          >
            {editing ? 'Cancel' : hasTargets ? 'Edit targets' : 'Add targets'}
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="rounded-lg bg-white/10 p-4">
            <p className="text-[10px] font-bold uppercase text-white/50">Current focus</p>
            {editing ? (
              <textarea
                value={currentFocus}
                onChange={(event) => setCurrentFocus(event.target.value)}
                placeholder="Example: Build bench consistency while holding bodyweight stable."
                className="mt-2 min-h-24 w-full rounded-lg border border-white/20 bg-black px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#FA0201]"
              />
            ) : (
              <p className="mt-1 text-sm font-black uppercase text-white">{targets?.current_focus || 'No focus set yet'}</p>
            )}
          </div>

          <div className="rounded-lg bg-white/10 p-4">
            <p className="text-[10px] font-bold uppercase text-white/50">Next review</p>
            {editing ? (
              <input
                type="date"
                value={nextReviewDate}
                onChange={(event) => setNextReviewDate(event.target.value)}
                className="mt-2 w-full rounded-lg border border-white/20 bg-black px-3 py-2 text-sm font-bold text-white outline-none focus:border-[#FA0201]"
              />
            ) : (
              <p className="mt-1 text-sm font-black uppercase text-white">{formatDate(targets?.next_review_date ?? null)}</p>
            )}
          </div>

          <div className="rounded-lg bg-white/10 p-4">
            <p className="text-[10px] font-bold uppercase text-white/50">Start date</p>
            <p className="mt-1 text-sm font-black uppercase text-white">{formatDate(targets?.start_date ?? null)}</p>
          </div>
        </div>

        {editing && (
          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
            <button
              type="button"
              onClick={handleSaveTargets}
              disabled={saving}
              className="w-fit rounded-lg bg-[#FA0201] px-5 py-3 text-xs font-black uppercase text-white hover:bg-red-700 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save targets'}
            </button>
            <p className="text-xs font-semibold text-white/50">These fields update the client-side coaching status card.</p>
          </div>
        )}

        {message && <p className="mt-4 text-sm font-semibold text-green-300">{message}</p>}
        {error && <p className="mt-4 text-sm font-semibold text-red-300">{error}</p>}
      </Card>
    </section>
  );
};

export function CoachPeriodisationSection({ clientId, programs }: Props) {
  const [rowsByProgram, setRowsByProgram] = useState<Record<string, PeriodisationRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setError(null);

      if (programs.length === 0) {
        setRowsByProgram({});
        setLoading(false);
        return;
      }

      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      setLoading(true);
      const supabase = createClient();
      const programIds = programs.map((program) => program.id);
      const settingsResult = await supabase
        .from('program_periodisation_settings')
        .select('id, program_id, programme_length_weeks, current_week, current_block_name, current_block_goal, next_block_name')
        .in('program_id', programIds);

      if (settingsResult.error) {
        setError(settingsResult.error.message);
        setLoading(false);
        return;
      }

      const settingsRows = (settingsResult.data ?? []) as PeriodisationRecord[];
      const settingsMap = settingsRows.reduce<Record<string, PeriodisationRecord>>((acc, row) => {
        acc[row.program_id] = row;
        return acc;
      }, {});

      setRowsByProgram(settingsMap);
      setLoading(false);
    };

    loadData();
  }, [programs]);

  return (
    <>
      <CoachingTargetsCard clientId={clientId} />

      <section>
        <SectionHeader title="PERIODISATION" accent />
        <Card>
          {programs.length === 0 ? (
            <p className="text-sm text-gray-600">No active programme found yet. Add a programme before setting the training trajectory.</p>
          ) : loading ? (
            <p className="text-sm text-gray-600">Loading periodisation...</p>
          ) : error ? (
            <p className="text-sm font-semibold text-red-700">{error}</p>
          ) : (
            <div className="space-y-4">
              {programs.map((program) => {
                const savedRow = rowsByProgram[program.id];
                const currentWeek = savedRow?.current_week ?? defaultWeek;
                const programmeLength = savedRow?.programme_length_weeks ?? defaultProgrammeLength;
                const savedBlock = savedRow ? getStrengthBlockByName(savedRow.current_block_name) : undefined;
                const strengthBlock = savedBlock ?? getStrengthBlockByWeek(currentWeek);
                const currentBlock = savedRow?.current_block_name || strengthBlock.name;
                const nextBlock = savedRow?.next_block_name || strengthBlock.nextBlock;
                const blockGoal = strengthBlock.goal || savedRow?.current_block_goal || 'Set the goal for this block.';

                return (
                  <div key={program.id} className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-4">
                    <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase text-[#FA0201]">Programme trajectory</p>
                        <h2 className="text-xl font-black uppercase text-[#000000]">{cleanProgrammeTitle(program.title)}</h2>
                      </div>
                      <Badge variant={savedRow ? 'success' : 'warning'}>{savedRow ? 'Saved' : 'Not configured'}</Badge>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <p className="text-xs font-bold uppercase text-gray-500">Week</p>
                        <p className="mt-2 text-2xl font-black text-[#000000]">Week {currentWeek} of {programmeLength}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <p className="text-xs font-bold uppercase text-gray-500">Current block</p>
                        <p className="mt-2 text-2xl font-black text-[#000000]">{currentBlock}</p>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-white p-4">
                        <p className="text-xs font-bold uppercase text-gray-500">Next block</p>
                        <p className="mt-2 text-2xl font-black text-[#000000]">{nextBlock}</p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4">
                      <p className="text-xs font-bold uppercase text-gray-500">Block goal</p>
                      <p className="mt-2 text-base font-semibold text-[#000000]">{blockGoal}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>
    </>
  );
}
