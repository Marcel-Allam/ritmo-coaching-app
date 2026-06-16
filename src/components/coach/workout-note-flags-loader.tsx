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

type WorkoutNoteFlagsLoaderProps = {
  sessionId: string;
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
      <div className="px-6 pt-6 md:px-8 md:pt-8">
        <Card className="border-2 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-700">{error}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-6 pt-6 md:px-8 md:pt-8">
      <section>
        <SectionHeader title="CLIENT NOTE FLAGS" accent />
        <Card>
          <div className="space-y-3">
            {noteFlags.map((flag) => (
              <div key={flag.id} className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-black uppercase">Client note added</p>
                    <p className="mt-1 text-xs font-bold uppercase opacity-70">{flag.exerciseName} • Set {flag.setOrder}</p>
                  </div>
                  <span className="rounded bg-blue-100 px-2 py-1 text-xs font-bold uppercase text-blue-700">info</span>
                </div>
                <p className="mt-3 text-sm font-semibold">{flag.note}</p>
                <p className="mt-1 text-xs opacity-80"><span className="font-bold">Impact:</span> Read this before writing feedback. The note may explain the client&apos;s performance on this set.</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
