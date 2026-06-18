create or replace function public.coach_can_manage_library()
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'coach'
  );
$$;

create or replace function public.upsert_library_workout(
  p_workout_id uuid,
  p_name text,
  p_category text,
  p_goal text default null,
  p_instructions text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_workout_id uuid;
begin
  if not public.coach_can_manage_library() then
    raise exception 'Only coaches can manage workout library items.';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Workout name is required.';
  end if;

  if p_workout_id is null then
    insert into public.library_workouts (name, category, goal, instructions, is_active)
    values (trim(p_name), coalesce(nullif(trim(p_category), ''), 'Custom'), nullif(trim(p_goal), ''), nullif(trim(p_instructions), ''), true)
    returning id into v_workout_id;
  else
    update public.library_workouts
    set name = trim(p_name), category = coalesce(nullif(trim(p_category), ''), 'Custom'), goal = nullif(trim(p_goal), ''), instructions = nullif(trim(p_instructions), ''), updated_at = now()
    where id = p_workout_id
    returning id into v_workout_id;
  end if;

  return v_workout_id;
end;
$$;

create or replace function public.archive_library_workout(p_workout_id uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  if not public.coach_can_manage_library() then
    raise exception 'Only coaches can archive workout library items.';
  end if;

  update public.library_workouts
  set is_active = false, updated_at = now()
  where id = p_workout_id;
end;
$$;

create or replace function public.upsert_library_workout_exercise(
  p_exercise_id uuid,
  p_library_workout_id uuid,
  p_exercise_catalogue_id uuid,
  p_exercise_name text,
  p_exercise_order integer,
  p_notes text default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_exercise_id uuid;
begin
  if not public.coach_can_manage_library() then
    raise exception 'Only coaches can manage workout library exercises.';
  end if;

  if p_exercise_id is null then
    insert into public.library_workout_exercises (library_workout_id, exercise_catalogue_id, exercise_name, exercise_order, notes)
    values (p_library_workout_id, p_exercise_catalogue_id, trim(p_exercise_name), coalesce(p_exercise_order, 1), nullif(trim(p_notes), ''))
    returning id into v_exercise_id;
  else
    update public.library_workout_exercises
    set exercise_catalogue_id = p_exercise_catalogue_id, exercise_name = trim(p_exercise_name), exercise_order = coalesce(p_exercise_order, 1), notes = nullif(trim(p_notes), ''), updated_at = now()
    where id = p_exercise_id
    returning id into v_exercise_id;
  end if;

  return v_exercise_id;
end;
$$;

create or replace function public.upsert_library_workout_set(
  p_set_id uuid,
  p_library_workout_exercise_id uuid,
  p_set_order integer,
  p_target_reps text default null,
  p_target_weight_kg numeric default null,
  p_target_rpe numeric default null,
  p_target_rir numeric default null,
  p_notes text default null
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
    insert into public.library_workout_sets (library_workout_exercise_id, set_order, target_reps, target_weight_kg, target_rpe, target_rir, notes)
    values (p_library_workout_exercise_id, coalesce(p_set_order, 1), nullif(trim(p_target_reps), ''), p_target_weight_kg, p_target_rpe, p_target_rir, nullif(trim(p_notes), ''))
    returning id into v_set_id;
  else
    update public.library_workout_sets
    set set_order = coalesce(p_set_order, 1), target_reps = nullif(trim(p_target_reps), ''), target_weight_kg = p_target_weight_kg, target_rpe = p_target_rpe, target_rir = p_target_rir, notes = nullif(trim(p_notes), ''), updated_at = now()
    where id = p_set_id
    returning id into v_set_id;
  end if;

  return v_set_id;
end;
$$;

grant execute on function public.coach_can_manage_library() to authenticated;
grant execute on function public.upsert_library_workout(uuid, text, text, text, text) to authenticated;
grant execute on function public.archive_library_workout(uuid) to authenticated;
grant execute on function public.upsert_library_workout_exercise(uuid, uuid, uuid, text, integer, text) to authenticated;
grant execute on function public.upsert_library_workout_set(uuid, uuid, integer, text, numeric, numeric, numeric, text) to authenticated;
