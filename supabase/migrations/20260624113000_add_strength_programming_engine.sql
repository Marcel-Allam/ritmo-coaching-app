-- RITMO strength programming engine foundation.
-- Adds exercise roles, %1RM prescriptions, calibration storage, and 12-week generated main-lift prescriptions.

alter table public.library_workout_exercises
add column if not exists exercise_role text not null default 'accessory'
check (exercise_role in ('main_lift', 'accessory'));

alter table public.program_exercises
add column if not exists exercise_role text not null default 'accessory'
check (exercise_role in ('main_lift', 'accessory'));

alter table public.library_workout_sets
add column if not exists target_percentage_1rm numeric(5,2),
add column if not exists calculated_target_load_kg numeric(6,2),
add column if not exists programme_week integer check (programme_week is null or programme_week > 0);

alter table public.program_sets
add column if not exists target_percentage_1rm numeric(5,2),
add column if not exists calculated_target_load_kg numeric(6,2),
add column if not exists programme_week integer check (programme_week is null or programme_week > 0);

alter table public.program_calibration_lifts
add column if not exists exercise_catalogue_id uuid references public.exercise_catalogue(id) on delete set null,
add column if not exists top_set_rpe numeric(3,1),
add column if not exists training_max_percentage numeric(5,2) not null default 92.5,
add column if not exists training_max_kg numeric(6,2);

create table if not exists public.program_main_lift_weekly_prescriptions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  exercise_catalogue_id uuid references public.exercise_catalogue(id) on delete set null,
  lift_name text not null,
  programme_week integer not null check (programme_week between 1 and 52),
  block_name text not null,
  target_percentage_1rm numeric(5,2) not null,
  target_reps text not null,
  target_rpe numeric(3,1),
  training_max_kg numeric(6,2) not null,
  calculated_target_load_kg numeric(6,2) not null,
  rounding_increment_kg numeric(4,2) not null default 2.5,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, lift_name, programme_week)
);

create index if not exists program_main_lift_weekly_prescriptions_program_idx
on public.program_main_lift_weekly_prescriptions(program_id);

create index if not exists program_main_lift_weekly_prescriptions_client_idx
on public.program_main_lift_weekly_prescriptions(client_id);

create index if not exists program_main_lift_weekly_prescriptions_exercise_idx
on public.program_main_lift_weekly_prescriptions(exercise_catalogue_id);

alter table public.program_main_lift_weekly_prescriptions enable row level security;

drop policy if exists "Coaches can manage main lift prescriptions" on public.program_main_lift_weekly_prescriptions;
create policy "Coaches can manage main lift prescriptions"
on public.program_main_lift_weekly_prescriptions
for all
using (public.is_coach())
with check (public.is_coach());

drop policy if exists "Clients can view own main lift prescriptions" on public.program_main_lift_weekly_prescriptions;
create policy "Clients can view own main lift prescriptions"
on public.program_main_lift_weekly_prescriptions
for select
using (
  exists (
    select 1
    from public.clients c
    where c.id = program_main_lift_weekly_prescriptions.client_id
      and c.user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.program_main_lift_weekly_prescriptions to authenticated;

drop trigger if exists set_program_main_lift_weekly_prescriptions_updated_at on public.program_main_lift_weekly_prescriptions;
create trigger set_program_main_lift_weekly_prescriptions_updated_at
before update on public.program_main_lift_weekly_prescriptions
for each row execute function public.set_updated_at();

create or replace function public.round_to_increment(p_value numeric, p_increment numeric default 2.5)
returns numeric
language sql
immutable
as $$
  select case
    when p_value is null then null
    when coalesce(p_increment, 0) <= 0 then round(p_value, 1)
    else round((p_value / p_increment)) * p_increment
  end;
$$;

create or replace function public.generate_main_lift_weekly_prescriptions(
  p_program_id uuid,
  p_client_id uuid,
  p_exercise_catalogue_id uuid,
  p_lift_name text,
  p_training_max_kg numeric,
  p_rounding_increment_kg numeric default 2.5
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_inserted_count integer;
begin
  if not public.is_coach() then
    raise exception 'Only coaches can generate main lift prescriptions.';
  end if;

  if p_training_max_kg is null or p_training_max_kg <= 0 then
    raise exception 'Training max must be greater than zero.';
  end if;

  delete from public.program_main_lift_weekly_prescriptions
  where program_id = p_program_id
    and lift_name = trim(p_lift_name);

  insert into public.program_main_lift_weekly_prescriptions (
    program_id,
    client_id,
    exercise_catalogue_id,
    lift_name,
    programme_week,
    block_name,
    target_percentage_1rm,
    target_reps,
    target_rpe,
    training_max_kg,
    calculated_target_load_kg,
    rounding_increment_kg,
    notes
  )
  select
    p_program_id,
    p_client_id,
    p_exercise_catalogue_id,
    trim(p_lift_name),
    week_number,
    block_name,
    target_percentage_1rm,
    target_reps,
    target_rpe,
    p_training_max_kg,
    public.round_to_increment(p_training_max_kg * (target_percentage_1rm / 100.0), coalesce(p_rounding_increment_kg, 2.5)),
    coalesce(p_rounding_increment_kg, 2.5),
    notes
  from (
    values
      (1, 'Calibration', 65.0::numeric, '5-8', 6.5::numeric, 'Use this week to capture a clean top set and estimate 1RM.'),
      (2, 'Accumulation', 67.5::numeric, '6-8', 7.0::numeric, 'Build repeatable volume with clean technique.'),
      (3, 'Accumulation', 70.0::numeric, '5-8', 7.0::numeric, 'Add load if week 2 was completed comfortably.'),
      (4, 'Accumulation', 72.5::numeric, '5-7', 7.5::numeric, 'Highest accumulation exposure before deload.'),
      (5, 'Deload', 62.5::numeric, '5-6', 6.0::numeric, 'Reduce fatigue and keep movement quality high.'),
      (6, 'Intensification', 75.0::numeric, '4-6', 7.5::numeric, 'Shift toward heavier strength work.'),
      (7, 'Intensification', 77.5::numeric, '4-6', 8.0::numeric, 'Progress load while keeping bar speed clean.'),
      (8, 'Intensification', 80.0::numeric, '3-5', 8.0::numeric, 'Heavy working sets; avoid grinders.'),
      (9, 'Deload', 65.0::numeric, '4-6', 6.5::numeric, 'Lower fatigue before realisation block.'),
      (10, 'Realisation', 82.5::numeric, '3-4', 8.0::numeric, 'Strength-focused loading with clean execution.'),
      (11, 'Realisation', 85.0::numeric, '2-4', 8.5::numeric, 'Heavy but technically consistent.'),
      (12, 'Test / Review', 90.0::numeric, '1-3', 9.0::numeric, 'Test a controlled heavy set or rep PR without forced failure.')
  ) as template(week_number, block_name, target_percentage_1rm, target_reps, target_rpe, notes);

  get diagnostics v_inserted_count = row_count;
  return v_inserted_count;
end;
$$;

create or replace function public.save_calibration_lift_and_generate_prescriptions(
  p_program_id uuid,
  p_client_id uuid,
  p_exercise_catalogue_id uuid,
  p_lift_name text,
  p_top_set_weight_kg numeric,
  p_top_set_reps integer,
  p_top_set_rpe numeric default null,
  p_training_max_percentage numeric default 92.5,
  p_source_session_id uuid default null,
  p_source_performed_set_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_lift_id uuid;
  v_estimated_1rm numeric;
  v_training_max_kg numeric;
begin
  if not public.is_coach() then
    raise exception 'Only coaches can save calibration lifts.';
  end if;

  if nullif(trim(p_lift_name), '') is null then
    raise exception 'Lift name is required.';
  end if;

  if p_top_set_weight_kg is null or p_top_set_weight_kg <= 0 then
    raise exception 'Top set weight must be greater than zero.';
  end if;

  if p_top_set_reps is null or p_top_set_reps <= 0 then
    raise exception 'Top set reps must be greater than zero.';
  end if;

  v_estimated_1rm := round((p_top_set_weight_kg * (1 + (p_top_set_reps::numeric / 30.0))), 1);
  v_training_max_kg := public.round_to_increment(v_estimated_1rm * (coalesce(p_training_max_percentage, 92.5) / 100.0), 2.5);

  insert into public.program_calibration_lifts (
    program_id,
    client_id,
    exercise_catalogue_id,
    lift_name,
    top_set_weight_kg,
    top_set_reps,
    top_set_rpe,
    training_max_percentage,
    training_max_kg,
    source_session_id,
    source_performed_set_id,
    notes
  )
  values (
    p_program_id,
    p_client_id,
    p_exercise_catalogue_id,
    trim(p_lift_name),
    p_top_set_weight_kg,
    p_top_set_reps,
    p_top_set_rpe,
    coalesce(p_training_max_percentage, 92.5),
    v_training_max_kg,
    p_source_session_id,
    p_source_performed_set_id,
    nullif(trim(p_notes), '')
  )
  on conflict (program_id, lift_name) do update set
    exercise_catalogue_id = excluded.exercise_catalogue_id,
    top_set_weight_kg = excluded.top_set_weight_kg,
    top_set_reps = excluded.top_set_reps,
    top_set_rpe = excluded.top_set_rpe,
    training_max_percentage = excluded.training_max_percentage,
    training_max_kg = excluded.training_max_kg,
    source_session_id = excluded.source_session_id,
    source_performed_set_id = excluded.source_performed_set_id,
    notes = excluded.notes,
    updated_at = now()
  returning id into v_lift_id;

  perform public.generate_main_lift_weekly_prescriptions(
    p_program_id,
    p_client_id,
    p_exercise_catalogue_id,
    trim(p_lift_name),
    v_training_max_kg,
    2.5
  );

  return v_lift_id;
end;
$$;

-- Update library workout exercise RPC to store exercise roles.
create or replace function public.upsert_library_workout_exercise(
  p_exercise_id uuid,
  p_library_workout_id uuid,
  p_exercise_catalogue_id uuid,
  p_exercise_name text,
  p_exercise_order integer,
  p_notes text default null,
  p_exercise_role text default 'accessory'
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_exercise_id uuid;
  v_role text := coalesce(nullif(trim(p_exercise_role), ''), 'accessory');
begin
  if not public.coach_can_manage_library() then
    raise exception 'Only coaches can manage workout library exercises.';
  end if;

  if v_role not in ('main_lift', 'accessory') then
    raise exception 'Exercise role must be main_lift or accessory.';
  end if;

  if p_exercise_id is null then
    insert into public.library_workout_exercises (library_workout_id, exercise_catalogue_id, exercise_name, exercise_order, notes, exercise_role)
    values (p_library_workout_id, p_exercise_catalogue_id, trim(p_exercise_name), coalesce(p_exercise_order, 1), nullif(trim(p_notes), ''), v_role)
    returning id into v_exercise_id;
  else
    update public.library_workout_exercises
    set exercise_catalogue_id = p_exercise_catalogue_id,
        exercise_name = trim(p_exercise_name),
        exercise_order = coalesce(p_exercise_order, 1),
        notes = nullif(trim(p_notes), ''),
        exercise_role = v_role,
        updated_at = now()
    where id = p_exercise_id
    returning id into v_exercise_id;
  end if;

  return v_exercise_id;
end;
$$;

-- Update library workout set RPC to store %1RM and calculated load data.
create or replace function public.upsert_library_workout_set(
  p_set_id uuid,
  p_library_workout_exercise_id uuid,
  p_set_order integer,
  p_target_reps text default null,
  p_target_weight_kg numeric default null,
  p_target_rpe numeric default null,
  p_target_rir numeric default null,
  p_notes text default null,
  p_target_percentage_1rm numeric default null,
  p_calculated_target_load_kg numeric default null,
  p_programme_week integer default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_set_id uuid;
begin
  if not public.coach_can_manage_library() then
    raise exception 'Only coaches can manage workout library sets.';
  end if;

  if p_set_id is null then
    insert into public.library_workout_sets (
      library_workout_exercise_id,
      set_order,
      target_reps,
      target_weight_kg,
      target_rpe,
      target_rir,
      notes,
      target_percentage_1rm,
      calculated_target_load_kg,
      programme_week
    )
    values (
      p_library_workout_exercise_id,
      coalesce(p_set_order, 1),
      nullif(trim(p_target_reps), ''),
      p_target_weight_kg,
      p_target_rpe,
      p_target_rir,
      nullif(trim(p_notes), ''),
      p_target_percentage_1rm,
      p_calculated_target_load_kg,
      p_programme_week
    )
    returning id into v_set_id;
  else
    update public.library_workout_sets
    set set_order = coalesce(p_set_order, 1),
        target_reps = nullif(trim(p_target_reps), ''),
        target_weight_kg = p_target_weight_kg,
        target_rpe = p_target_rpe,
        target_rir = p_target_rir,
        notes = nullif(trim(p_notes), ''),
        target_percentage_1rm = p_target_percentage_1rm,
        calculated_target_load_kg = p_calculated_target_load_kg,
        programme_week = p_programme_week,
        updated_at = now()
    where id = p_set_id
    returning id into v_set_id;
  end if;

  return v_set_id;
end;
$$;

-- Copy roles and prescription fields when assigning library programmes to clients.
create or replace function public.assign_library_programme_to_client(p_client_id uuid, p_library_programme_id uuid, p_program_title text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_programme public.library_programmes%rowtype;
  v_new_program_id uuid;
  v_new_workout_id uuid;
  v_new_exercise_id uuid;
  v_programme_workout record;
  v_library_exercise record;
  v_library_set record;
begin
  if not exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach') then
    raise exception 'Only coaches can assign library programmes.';
  end if;

  select * into v_programme from public.library_programmes where id = p_library_programme_id and is_active = true;
  if not found then
    raise exception 'Library programme not found.';
  end if;

  update public.training_programs
  set status = 'archived', end_date = coalesce(end_date, current_date), updated_at = now()
  where client_id = p_client_id and status = 'active';

  update public.program_workouts
  set status = 'archived', updated_at = now()
  where client_id = p_client_id and status = 'active';

  insert into public.training_programs (client_id, title, goal, status, start_date, created_by, source_library_programme_id)
  values (p_client_id, coalesce(nullif(trim(p_program_title), ''), v_programme.name), v_programme.goal, 'active', current_date, auth.uid(), v_programme.id)
  returning id into v_new_program_id;

  for v_programme_workout in
    select lpw.workout_order, lpw.day_label, lw.id as library_workout_id, lw.name, lw.instructions
    from public.library_programme_workouts lpw
    join public.library_workouts lw on lw.id = lpw.library_workout_id
    where lpw.library_programme_id = v_programme.id and lw.is_active = true
    order by lpw.workout_order asc
  loop
    insert into public.program_workouts (client_id, program_id, title, day_label, workout_order, scheduled_date, instructions, status, source_library_workout_id)
    values (p_client_id, v_new_program_id, v_programme_workout.name, coalesce(v_programme_workout.day_label, 'Day ' || v_programme_workout.workout_order), v_programme_workout.workout_order, null, v_programme_workout.instructions, 'active', v_programme_workout.library_workout_id)
    returning id into v_new_workout_id;

    for v_library_exercise in
      select id, exercise_catalogue_id, exercise_name, exercise_order, notes, exercise_role
      from public.library_workout_exercises
      where library_workout_id = v_programme_workout.library_workout_id
      order by exercise_order asc
    loop
      insert into public.program_exercises (workout_id, exercise_order, exercise_name, notes, source_library_exercise_id, exercise_catalogue_id, exercise_role)
      values (v_new_workout_id, v_library_exercise.exercise_order, v_library_exercise.exercise_name, v_library_exercise.notes, v_library_exercise.id, v_library_exercise.exercise_catalogue_id, v_library_exercise.exercise_role)
      returning id into v_new_exercise_id;

      for v_library_set in
        select id, set_order, target_reps, target_weight_kg, target_rpe, target_rir, notes, target_percentage_1rm, calculated_target_load_kg, programme_week
        from public.library_workout_sets
        where library_workout_exercise_id = v_library_exercise.id
        order by set_order asc
      loop
        insert into public.program_sets (
          exercise_id,
          set_order,
          target_reps,
          target_weight_kg,
          target_rpe,
          target_rir,
          notes,
          source_library_set_id,
          target_percentage_1rm,
          calculated_target_load_kg,
          programme_week
        )
        values (
          v_new_exercise_id,
          v_library_set.set_order,
          v_library_set.target_reps,
          v_library_set.target_weight_kg,
          v_library_set.target_rpe,
          v_library_set.target_rir,
          v_library_set.notes,
          v_library_set.id,
          v_library_set.target_percentage_1rm,
          v_library_set.calculated_target_load_kg,
          v_library_set.programme_week
        );
      end loop;
    end loop;
  end loop;

  return v_new_program_id;
end;
$$;

grant execute on function public.round_to_increment(numeric, numeric) to authenticated;
grant execute on function public.generate_main_lift_weekly_prescriptions(uuid, uuid, uuid, text, numeric, numeric) to authenticated;
grant execute on function public.save_calibration_lift_and_generate_prescriptions(uuid, uuid, uuid, text, numeric, integer, numeric, numeric, uuid, uuid, text) to authenticated;
grant execute on function public.upsert_library_workout_exercise(uuid, uuid, uuid, text, integer, text, text) to authenticated;
grant execute on function public.upsert_library_workout_set(uuid, uuid, integer, text, numeric, numeric, numeric, text, numeric, numeric, integer) to authenticated;
grant execute on function public.assign_library_programme_to_client(uuid, uuid, text) to authenticated;
