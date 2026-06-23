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
  client_id: string;
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

type CalibrationLiftRecord = {
  id: string;
  program_id: string;
  lift_name: string;
  top_set_weight_kg: number | string;
  top_set_reps: number;
  estimated_1rm_kg: number | string | null;
};

type Draft = {
  programme_length_weeks: string;
  current_week: string;
  current_block_name: string;
  current_block_start_week: string;
  current_block_end_week: string;
  current_block_goal: string;
  client_explanation: string;
  next_block_name: string;
  loading_guide: string;
  client_visible: boolean;
};

type Props = { clientId: string; programs: ProgramSummary[] };

const labelClass = 'text-xs font-bold uppercase text-gray-500';
const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-[#000000] outline-none focus:border-[#FA0201]';
const textareaClass = `${inputClass} min-h-[86px] resize-y`;

const defaultDraft = (row?: PeriodisationRecord): Draft => ({
  programme_length_weeks: String(row?.programme_length_weeks ?? 12),
  current_week: String(row?.current_week ?? 0),
  current_block_name: row?.current_block_name ?? 'Calibration',
  current_block_start_week: String(row?.current_block_start_week ?? 0),
  current_block_end_week: String(row?.current_block_end_week ?? 0),
  current_block_goal: row?.current_block_goal ?? 'Establish accurate starting points before the main training block.',
  client_explanation: row?.client_explanation ?? 'This week gives us a clear baseline so future loading can be planned from actual performance.',
  next_block_name: row?.next_block_name ?? 'Accumulation',
  loading_guide: row?.loading_guide ?? 'Use calibration e1RM values to guide loading decisions.',
  client_visible: row?.client_visible ?? true,
});

const optionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const formatKg = (value: number | string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return `${parsed.toFixed(1)}kg`;
};

export function CoachPeriodisationSection({ clientId, programs }: Props) {
  const [rowsByProgram, setRowsByProgram] = useState<Record<string, PeriodisationRecord>>({});
  const [draftsByProgram, setDraftsByProgram] = useState<Record<string, Draft>>({});
  const [liftsByProgram, setLiftsByProgram] = useState<Record<string, CalibrationLiftRecord[]>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setMessage(null);
      setError(null);

      if (programs.length === 0) {
        setRowsByProgram({});
        setDraftsByProgram({});
        setLiftsByProgram({});
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
      const [settingsResult, liftsResult] = await Promise.all([
        supabase
          .from('program_periodisation_settings')
          .select('id, program_id, client_id, programme_length_weeks, current_week, current_block_name, current_block_start_week, current_block_end_week, current_block_goal, client_explanation, next_block_name, loading_guide, client_visible')
          .in('program_id', programIds),
        supabase
          .from('program_calibration_lifts')
          .select('id, program_id, lift_name, top_set_weight_kg, top_set_reps, estimated_1rm_kg')
          .in('program_id', programIds)
          .order('lift_name', { ascending: true }),
      ]);

      if (settingsResult.error || liftsResult.error) {
        setError(settingsResult.error?.message || liftsResult.error?.message || 'Could not load periodisation data.');
        setLoading(false);
        return;
      }

      const settingsRows = (settingsResult.data ?? []) as PeriodisationRecord[];
      const liftRows = (liftsResult.data ?? []) as CalibrationLiftRecord[];

      const settingsMap = settingsRows.reduce<Record<string, PeriodisationRecord>>((acc, row) => {
        acc[row.program_id] = row;
        return acc;
      }, {});

      const liftMap = liftRows.reduce<Record<string, CalibrationLiftRecord[]>>((acc, row) => {
        acc[row.program_id] = [...(acc[row.program_id] ?? []), row];
        return acc;
      }, {});

      const draftMap = programs.reduce<Record<string, Draft>>((acc, program) => {
        acc[program.id] = defaultDraft(settingsMap[program.id]);
        return acc;
      }, {});

      setRowsByProgram(settingsMap);
      setDraftsByProgram(draftMap);
      setLiftsByProgram(liftMap);
      setLoading(false);
    };

    loadData();
  }, [programs]);

  const updateDraft = (programId: string, patch: Partial<Draft>) => {
    setDraftsByProgram((current) => ({
      ...current,
      [programId]: { ...(current[programId] ?? defaultDraft()), ...patch },
    }));
  };

  const saveDraft = async (program: ProgramSummary) => {
    if (!isSupabaseConfigured) return;

    const draft = draftsByProgram[program.id] ?? defaultDraft();
    const programmeLength = Number(draft.programme_length_weeks);
    const currentWeek = Number(draft.current_week);
    const blockStartWeek = Number(draft.current_block_start_week);
    const blockEndWeek = Number(draft.current_block_end_week);

    if (!Number.isInteger(programmeLength) || programmeLength < 1) {
      setError('Programme length must be a whole number above 0.');
      return;
    }

    if (!Number.isInteger(currentWeek) || currentWeek < 0 || currentWeek > programmeLength) {
      setError('Current week must sit between 0 and the programme length.');
      return;
    }

    if (!Number.isInteger(blockStartWeek) || !Number.isInteger(blockEndWeek) || blockStartWeek < 0 || blockEndWeek < blockStartWeek) {
      setError('Block start/end weeks must be valid, with end week after start week.');
      return;
    }

    setSavingId(program.id);
    setMessage(null);
    setError(null);

    const supabase = createClient();
    const { data, error: saveError } = await supabase
      .from('program_periodisation_settings')
      .upsert(
        {
          program_id: program.id,
          client_id: clientId,
          programme_length_weeks: programmeLength,
          current_week: currentWeek,
          current_block_name: draft.current_block_name.trim() || 'Calibration',
          current_block_start_week: blockStartWeek,
          current_block_end_week: blockEndWeek,
          current_block_goal: optionalText(draft.current_block_goal),
          client_explanation: optionalText(draft.client_explanation),
          next_block_name: optionalText(draft.next_block_name),
          loading_guide: optionalText(draft.loading_guide),
          client_visible: draft.client_visible,
        },
        { onConflict: 'program_id' }
      )
      .select('id, program_id, client_id, programme_length_weeks, current_week, current_block_name, current_block_start_week, current_block_end_week, current_block_goal, client_explanation, next_block_name, loading_guide, client_visible')
      .single();

    if (saveError) {
      setError(saveError.message);
      setSavingId(null);
      return;
    }

    const savedRow = data as PeriodisationRecord;
    setRowsByProgram((current) => ({ ...current, [program.id]: savedRow }));
    setDraftsByProgram((current) => ({ ...current, [program.id]: defaultDraft(savedRow) }));
    setMessage(`Periodisation updated for ${program.title || 'programme'}.`);
    setSavingId(null);
  };

  return (
    <section>
      <SectionHeader title="PERIODISATION" accent />
      <Card>
        {programs.length === 0 ? (
          <p className="text-sm text-gray-600">No active programme found yet. Add a programme before setting the 12-week trajectory.</p>
        ) : loading ? (
          <p className="text-sm text-gray-600">Loading periodisation...</p>
        ) : (
          <div className="space-y-5">
            {message && <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700">{message}</div>}
            {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

            {programs.map((program) => {
              const draft = draftsByProgram[program.id] ?? defaultDraft();
              const savedRow = rowsByProgram[program.id];
              const lifts = liftsByProgram[program.id] ?? [];

              return (
                <div key={program.id} className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-4">
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase text-[#FA0201]">Programme trajectory</p>
                      <h2 className="text-xl font-black uppercase text-[#000000]">{program.title || 'Untitled programme'}</h2>
                      <p className="mt-1 text-sm text-gray-600">Manual block control for the coach. This does not auto-generate workouts.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="default">Week {draft.current_week || '0'} of {draft.programme_length_weeks || '12'}</Badge>
                      <Badge variant={savedRow ? 'success' : 'warning'}>{savedRow ? 'Saved' : 'Default draft'}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label><span className={labelClass}>Programme length</span><input className={inputClass} min="1" type="number" value={draft.programme_length_weeks} onChange={(event) => updateDraft(program.id, { programme_length_weeks: event.target.value })} /></label>
                    <label><span className={labelClass}>Current week</span><input className={inputClass} min="0" type="number" value={draft.current_week} onChange={(event) => updateDraft(program.id, { current_week: event.target.value })} /></label>
                    <label><span className={labelClass}>Block start week</span><input className={inputClass} min="0" type="number" value={draft.current_block_start_week} onChange={(event) => updateDraft(program.id, { current_block_start_week: event.target.value })} /></label>
                    <label><span className={labelClass}>Block end week</span><input className={inputClass} min="0" type="number" value={draft.current_block_end_week} onChange={(event) => updateDraft(program.id, { current_block_end_week: event.target.value })} /></label>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <label><span className={labelClass}>Current block</span><input className={inputClass} value={draft.current_block_name} onChange={(event) => updateDraft(program.id, { current_block_name: event.target.value })} /></label>
                    <label><span className={labelClass}>Next block</span><input className={inputClass} value={draft.next_block_name} onChange={(event) => updateDraft(program.id, { next_block_name: event.target.value })} /></label>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <label><span className={labelClass}>Block goal</span><textarea className={textareaClass} value={draft.current_block_goal} onChange={(event) => updateDraft(program.id, { current_block_goal: event.target.value })} /></label>
                    <label><span className={labelClass}>Client explanation</span><textarea className={textareaClass} value={draft.client_explanation} onChange={(event) => updateDraft(program.id, { client_explanation: event.target.value })} /></label>
                    <label><span className={labelClass}>Loading guide</span><textarea className={textareaClass} value={draft.loading_guide} onChange={(event) => updateDraft(program.id, { loading_guide: event.target.value })} /></label>
                  </div>

                  <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-bold uppercase text-gray-500">Calibration estimates</p>
                        <p className="mt-1 text-sm text-gray-600">Saved key lift estimates will appear here after calibration values exist.</p>
                      </div>
                      <Badge variant="default">e1RM: weight x (1 + reps / 30)</Badge>
                    </div>
                    {lifts.length === 0 ? (
                      <p className="mt-3 text-sm font-semibold text-gray-500">No calibration lifts saved yet.</p>
                    ) : (
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                        {lifts.map((lift) => (
                          <div key={lift.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                            <p className="text-xs font-bold uppercase text-[#FA0201]">{lift.lift_name}</p>
                            <p className="mt-1 text-lg font-black text-[#000000]">{formatKg(lift.estimated_1rm_kg)}</p>
                            <p className="text-xs font-semibold text-gray-600">Top set: {formatKg(lift.top_set_weight_kg)} x {lift.top_set_reps}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <input type="checkbox" checked={draft.client_visible} onChange={(event) => updateDraft(program.id, { client_visible: event.target.checked })} />
                      Show this trajectory to the client when the client card is added
                    </label>
                    <button type="button" onClick={() => saveDraft(program)} disabled={savingId === program.id} className="rounded-lg bg-[#FA0201] px-4 py-2 text-xs font-bold uppercase text-white hover:bg-red-700 disabled:opacity-60">
                      {savingId === program.id ? 'Saving...' : 'Save periodisation'}
                    </button>
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
