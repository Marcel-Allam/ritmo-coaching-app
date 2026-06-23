'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type ProgramSummary = {
  id: string;
  title: string;
  goal: string | null;
  status: string;
};

type LibraryProgramme = {
  id: string;
  name: string | null;
  category: string | null;
  goal: string | null;
  description: string | null;
};

type PeriodisationRecord = {
  id: string;
  program_id: string;
  programme_length_weeks: number;
  current_week: number;
  current_block_name: string;
  current_block_start_week: number;
  current_block_end_week: number;
  current_block_goal: string | null;
  client_explanation: string | null;
  next_block_name: string | null;
  loading_guide: string | null;
  client_visible: boolean;
};

type PeriodisationType = 'strength' | 'hypertrophy' | 'both';
type ProgrammeTemplate = 'upper_lower' | 'full_body';

type StrengthBlock = {
  name: string;
  startWeek: number;
  endWeek: number;
  goal: string;
  clientExplanation: string;
  loadingGuide: string;
  nextBlock: string;
};

type Props = {
  clientId: string;
  programs: ProgramSummary[];
};

const strengthBlocks: StrengthBlock[] = [
  {
    name: 'Calibration',
    startWeek: 0,
    endWeek: 0,
    goal: 'Establish reliable baseline strength estimates from top sets.',
    clientExplanation: 'This week gives us a clear starting point so future loading can be based on actual performance rather than guesswork.',
    loadingGuide: 'Use controlled top sets to estimate current strength. Avoid true max attempts unless specifically programmed.',
    nextBlock: 'Accumulation',
  },
  {
    name: 'Accumulation',
    startWeek: 1,
    endWeek: 4,
    goal: 'Build technical consistency, repeatable volume, and work capacity.',
    clientExplanation: 'This phase builds the base. The aim is quality work, consistency, and preparation for heavier loading later.',
    loadingGuide: 'Moderate loads, higher total volume, controlled RPE, and repeatable execution.',
    nextBlock: 'Intensification',
  },
  {
    name: 'Intensification',
    startWeek: 5,
    endWeek: 8,
    goal: 'Shift from volume-building into heavier strength work.',
    clientExplanation: 'You are now moving into heavier training while keeping technique sharp.',
    loadingGuide: 'Heavier loads, slightly lower volume, and key lifts guided by calibration e1RM and recent performance.',
    nextBlock: 'Peak / Realisation',
  },
  {
    name: 'Peak / Realisation',
    startWeek: 9,
    endWeek: 10,
    goal: 'Express strength by reducing excess fatigue and practising heavier specific work.',
    clientExplanation: 'This phase prepares you to show the strength you have built.',
    loadingGuide: 'Lower volume, higher intensity, specific top sets, and avoid unnecessary fatigue.',
    nextBlock: 'Deload / Taper',
  },
  {
    name: 'Deload / Taper',
    startWeek: 11,
    endWeek: 11,
    goal: 'Reduce fatigue while keeping movement quality and confidence high.',
    clientExplanation: 'This week helps you recover and freshen up so you are ready to perform well in the final week.',
    loadingGuide: 'Reduced volume and intensity. Keep reps crisp, controlled, and far from failure.',
    nextBlock: 'Test / Review',
  },
  {
    name: 'Test / Review',
    startWeek: 12,
    endWeek: 12,
    goal: 'Test progress, review the block, and set direction for the next phase.',
    clientExplanation: 'This week lets us assess what improved and decide how to structure your next block.',
    loadingGuide: 'Test planned lifts or rep targets only. Use results to update training direction.',
    nextBlock: 'Next block',
  },
];

const periodisationTypes: Array<{ value: PeriodisationType; label: string; disabled?: boolean }> = [
  { value: 'strength', label: 'Strength' },
  { value: 'hypertrophy', label: 'Hypertrophy', disabled: true },
  { value: 'both', label: 'Both', disabled: true },
];

const programmeTemplates: Array<{ value: ProgrammeTemplate; label: string }> = [
  { value: 'upper_lower', label: 'Upper Lower' },
  { value: 'full_body', label: 'Full Body' },
];

const cleanText = (value: unknown, fallback = '') => {
  if (value === null || value === undefined) return fallback;
  const text = typeof value === 'string' ? value : String(value);
  return text.trim() || fallback;
};

const templateLabel = (template: ProgrammeTemplate) => programmeTemplates.find((item) => item.value === template)?.label ?? template;

const getBlockByName = (name: string) => strengthBlocks.find((block) => block.name.toLowerCase() === name.toLowerCase());
const getBlockByWeek = (week: number) => strengthBlocks.find((block) => week >= block.startWeek && week <= block.endWeek) ?? strengthBlocks[0];

const findBlockIndex = (settings: PeriodisationRecord | null) => {
  if (!settings) return 0;
  const byNameIndex = strengthBlocks.findIndex((block) => block.name.toLowerCase() === settings.current_block_name.toLowerCase());
  if (byNameIndex >= 0) return byNameIndex;
  return strengthBlocks.findIndex((block) => settings.current_week >= block.startWeek && settings.current_week <= block.endWeek);
};

const matchesTemplate = (programme: LibraryProgramme, template: ProgrammeTemplate) => {
  const searchable = `${cleanText(programme.name)} ${cleanText(programme.category)} ${cleanText(programme.goal)} ${cleanText(programme.description)}`.toLowerCase();
  if (template === 'upper_lower') return searchable.includes('upper') && searchable.includes('lower');
  return searchable.includes('full body') || searchable.includes('full-body') || searchable.includes('fullbody');
};

const blockPayload = (block: StrengthBlock) => ({
  current_block_name: block.name,
  current_block_start_week: block.startWeek,
  current_block_end_week: block.endWeek,
  current_block_goal: block.goal,
  client_explanation: block.clientExplanation,
  next_block_name: block.nextBlock,
  loading_guide: block.loadingGuide,
  client_visible: true,
});

export function EditPlanPeriodisationPanel({ clientId, programs }: Props) {
  const [periodisationType, setPeriodisationType] = useState<PeriodisationType>('strength');
  const [programmeTemplate, setProgrammeTemplate] = useState<ProgrammeTemplate>('upper_lower');
  const [startWithCalibration, setStartWithCalibration] = useState(true);
  const [libraryProgrammes, setLibraryProgrammes] = useState<LibraryProgramme[]>([]);
  const [selectedLibraryProgrammeId, setSelectedLibraryProgrammeId] = useState('');
  const [settingsByProgram, setSettingsByProgram] = useState<Record<string, PeriodisationRecord>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeProgram = programs.find((program) => program.status === 'active') ?? programs[0] ?? null;
  const activeSettings = activeProgram ? settingsByProgram[activeProgram.id] ?? null : null;

  const matchingLibraryProgrammes = useMemo(() => {
    const matches = libraryProgrammes.filter((programme) => matchesTemplate(programme, programmeTemplate));
    return matches.length > 0 ? matches : libraryProgrammes;
  }, [libraryProgrammes, programmeTemplate]);

  const selectedLibraryProgramme = useMemo(() => {
    return matchingLibraryProgrammes.find((programme) => programme.id === selectedLibraryProgrammeId) ?? matchingLibraryProgrammes[0] ?? null;
  }, [matchingLibraryProgrammes, selectedLibraryProgrammeId]);

  useEffect(() => {
    const loadPeriodisationControls = async () => {
      setError(null);
      setMessage(null);

      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setLoading(false);
        return;
      }

      setLoading(true);
      const supabase = createClient();
      const programIds = programs.map((program) => program.id);

      const [libraryResult, settingsResult] = await Promise.all([
        supabase
          .from('library_programmes')
          .select('id, name, category, goal, description')
          .eq('is_active', true)
          .order('category')
          .order('name'),
        programIds.length > 0
          ? supabase
              .from('program_periodisation_settings')
              .select('id, program_id, programme_length_weeks, current_week, current_block_name, current_block_start_week, current_block_end_week, current_block_goal, client_explanation, next_block_name, loading_guide, client_visible')
              .in('program_id', programIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (libraryResult.error || settingsResult.error) {
        setError(libraryResult.error?.message || settingsResult.error?.message || 'Could not load periodisation controls.');
        setLoading(false);
        return;
      }

      const loadedLibraryProgrammes = (libraryResult.data ?? []) as LibraryProgramme[];
      const loadedSettings = (settingsResult.data ?? []) as PeriodisationRecord[];
      const settingsMap = loadedSettings.reduce<Record<string, PeriodisationRecord>>((acc, row) => {
        acc[row.program_id] = row;
        return acc;
      }, {});

      setLibraryProgrammes(loadedLibraryProgrammes);
      setSettingsByProgram(settingsMap);
      setLoading(false);
    };

    loadPeriodisationControls();
  }, [programs]);

  useEffect(() => {
    const firstMatch = matchingLibraryProgrammes[0];
    if (firstMatch && !matchingLibraryProgrammes.some((programme) => programme.id === selectedLibraryProgrammeId)) {
      setSelectedLibraryProgrammeId(firstMatch.id);
    }
  }, [matchingLibraryProgrammes, selectedLibraryProgrammeId]);

  const startPeriodisation = async () => {
    if (!isSupabaseConfigured || !selectedLibraryProgramme) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const selectedBlock = startWithCalibration ? strengthBlocks[0] : strengthBlocks[1];
    const programmeTitle = `Strength - ${templateLabel(programmeTemplate)}${startWithCalibration ? ' - Calibration start' : ''}`;

    const { data: newProgramId, error: assignError } = await supabase.rpc('assign_library_programme_to_client', {
      p_client_id: clientId,
      p_library_programme_id: selectedLibraryProgramme.id,
      p_program_title: programmeTitle,
    });

    if (assignError || !newProgramId) {
      setError(assignError?.message || 'Could not start periodisation.');
      setSaving(false);
      return;
    }

    const { error: settingsError } = await supabase
      .from('program_periodisation_settings')
      .upsert(
        {
          program_id: newProgramId as string,
          client_id: clientId,
          programme_length_weeks: 12,
          current_week: selectedBlock.startWeek,
          ...blockPayload(selectedBlock),
        },
        { onConflict: 'program_id' }
      );

    if (settingsError) {
      setError(settingsError.message);
      setSaving(false);
      return;
    }

    setMessage('Periodisation started. Reloading client plan...');
    window.setTimeout(() => window.location.reload(), 600);
  };

  const extendCurrentBlock = async () => {
    if (!isSupabaseConfigured || !activeProgram) return;

    const currentIndex = Math.max(findBlockIndex(activeSettings), 0);
    const currentBlock = activeSettings ? getBlockByName(activeSettings.current_block_name) ?? getBlockByWeek(activeSettings.current_week) : strengthBlocks[currentIndex];
    const currentEndWeek = activeSettings?.current_block_end_week ?? currentBlock.endWeek;
    const currentLength = activeSettings?.programme_length_weeks ?? 12;

    setActionLoading('extend');
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('program_periodisation_settings')
      .upsert(
        {
          program_id: activeProgram.id,
          client_id: clientId,
          programme_length_weeks: currentLength + 1,
          current_week: activeSettings?.current_week ?? currentBlock.startWeek,
          ...blockPayload(currentBlock),
          current_block_end_week: currentEndWeek + 1,
        },
        { onConflict: 'program_id' }
      );

    if (updateError) {
      setError(updateError.message);
      setActionLoading(null);
      return;
    }

    setMessage(`${currentBlock.name} extended by 1 week. Reloading...`);
    window.setTimeout(() => window.location.reload(), 600);
  };

  const startNextBlock = async () => {
    if (!isSupabaseConfigured || !activeProgram) return;

    const currentIndex = Math.max(findBlockIndex(activeSettings), 0);
    const nextBlock = strengthBlocks[Math.min(currentIndex + 1, strengthBlocks.length - 1)];
    const currentLength = activeSettings?.programme_length_weeks ?? 12;

    setActionLoading('next');
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('program_periodisation_settings')
      .upsert(
        {
          program_id: activeProgram.id,
          client_id: clientId,
          programme_length_weeks: currentLength,
          current_week: nextBlock.startWeek,
          ...blockPayload(nextBlock),
        },
        { onConflict: 'program_id' }
      );

    if (updateError) {
      setError(updateError.message);
      setActionLoading(null);
      return;
    }

    setMessage(`Started ${nextBlock.name}. Reloading...`);
    window.setTimeout(() => window.location.reload(), 600);
  };

  const currentBlock = activeSettings ? getBlockByName(activeSettings.current_block_name) ?? getBlockByWeek(activeSettings.current_week) : strengthBlocks[0];
  const nextBlockAvailable = activeSettings ? findBlockIndex(activeSettings) < strengthBlocks.length - 1 : true;

  return (
    <section>
      <SectionHeader title="PERIODISATION SETUP" accent />
      <Card className="space-y-5">
        {message && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">{message}</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

        {loading ? (
          <p className="text-sm text-gray-600">Loading periodisation controls...</p>
        ) : !activeProgram ? (
          <div className="space-y-5">
            <div>
              <p className="text-lg font-black uppercase text-[#000000]">New Periodisation</p>
              <p className="mt-1 text-sm text-gray-600">Create the client plan, copy the selected training template, and start the first block.</p>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase text-gray-500">Select periodisation type</p>
              <div className="flex flex-wrap gap-2">
                {periodisationTypes.map((type) => (
                  <button key={type.value} type="button" disabled={type.disabled} onClick={() => setPeriodisationType(type.value)} className={`rounded-lg border px-4 py-2 text-xs font-black uppercase ${periodisationType === type.value ? 'border-[#FA0201] bg-red-50 text-[#FA0201]' : 'border-gray-300 bg-white text-[#000000]'} disabled:cursor-not-allowed disabled:opacity-50`}>
                    {type.label}{type.disabled ? ' - soon' : ''}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase text-gray-500">Select programme template</p>
              <div className="flex flex-wrap gap-2">
                {programmeTemplates.map((template) => (
                  <button key={template.value} type="button" onClick={() => setProgrammeTemplate(template.value)} className={`rounded-lg border px-4 py-2 text-xs font-black uppercase ${programmeTemplate === template.value ? 'border-[#FA0201] bg-red-50 text-[#FA0201]' : 'border-gray-300 bg-white text-[#000000]'}`}>
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-gray-500">Matched Library Programme</label>
              <select value={selectedLibraryProgramme?.id ?? ''} onChange={(event) => setSelectedLibraryProgrammeId(event.target.value)} className="w-full rounded-lg border-2 border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-[#000000]">
                {matchingLibraryProgrammes.map((programme) => <option key={programme.id} value={programme.id}>{cleanText(programme.name, 'Untitled programme')}</option>)}
              </select>
              <p className="mt-2 text-xs font-semibold uppercase text-gray-500">This copies the selected Library programme into the client plan.</p>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input type="checkbox" checked={startWithCalibration} onChange={(event) => setStartWithCalibration(event.target.checked)} />
              Start periodisation with calibration
            </label>

            <button type="button" disabled={saving || !selectedLibraryProgramme} onClick={startPeriodisation} className="rounded-lg bg-[#FA0201] px-5 py-3 text-sm font-black uppercase text-white hover:bg-red-700 disabled:opacity-60">
              {saving ? 'Starting periodisation...' : 'Start Periodisation'}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-lg font-black uppercase text-[#000000]">Periodisation Controls</p>
                <p className="mt-1 text-sm text-gray-600">Adjust the current block or move the client forward, then edit workouts if needed.</p>
              </div>
              <Badge variant="success">Active programme</Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase text-gray-500">Week</p>
                <p className="mt-2 text-xl font-black text-[#000000]">Week {activeSettings?.current_week ?? currentBlock.startWeek} of {activeSettings?.programme_length_weeks ?? 12}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase text-gray-500">Current block</p>
                <p className="mt-2 text-xl font-black text-[#000000]">{activeSettings?.current_block_name ?? currentBlock.name}</p>
              </div>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-bold uppercase text-gray-500">Next block</p>
                <p className="mt-2 text-xl font-black text-[#000000]">{activeSettings?.next_block_name ?? currentBlock.nextBlock}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row">
              <button type="button" onClick={extendCurrentBlock} disabled={Boolean(actionLoading)} className="rounded-lg border border-gray-300 bg-white px-4 py-3 text-xs font-black uppercase text-[#000000] hover:bg-gray-50 disabled:opacity-60">
                {actionLoading === 'extend' ? 'Extending...' : 'Extend current block by 1 week'}
              </button>
              <button type="button" onClick={startNextBlock} disabled={Boolean(actionLoading) || !nextBlockAvailable} className="rounded-lg bg-[#FA0201] px-4 py-3 text-xs font-black uppercase text-white hover:bg-red-700 disabled:opacity-60">
                {actionLoading === 'next' ? 'Starting next block...' : 'Start Next Block'}
              </button>
              <Link href={`/coach/clients/${clientId}/current-workouts`} className="rounded-lg bg-black px-4 py-3 text-center text-xs font-black uppercase text-white hover:bg-gray-900">
                Edit upcoming workouts
              </Link>
            </div>
          </div>
        )}
      </Card>
    </section>
  );
}
