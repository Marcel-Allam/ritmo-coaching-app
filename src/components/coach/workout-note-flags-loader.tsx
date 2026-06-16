'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

type PerformedSetNoteRecord = {
  id: string;
  program_exercise_id: string;
  set_order: number;
  notes: string | null;
};

type ProgramExerciseRecord = {
  id: string;
  exercise_name: string;
};

type NoteFlag = {
  id: string;
  exerciseName: string;
  setOrder: number;
  note: string;
};

type GroupedNoteFlag = {
  id: string;
  exerciseName: string;
  notes: string[];
};

type WorkoutNoteFlagsLoaderProps = {
  sessionId: string;
};

const groupNoteFlags = (flags: NoteFlag[]) => {
  const grouped = new Map<string, GroupedNoteFlag>();

  flags.forEach((flag) => {
    const existing = grouped.get(flag.exerciseName);
    const note = `Set ${flag.setOrder}: ${flag.note}`;

    if (existing) {
      existing.notes.push(note);
      existing.id = `${existing.id}-${flag.id}`;
      return;
    }

    grouped.set(flag.exerciseName, {
      id: flag.id,
      exerciseName: flag.exerciseName,
      notes: [note],
    });
  });

  return Array.from(grouped.values());
};

export function WorkoutNoteFlagsLoader({ sessionId }: WorkoutNoteFlagsLoaderProps) {
  const [noteFlags, setNoteFlags] = useState<NoteFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadNoteFlags = async () => {
      if (!isSupabaseConfigured) {
        setError('Supabase environment variables are not configured.');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      const { data: performedData, error: performedError } = await supabase
        .from('performed_sets')
        .select('id, program_exercise_id, set_order, notes')
        .eq('session_id', sessionId)
        .not('notes', 'is', null)
        .order('set_order', { ascending: true });

      if (performedError) {
        setError(performedError.message);
        setIsLoading(false);
        return;
      }

      const notedSets = ((performedData ?? []) as PerformedSetNoteRecord[]).filter((set) => set.notes?.trim());
      const exerciseIds = [...new Set(notedSets.map((set) => set.program_exercise_id))];

      const { data: exerciseData, error: exerciseError } = exerciseIds.length
        ? await supabase.from('program_exercises').select('id, exercise_name').in('id', exerciseIds)
        : { data: [], error: null };

      if (exerciseError) {
        setError(exerciseError.message);
        setIsLoading(false);
        return;
      }

      const exerciseMap = ((exerciseData ?? []) as ProgramExerciseRecord[]).reduce<Record<string, string>>((acc, exercise) => {
        acc[exercise.id] = exercise.exercise_name;
        return acc;
      }, {});

      setNoteFlags(
        notedSets.map((set) => ({
          id: set.id,
          exerciseName: exerciseMap[set.program_exercise_id] || 'Exercise',
          setOrder: set.set_order,
          note: set.notes?.trim() || '',
        }))
      );
      setIsLoading(false);
    };

    loadNoteFlags();
  }, [sessionId]);

  if (isLoading || noteFlags.length === 0) return null;

  if (error) {
    return (
      <div className="px-6 pt-4 md:px-8 md:pt-5">
        <Card className="border-2 border-red-200 bg-red-50 p-4">
          <p className="text-xs font-semibold text-red-700">{error}</p>
        </Card>
      </div>
    );
  }

  const groupedFlags = groupNoteFlags(noteFlags);

  return (
    <div className="px-6 pt-4 md:px-8 md:pt-5">
      <section>
        <SectionHeader title="CLIENT NOTE FLAGS" accent />
        <Card className="p-4">
          <div className="space-y-2">
            {groupedFlags.map((flag) => (
              <div key={flag.id} className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900">
                <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase">Client notes added</p>
                    <p className="mt-0.5 text-[11px] font-bold uppercase opacity-70">{flag.exerciseName}</p>
                  </div>
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-700">info</span>
                </div>
                <p className="mt-2 text-xs font-semibold">{flag.notes.length} note{flag.notes.length === 1 ? '' : 's'}: {flag.notes.join(' • ')}</p>
                <p className="mt-1 text-[11px] opacity-80"><span className="font-bold">Impact:</span> Read before writing feedback. Notes may explain the client&apos;s performance.</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
