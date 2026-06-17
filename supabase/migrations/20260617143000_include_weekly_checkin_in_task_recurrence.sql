create or replace function public.create_next_weekly_client_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_task_date date;
  v_task_name text;
  v_instructions text;
begin
  if new.submission_type not in ('training_availability', 'bodyweight', 'weekly_checkin') then
    return new;
  end if;

  v_next_task_date := coalesce(new.submitted_at, now())::date + 7;

  if new.submission_type = 'training_availability' then
    v_task_name := 'Submit training availability';
    v_instructions := 'Set your training days for the next week. Pick the days you can realistically train so your coach can schedule your workouts properly.';
  elsif new.submission_type = 'bodyweight' then
    v_task_name := 'Submit bodyweight check-in';
    v_instructions := 'Log your weekly bodyweight. Use the same weighing conditions where possible and add any useful context for your coach.';
  elsif new.submission_type = 'weekly_checkin' then
    v_task_name := 'Submit weekly check-in';
    v_instructions := 'Complete your weekly coaching check-in. Share your biggest win, biggest challenge, recovery issues, and what you need help with so your coach can adjust the plan.';
  end if;

  update public.assigned_tasks
  set active = false
  where client_id = new.client_id
    and task_type = new.submission_type
    and active = true;

  insert into public.assigned_tasks (
    client_id,
    task_name,
    task_type,
    frequency,
    required,
    start_date,
    end_date,
    active,
    instructions
  ) values (
    new.client_id,
    v_task_name,
    new.submission_type,
    'weekly',
    true,
    v_next_task_date,
    v_next_task_date,
    true,
    v_instructions
  );

  return new;
end;
$$;
