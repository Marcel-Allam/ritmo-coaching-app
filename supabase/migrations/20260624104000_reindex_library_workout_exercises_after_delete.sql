-- Keep library workout exercise ordering contiguous after an exercise is deleted.
-- This prevents workout templates showing gaps such as #1, #3, #4 after deletion.

create or replace function public.reindex_library_workout_exercises_after_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.library_workout_exercises as exercise
  set exercise_order = ordered.new_order,
      updated_at = now()
  from (
    select
      id,
      row_number() over (
        order by exercise_order asc, created_at asc, id asc
      )::integer as new_order
    from public.library_workout_exercises
    where library_workout_id = old.library_workout_id
  ) as ordered
  where exercise.id = ordered.id
    and exercise.exercise_order <> ordered.new_order;

  return null;
end;
$$;

drop trigger if exists library_workout_exercises_reindex_after_delete on public.library_workout_exercises;

create trigger library_workout_exercises_reindex_after_delete
after delete on public.library_workout_exercises
for each row
execute function public.reindex_library_workout_exercises_after_delete();

-- Clean up any existing gaps in current workout templates immediately.
with ordered as (
  select
    id,
    row_number() over (
      partition by library_workout_id
      order by exercise_order asc, created_at asc, id asc
    )::integer as new_order
  from public.library_workout_exercises
)
update public.library_workout_exercises as exercise
set exercise_order = ordered.new_order,
    updated_at = now()
from ordered
where exercise.id = ordered.id
  and exercise.exercise_order <> ordered.new_order;
