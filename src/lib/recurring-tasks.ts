type SupabaseClientLike = {
  from: (table: string) => any;
};

type ScheduleNextWeeklyTaskInput = {
  supabase: SupabaseClientLike;
  clientId: string;
  taskType: string;
  taskName: string;
  instructions: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const addDays = (dateIso: string, days: number) => {
  const date = new Date(`${dateIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const getNextWeeklyTaskDate = (completionDateIso = todayIso()) => {
  return addDays(completionDateIso, 7);
};

export const completeCurrentAndCreateNextWeeklyTask = async ({
  supabase,
  clientId,
  taskType,
  taskName,
  instructions,
}: ScheduleNextWeeklyTaskInput) => {
  const completionDate = todayIso();
  const nextTaskDate = getNextWeeklyTaskDate(completionDate);

  // A recurring weekly item should not create future duplicates while it is overdue.
  // Once the client completes the current item, close any active item of the same type
  // and create exactly one next weekly item seven days after the completion date.
  const deactivateResult = await supabase
    .from('assigned_tasks')
    .update({ active: false })
    .eq('client_id', clientId)
    .eq('task_type', taskType)
    .eq('active', true);

  if (deactivateResult.error) {
    return { error: deactivateResult.error, nextTaskDate: null };
  }

  const insertResult = await supabase.from('assigned_tasks').insert({
    client_id: clientId,
    task_name: taskName,
    task_type: taskType,
    frequency: 'weekly',
    required: true,
    start_date: nextTaskDate,
    end_date: nextTaskDate,
    active: true,
    instructions,
  });

  return { error: insertResult.error, nextTaskDate };
};
