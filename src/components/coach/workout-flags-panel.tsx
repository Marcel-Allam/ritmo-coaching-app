import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';

type FlagTone = 'critical' | 'warning' | 'positive' | 'info';
type ProgramExerciseRecord = { id: string; exercise_order: number; exercise_name: string; notes: string | null };
type ProgramSetRecord = { id: string; exercise_id: string; set_order: number; target_reps: string | null; target_weight_kg: number | null; target_rpe: number | null; notes: string | null };
type PerformedSetRecord = { id: string; program_exercise_id: string; program_set_id: string | null; set_order: number; actual_weight_kg: number | null; actual_reps: number | null; actual_rpe: number | null; completed: boolean; notes: string | null };

type WorkoutFlag = { id: string; tone: FlagTone; label: string; exerciseName?: string; detail: string; impact: string };

type GroupedWorkoutFlag = WorkoutFlag & { details: string[]; exerciseNames: string[] };

type WorkoutFlagsPanelProps = {
  exercises: ProgramExerciseRecord[];
  setsByExercise: Record<string, ProgramSetRecord[]>;
  performedByProgramSetId: Record<string, PerformedSetRecord>;
  performedSets: PerformedSetRecord[];
  workoutNote: string | null | undefined;
};

const flagClasses: Record<FlagTone, string> = {
  critical: 'border-red-200 bg-red-50 text-red-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  positive: 'border-green-200 bg-green-50 text-green-900',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
};

const flagLabelClasses: Record<FlagTone, string> = {
  critical: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  positive: 'bg-green-100 text-green-700',
  info: 'bg-blue-100 text-blue-700',
};

const noteAlertWords = [
  [112, 97, 105, 110],
  [104, 117, 114, 116],
  [116, 119, 101, 97, 107],
  [115, 104, 97, 114, 112],
  [100, 105, 115, 99, 111, 109, 102, 111, 114, 116],
  [107, 110, 101, 101],
  [115, 104, 111, 117, 108, 100, 101, 114],
  [98, 97, 99, 107],
  [101, 108, 98, 111, 119],
  [119, 114, 105, 115, 116],
  [104, 105, 112],
  [97, 110, 107, 108, 101],
].map((codes) => String.fromCharCode(...codes));

const parseTargetReps = (value: string | null) => {
  if (!value) return { min: null as number | null, max: null as number | null };
  const rangeMatch = value.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) return { min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) };
  const singleMatch = value.match(/\d+/);
  if (!singleMatch) return { min: null, max: null };
  const parsed = Number(singleMatch[0]);
  return { min: parsed, max: parsed };
};

const hasNoteAlertLanguage = (value: string | null | undefined) => {
  const text = (value || '').toLowerCase();
  return noteAlertWords.some((keyword) => text.includes(keyword));
};

const groupWorkoutFlags = (flags: WorkoutFlag[]) => {
  const grouped = new Map<string, GroupedWorkoutFlag>();

  flags.forEach((flag) => {
    const key = [flag.tone, flag.label, flag.impact].join('|');
    const detail = flag.exerciseName ? `${flag.exerciseName} - ${flag.detail}` : flag.detail;
    const existing = grouped.get(key);

    if (existing) {
      existing.details.push(detail);
      if (flag.exerciseName && !existing.exerciseNames.includes(flag.exerciseName)) {
        existing.exerciseNames.push(flag.exerciseName);
      }
      existing.id = `${existing.id}-${flag.id}`;
      return;
    }

    grouped.set(key, {
      ...flag,
      exerciseName: flag.exerciseName,
      details: [detail],
      exerciseNames: flag.exerciseName ? [flag.exerciseName] : [],
    });
  });

  return Array.from(grouped.values()).map((flag) => ({
    ...flag,
    exerciseName: flag.exerciseNames.length === 1 ? flag.exerciseNames[0] : undefined,
    detail: flag.details.length === 1 ? flag.details[0] : flag.details.join('\n'),
  }));
};

const buildWorkoutFlags = ({ exercises, setsByExercise, performedByProgramSetId, performedSets, workoutNote }: WorkoutFlagsPanelProps) => {
  const flags: WorkoutFlag[] = [];

  if (hasNoteAlertLanguage(workoutNote)) {
    flags.push({
      id: 'workout-note-alert',
      tone: 'critical',
      label: 'Client note alert',
      detail: `Workout note: ${workoutNote}`,
      impact: 'Review this before increasing training stress or progressing the session plan.',
    });
  }

  exercises.forEach((exercise) => {
    const targetSets = setsByExercise[exercise.id] || [];
    let issueCount = 0;
    let loggedSetCount = 0;
    let completedSetCount = 0;

    const addIssue = () => {
      issueCount += 1;
    };

    targetSets.forEach((set) => {
      const actual = performedByProgramSetId[set.id] || performedSets.find((performed) => performed.program_exercise_id === exercise.id && performed.set_order === set.set_order);
      const targetReps = parseTargetReps(set.target_reps);

      if (actual) loggedSetCount += 1;
      if (actual?.completed) completedSetCount += 1;

      if (!actual?.completed) {
        addIssue();
        flags.push({
          id: `${exercise.id}-${set.id}-incomplete`,
          tone: 'critical',
          label: 'Incomplete set',
          exerciseName: exercise.exercise_name,
          detail: `Set ${set.set_order} was not completed.`,
          impact: 'The prescribed work was not completed. Check time, fatigue, movement difficulty, or client notes before progressing.',
        });
      }

      if (actual?.actual_reps !== null && actual?.actual_reps !== undefined && targetReps.min !== null && actual.actual_reps < targetReps.min) {
        addIssue();
        flags.push({
          id: `${exercise.id}-${set.id}-missed-reps`,
          tone: 'warning',
          label: 'Missed reps',
          exerciseName: exercise.exercise_name,
          detail: `Set ${set.set_order}: ${actual.actual_reps} reps completed vs ${targetReps.min}${targetReps.max && targetReps.max !== targetReps.min ? `-${targetReps.max}` : ''} planned.`,
          impact: 'The load or volume may be too aggressive, or the client may be under-recovered for this exercise.',
        });
      }

      if (actual?.actual_weight_kg !== null && actual?.actual_weight_kg !== undefined && set.target_weight_kg !== null && set.target_weight_kg !== undefined && actual.actual_weight_kg < set.target_weight_kg) {
        addIssue();
        flags.push({
          id: `${exercise.id}-${set.id}-load-below`,
          tone: 'warning',
          label: 'Load below prescribed',
          exerciseName: exercise.exercise_name,
          detail: `Set ${set.set_order}: ${actual.actual_weight_kg}kg used vs ${set.target_weight_kg}kg planned.`,
          impact: 'The planned loading stimulus was not achieved. Check whether this was sensible autoregulation, confidence, equipment, or fatigue.',
        });
      }

      if (actual?.actual_rpe !== null && actual?.actual_rpe !== undefined && set.target_rpe !== null && set.target_rpe !== undefined && actual.actual_rpe - set.target_rpe >= 1) {
        addIssue();
        flags.push({
          id: `${exercise.id}-${set.id}-rpe-above`,
          tone: 'warning',
          label: 'RPE above target',
          exerciseName: exercise.exercise_name,
          detail: `Set ${set.set_order}: RPE ${actual.actual_rpe} vs target RPE ${set.target_rpe}.`,
          impact: 'The work created more fatigue than expected. Consider holding load, reducing load, reducing volume, or checking recovery.',
        });
      }

      if (hasNoteAlertLanguage(actual?.notes)) {
        addIssue();
        flags.push({
          id: `${exercise.id}-${set.id}-note-alert`,
          tone: 'critical',
          label: 'Client note alert',
          exerciseName: exercise.exercise_name,
          detail: `Set ${set.set_order} note: ${actual?.notes}`,
          impact: 'Review this before increasing training stress or progressing the session plan.',
        });
      }
    });

    if (issueCount >= 2) {
      flags.push({
        id: `${exercise.id}-exercise-issue`,
        tone: 'critical',
        label: 'Exercise-level issue',
        exerciseName: exercise.exercise_name,
        detail: `${issueCount} issues detected within this exercise.`,
        impact: 'The issue is likely specific to this movement. Review load, reps, rest, technique cue, volume, or exercise selection.',
      });
    }

    if (targetSets.length > 0 && loggedSetCount > 0 && completedSetCount === targetSets.length && issueCount === 0) {
      flags.push({
        id: `${exercise.id}-strong`,
        tone: 'positive',
        label: 'Strong performance',
        exerciseName: exercise.exercise_name,
        detail: 'All prescribed sets were completed without a major negative flag.',
        impact: 'Positive progression signal. Consider normal progression if execution and recovery are acceptable.',
      });
    }
  });

  return groupWorkoutFlags(flags);
};

export function WorkoutFlagsPanel(props: WorkoutFlagsPanelProps) {
  const flags = buildWorkoutFlags(props);

  return (
    <section>
      <SectionHeader title="WORKOUT FLAGS" accent />
      <Card className="p-4">
        {flags.length === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-900">
            <p className="text-xs font-bold uppercase">No flags detected</p>
            <p className="mt-1 text-xs">Nothing major needs immediate attention from the logged workout data.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {flags.map((flag) => (
              <div key={flag.id} className={`rounded-lg border p-3 ${flagClasses[flag.tone]}`}>
                <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-xs font-black uppercase">{flag.label}</p>
                    {flag.exerciseName && <p className="mt-0.5 text-[11px] font-bold uppercase opacity-70">{flag.exerciseName}</p>}
                  </div>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${flagLabelClasses[flag.tone]}`}>{flag.tone}</span>
                </div>
                <p className="mt-2 whitespace-pre-line text-xs font-semibold">{flag.detail}</p>
                <p className="mt-1 text-[11px] opacity-80"><span className="font-bold">Impact:</span> {flag.impact}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}
