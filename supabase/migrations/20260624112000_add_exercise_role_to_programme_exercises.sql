-- Step 1: classify exercises as main/key lifts or accessories.
-- Main lifts will later drive calibration, %1RM prescription, and strength progression logic.

alter table public.library_workout_exercises
  add column if not exists exercise_role text not null default 'accessory';

alter table public.program_exercises
  add column if not exists exercise_role text not null default 'accessory';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'library_workout_exercises_exercise_role_check'
  ) then
    alter table public.library_workout_exercises
      add constraint library_workout_exercises_exercise_role_check
      check (exercise_role in ('main_lift', 'accessory'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'program_exercises_exercise_role_check'
  ) then
    alter table public.program_exercises
      add constraint program_exercises_exercise_role_check
      check (exercise_role in ('main_lift', 'accessory'));
  end if;
end $$;

update public.library_workout_exercises
set exercise_role = 'accessory'
where exercise_role is null
   or exercise_role not in ('main_lift', 'accessory');

update public.program_exercises
set exercise_role = 'accessory'
where exercise_role is null
   or exercise_role not in ('main_lift', 'accessory');

-- If assigned exercises came from library exercises, keep them aligned with the source role.
update public.program_exercises as assigned_exercise
set exercise_role = source_exercise.exercise_role,
    updated_at = now()
from public.library_workout_exercises as source_exercise
where assigned_exercise.source_library_exercise_id = source_exercise.id;

-- Replace the workout exercise upsert RPC so the library builder can save exercise_role.
drop function if exists public.upsert_library_workout_exercise(uuid, uuid, uuid, text, integer, text);

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
  v_exercise_role text := coalesce(nullif(trim(p_exercise_role), ''), 'accessory');
begin
  if not public.coach_can_manage_library() then
    raise exception 'Only coaches can manage workout library exercises.';
  end if;

  if v_exercise_role not in ('main_lift', 'accessory') then
    raise exception 'Invalid exercise role. Use main_lift or accessory.';
  end if;

  if p_exercise_id is null then
    insert into public.library_workout_exercises (
      library_workout_id,
      exercise_catalogue_id,
      exercise_name,
      exercise_order,
      notes,
      exercise_role
    )
    values (
      p_library_workout_id,
      p_exercise_catalogue_id,
      trim(p_exercise_name),
      coalesce(p_exercise_order, 1),
      nullif(trim(p_notes), ''),
      v_exercise_role
    )
    returning id into v_exercise_id;
  else
    update public.library_workout_exercises
    set exercise_catalogue_id = p_exercise_catalogue_id,
        exercise_name = trim(p_exercise_name),
        exercise_order = coalesce(p_exercise_order, 1),
        notes = nullif(trim(p_notes), ''),
        exercise_role = v_exercise_role,
        updated_at = now()
    where id = p_exercise_id
    returning id into v_exercise_id;
  end if;

  return v_exercise_id;
end;
$$;

grant execute on function public.upsert_library_workout_exercise(uuid, uuid, uuid, text, integer, text, text) to authenticated;

-- Replace programme assignment so library exercise roles copy into assigned client programme exercises.
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
        select id, set_order, target_reps, target_weight_kg, target_rpe, target_rir, notes
        from public.library_workout_sets
        where library_workout_exercise_id = v_library_exercise.id
        order by set_order asc
      loop
        insert into public.program_sets (exercise_id, set_order, target_reps, target_weight_kg, target_rpe, target_rir, notes, source_library_set_id)
        values (v_new_exercise_id, v_library_set.set_order, v_library_set.target_reps, v_library_set.target_weight_kg, v_library_set.target_rpe, v_library_set.target_rir, v_library_set.notes, v_library_set.id);
      end loop;
    end loop;
  end loop;

  return v_new_program_id;
end;
$$;

grant execute on function public.assign_library_programme_to_client(uuid, uuid, text) to authenticated;
