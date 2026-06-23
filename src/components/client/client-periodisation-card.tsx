'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type TrainingProgramRecord = {
  id: string;
  title: string | null;
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

type Props = {
  clientId: string;
};

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
  const fallbackTitle = 'Training programme';
  if (!title) return fallbackTitle;

  return title
    .replace(/\s+-\s+calibration start$/i, '')
    .trim() || fallbackTitle;
};

export function ClientPeriodisationCard({ clientId }: Props) {
  const [program, setProgram] = useState<TrainingProgramRecord | null>(null);
  const [settings, setSettings] = useState<PeriodisationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPeriodisation = async () => {
      setError(null);

      if (!isSupabaseConfigured) {
        setError('Periodisation is not available yet.');
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: programData, error: programError } = await supabase
        .from('training_programs')
        .select('id, title')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (programError) {
        setError(programError.message);
        setLoading(false);
        return;
      }

      if (!programData) {
        setProgram(null);
        setSettings(null);
        setLoading(false);
        return;
      }

      const activeProgram = programData as TrainingProgramRecord;
      setProgram(activeProgram);

      const { data: settingsData, error: settingsError } = await supabase
        .from('program_periodisation_settings')
        .select('id, program_id, programme_length_weeks, current_week, current_block_name, current_block_goal, next_block_name')
        .eq('program_id', activeProgram.id)
        .eq('client_visible', true)
        .maybeSingle();

      if (settingsError) {
        setError(settingsError.message);
        setLoading(false);
        return;
      }

      setSettings((settingsData as PeriodisationRecord | null) ?? null);
      setLoading(false);
    };

    loadPeriodisation();
  }, [clientId]);

  if (loading || error || !program) return null;

  const currentWeek = settings?.current_week ?? defaultWeek;
  const programmeLength = settings?.programme_length_weeks ?? defaultProgrammeLength;
  const savedBlock = settings ? getStrengthBlockByName(settings.current_block_name) : undefined;
  const strengthBlock = savedBlock ?? getStrengthBlockByWeek(currentWeek);
  const currentBlock = settings?.current_block_name || strengthBlock.name;
  const nextBlock = settings?.next_block_name || strengthBlock.nextBlock;
  const blockGoal = strengthBlock.goal || settings?.current_block_goal || 'Follow the current block focus set by your coach.';

  return (
    <Card>
      <div className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-4">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-[#FA0201]">Programme trajectory</p>
            <h2 className="text-xl font-black uppercase text-[#000000]">{cleanProgrammeTitle(program.title)}</h2>
          </div>
          {settings && <Badge variant="success">Active</Badge>}
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
    </Card>
  );
}
