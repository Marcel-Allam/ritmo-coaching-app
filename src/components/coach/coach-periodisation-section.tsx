'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ProgramSummary = { id: string; title: string; goal: string | null };

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

export function CoachPeriodisationSection({ programs }: Props) {
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
  );
}
