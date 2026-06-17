do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'training_programs' and column_name = 'source_library_programme_id') then
    alter table public.training_programs add column source_library_programme_id uuid references public.library_programmes(id) on delete set null;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'program_workouts' and column_name = 'source_library_workout_id') then
    alter table public.program_workouts add column source_library_workout_id uuid references public.library_workouts(id) on delete set null;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'program_exercises' and column_name = 'source_library_exercise_id') then
    alter table public.program_exercises add column source_library_exercise_id uuid references public.library_workout_exercises(id) on delete set null;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'program_exercises' and column_name = 'exercise_catalogue_id') then
    alter table public.program_exercises add column exercise_catalogue_id uuid references public.exercise_catalogue(id) on delete set null;
  end if;

  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'program_sets' and column_name = 'source_library_set_id') then
    alter table public.program_sets add column source_library_set_id uuid references public.library_workout_sets(id) on delete set null;
  end if;
end $$;

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
      select id, exercise_catalogue_id, exercise_name, exercise_order, notes
      from public.library_workout_exercises
      where library_workout_id = v_programme_workout.library_workout_id
      order by exercise_order asc
    loop
      insert into public.program_exercises (workout_id, exercise_order, exercise_name, notes, source_library_exercise_id, exercise_catalogue_id)
      values (v_new_workout_id, v_library_exercise.exercise_order, v_library_exercise.exercise_name, v_library_exercise.notes, v_library_exercise.id, v_library_exercise.exercise_catalogue_id)
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
