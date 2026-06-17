-- RITMO training library foundation.
-- This separates reusable library assets from client-specific assigned programmes.
-- Library rows are reusable master records; assigned client programmes continue to be copied
-- into training_programs, program_workouts, program_exercises, and program_sets.

create table if not exists public.equipment_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_increment_kg numeric(6,2),
  increment_unit text not null default 'total' check (increment_unit in ('total', 'per_hand', 'per_side', 'none')),
  progression_mode text not null default 'load' check (progression_mode in ('load', 'double_progression', 'rep_first', 'manual')),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_workouts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  goal text,
  instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  library_workout_id uuid not null references public.library_workouts(id) on delete cascade,
  exercise_catalogue_id uuid references public.exercise_catalogue(id) on delete set null,
  exercise_name text not null,
  exercise_order integer not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (library_workout_id, exercise_order)
);

create table if not exists public.library_workout_sets (
  id uuid primary key default gen_random_uuid(),
  library_workout_exercise_id uuid not null references public.library_workout_exercises(id) on delete cascade,
  set_order integer not null,
  target_reps text,
  target_weight_kg numeric(6,2),
  target_rpe numeric(3,1),
  target_rir numeric(3,1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (library_workout_exercise_id, set_order)
);

create table if not exists public.library_programmes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  goal text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.library_programme_workouts (
  id uuid primary key default gen_random_uuid(),
  library_programme_id uuid not null references public.library_programmes(id) on delete cascade,
  library_workout_id uuid not null references public.library_workouts(id) on delete restrict,
  workout_order integer not null,
  day_label text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (library_programme_id, workout_order)
);

create index if not exists idx_library_workout_exercises_workout_id on public.library_workout_exercises(library_workout_id);
create index if not exists idx_library_workout_sets_exercise_id on public.library_workout_sets(library_workout_exercise_id);
create index if not exists idx_library_programme_workouts_programme_id on public.library_programme_workouts(library_programme_id);
create index if not exists idx_library_programme_workouts_workout_id on public.library_programme_workouts(library_workout_id);

alter table public.equipment_types enable row level security;
alter table public.library_workouts enable row level security;
alter table public.library_workout_exercises enable row level security;
alter table public.library_workout_sets enable row level security;
alter table public.library_programmes enable row level security;
alter table public.library_programme_workouts enable row level security;

drop policy if exists "Coaches can manage equipment types" on public.equipment_types;
create policy "Coaches can manage equipment types"
on public.equipment_types
for all
to authenticated
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'));

drop policy if exists "Coaches can manage library workouts" on public.library_workouts;
create policy "Coaches can manage library workouts"
on public.library_workouts
for all
to authenticated
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'));

drop policy if exists "Coaches can manage library workout exercises" on public.library_workout_exercises;
create policy "Coaches can manage library workout exercises"
on public.library_workout_exercises
for all
to authenticated
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'));

drop policy if exists "Coaches can manage library workout sets" on public.library_workout_sets;
create policy "Coaches can manage library workout sets"
on public.library_workout_sets
for all
to authenticated
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'));

drop policy if exists "Coaches can manage library programmes" on public.library_programmes;
create policy "Coaches can manage library programmes"
on public.library_programmes
for all
to authenticated
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'));

drop policy if exists "Coaches can manage library programme workouts" on public.library_programme_workouts;
create policy "Coaches can manage library programme workouts"
on public.library_programme_workouts
for all
to authenticated
using (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'))
with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'coach'));

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'exercise_catalogue'
      and column_name = 'equipment_type_id'
  ) then
    alter table public.exercise_catalogue add column equipment_type_id uuid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'exercise_catalogue_equipment_type_id_fkey'
  ) then
    alter table public.exercise_catalogue
      add constraint exercise_catalogue_equipment_type_id_fkey
      foreign key (equipment_type_id) references public.equipment_types(id) on delete set null;
  end if;
end $$;

insert into public.equipment_types (name, default_increment_kg, increment_unit, progression_mode, notes) values
  ('Barbell', 2.5, 'total', 'load', 'Default barbell progression. Small total-load jumps suit bench, squat variations and most barbell work.'),
  ('Dumbbell', 2.5, 'per_hand', 'double_progression', 'Default dumbbell jump is per hand. Use rep targets before increasing if jumps feel large.'),
  ('Machine', 5.0, 'total', 'double_progression', 'Most machine stacks or plate-loaded machines progress in larger total-load jumps.'),
  ('Cable', 2.5, 'total', 'double_progression', 'Cable stack jumps vary by gym. Use smaller available increments when possible.'),
  ('Bodyweight', null, 'none', 'rep_first', 'Progress reps and quality first. Add external load only after top-end targets are repeatable.'),
  ('Kettlebell', 4.0, 'per_hand', 'double_progression', 'Kettlebell jumps are often larger, so rep-first progression is useful.'),
  ('Smith Machine', 2.5, 'total', 'load', 'Treat Smith machine loading as total load but account for fixed path and machine feel.'),
  ('Plate Loaded', 5.0, 'total', 'double_progression', 'Plate-loaded machines often progress in larger total-load jumps.')
on conflict (name) do update set
  default_increment_kg = excluded.default_increment_kg,
  increment_unit = excluded.increment_unit,
  progression_mode = excluded.progression_mode,
  notes = excluded.notes,
  is_active = true,
  updated_at = now();

update public.exercise_catalogue ec
set equipment_type_id = et.id,
    updated_at = now()
from public.equipment_types et
where lower(coalesce(ec.equipment, '')) in (lower(et.name), lower(et.name || 's'));

-- Temporary helper functions for idempotent seeding. Dropped at the end of this migration.
create or replace function public._seed_library_workout(
  p_name text,
  p_category text,
  p_goal text,
  p_instructions text
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.library_workouts (name, category, goal, instructions, is_active)
  values (p_name, p_category, p_goal, p_instructions, true)
  on conflict (name) do update set
    category = excluded.category,
    goal = excluded.goal,
    instructions = excluded.instructions,
    is_active = true,
    updated_at = now()
  returning id into v_id;

  delete from public.library_workout_exercises where library_workout_id = v_id;
  return v_id;
end $$;

create or replace function public._seed_library_exercise(
  p_workout_id uuid,
  p_order integer,
  p_exercise_name text,
  p_notes text,
  p_reps text[],
  p_rpes numeric[],
  p_set_notes text[] default null
) returns void
language plpgsql
as $$
declare
  v_exercise_id uuid;
  v_catalogue_id uuid;
  i integer;
begin
  select id into v_catalogue_id
  from public.exercise_catalogue
  where name = p_exercise_name
  limit 1;

  insert into public.library_workout_exercises (library_workout_id, exercise_catalogue_id, exercise_name, exercise_order, notes)
  values (p_workout_id, v_catalogue_id, p_exercise_name, p_order, p_notes)
  returning id into v_exercise_id;

  for i in 1..coalesce(array_length(p_reps, 1), 0) loop
    insert into public.library_workout_sets (library_workout_exercise_id, set_order, target_reps, target_rpe, notes)
    values (
      v_exercise_id,
      i,
      p_reps[i],
      case when array_length(p_rpes, 1) >= i then p_rpes[i] else null end,
      case when p_set_notes is not null and array_length(p_set_notes, 1) >= i then p_set_notes[i] else null end
    );
  end loop;
end $$;

create or replace function public._seed_library_programme(
  p_name text,
  p_category text,
  p_goal text,
  p_description text,
  p_workouts text[]
) returns void
language plpgsql
as $$
declare
  v_programme_id uuid;
  v_workout_id uuid;
  i integer;
begin
  insert into public.library_programmes (name, category, goal, description, is_active)
  values (p_name, p_category, p_goal, p_description, true)
  on conflict (name) do update set
    category = excluded.category,
    goal = excluded.goal,
    description = excluded.description,
    is_active = true,
    updated_at = now()
  returning id into v_programme_id;

  delete from public.library_programme_workouts where library_programme_id = v_programme_id;

  for i in 1..coalesce(array_length(p_workouts, 1), 0) loop
    select id into v_workout_id from public.library_workouts where name = p_workouts[i] limit 1;
    if v_workout_id is not null then
      insert into public.library_programme_workouts (library_programme_id, library_workout_id, workout_order, day_label)
      values (v_programme_id, v_workout_id, i, 'Day ' || i);
    end if;
  end loop;
end $$;

do $$
declare
  v_workout_id uuid;
begin
  v_workout_id := public._seed_library_workout('Squat Focus', 'Strength', 'Primary squat strength day with controlled back-off work and lower-body accessories.', 'Build to the prescribed top set with controlled warm-ups. Back-off work should look cleaner than the top set.');
  perform public._seed_library_exercise(v_workout_id, 1, 'Back Squat', 'Main lift. Last rep should move with intent and no technical collapse.', array['3-5','5','5'], array[8,7,7], array['Top set','Back-off set 1','Back-off set 2']);
  perform public._seed_library_exercise(v_workout_id, 2, 'Front Squat', 'Secondary squat pattern. Stay tall and controlled.', array['3','3','3'], array[7,7,7]);
  perform public._seed_library_exercise(v_workout_id, 3, 'Romanian Deadlift', 'Controlled hinge accessory. Keep lats tight.', array['8','8','8'], array[7,7,7]);
  perform public._seed_library_exercise(v_workout_id, 4, 'Leg Press', 'Quad volume with controlled ROM.', array['10-12','10-12','10-12'], array[8,8,8]);

  v_workout_id := public._seed_library_workout('Bench Focus', 'Strength', 'Primary bench strength day with paused pressing, rows and upper-body support.', 'Bench comes first. Keep pause, bar path and setup consistent.');
  perform public._seed_library_exercise(v_workout_id, 1, 'Bench Press', 'Main lift. Competition-style setup and consistent touch point.', array['3-5','5','5'], array[8,7,7], array['Top set','Back-off set 1','Back-off set 2']);
  perform public._seed_library_exercise(v_workout_id, 2, 'Machine Chest Press', 'Secondary press pattern with stable setup.', array['8-10','8-10','8-10'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 3, 'Chest-Supported Row', 'Strict upper-back work.', array['8-10','8-10','8-10'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 4, 'Incline Dumbbell Press', 'Controlled accessory press.', array['8-10','8-10','8-10'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 5, 'Lat Pulldown', 'Full stretch and controlled pull.', array['10-12','10-12','10-12'], array[8,8,8]);

  v_workout_id := public._seed_library_workout('Deadlift Focus', 'Strength', 'Primary deadlift strength day with secondary squat and posterior-chain support.', 'Deadlift quality is the priority. Stop sets before form breaks.');
  perform public._seed_library_exercise(v_workout_id, 1, 'Conventional Deadlift', 'Main lift. Brace before pulling and keep the bar close.', array['2-4','4','4'], array[8,7,7], array['Top set','Back-off set 1','Back-off set 2']);
  perform public._seed_library_exercise(v_workout_id, 2, 'Romanian Deadlift', 'Position-strength hinge accessory.', array['6','6','6'], array[7,7,7]);
  perform public._seed_library_exercise(v_workout_id, 3, 'Front Squat', 'Secondary squat pattern.', array['5','5','5'], array[7,7,7]);
  perform public._seed_library_exercise(v_workout_id, 4, 'Leg Curl', 'Hamstring isolation.', array['10-12','10-12','10-12'], array[8,8,8]);

  v_workout_id := public._seed_library_workout('Upper A', 'Upper / Lower', 'Upper-body day with horizontal press and row emphasis.', 'Pressing strength first, then balanced pulling and accessory volume.');
  perform public._seed_library_exercise(v_workout_id, 1, 'Bench Press', 'Primary press.', array['5','5','5'], array[7,7.5,8]);
  perform public._seed_library_exercise(v_workout_id, 2, 'Chest-Supported Row', 'Primary row.', array['6-8','6-8','6-8'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 3, 'Incline Dumbbell Press', 'Accessory press.', array['8-10','8-10','8-10'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 4, 'Lat Pulldown', 'Vertical pull.', array['10-12','10-12','10-12'], array[8,8,8]);

  v_workout_id := public._seed_library_workout('Lower A', 'Upper / Lower', 'Lower-body day with squat emphasis.', 'Squat pattern first, then posterior-chain and quad volume.');
  perform public._seed_library_exercise(v_workout_id, 1, 'Back Squat', 'Primary squat.', array['5','5','5'], array[7,7.5,8]);
  perform public._seed_library_exercise(v_workout_id, 2, 'Romanian Deadlift', 'Hip hinge accessory.', array['8','8','8'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 3, 'Leg Press', 'Quad volume.', array['10-12','10-12','10-12'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 4, 'Standing Calf Raise', 'Controlled stretch and contraction.', array['12-15','12-15','12-15'], array[8,8,8]);

  v_workout_id := public._seed_library_workout('Upper B', 'Upper / Lower', 'Upper-body day with secondary press and vertical pull emphasis.', 'Use this as the second upper day. Keep fatigue controlled.');
  perform public._seed_library_exercise(v_workout_id, 1, 'Overhead Press', 'Secondary press pattern.', array['5-6','5-6','5-6'], array[7,7.5,8]);
  perform public._seed_library_exercise(v_workout_id, 2, 'Pull-Up', 'Primary vertical pull.', array['6-10','6-10','6-10'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 3, 'Seated Cable Row', 'Row volume.', array['8-10','8-10','8-10'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 4, 'Lateral Raise', 'Shoulder accessory.', array['12-15','12-15','12-15'], array[8,8,8]);

  v_workout_id := public._seed_library_workout('Lower B', 'Upper / Lower', 'Lower-body day with hinge emphasis.', 'Pulling is the priority, then lighter squat volume and hamstring work.');
  perform public._seed_library_exercise(v_workout_id, 1, 'Conventional Deadlift', 'Primary pull.', array['3-5','3-5','3-5'], array[7,7.5,8]);
  perform public._seed_library_exercise(v_workout_id, 2, 'Front Squat', 'Secondary squat pattern.', array['5','5','5'], array[7,7,7]);
  perform public._seed_library_exercise(v_workout_id, 3, 'Hip Thrust', 'Posterior-chain accessory.', array['8-10','8-10','8-10'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 4, 'Leg Curl', 'Hamstring isolation.', array['10-12','10-12','10-12'], array[8,8,8]);

  v_workout_id := public._seed_library_workout('Full Body A', 'Full Body', 'Full-body session with squat and bench emphasis.', 'Balanced full-body day. Keep compounds strong and finish accessories without excessive fatigue.');
  perform public._seed_library_exercise(v_workout_id, 1, 'Back Squat', 'Primary lower lift.', array['5','5','5'], array[7,7.5,8]);
  perform public._seed_library_exercise(v_workout_id, 2, 'Bench Press', 'Primary press.', array['5','5','5'], array[7,7.5,8]);
  perform public._seed_library_exercise(v_workout_id, 3, 'Romanian Deadlift', 'Hinge accessory.', array['8','8','8'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 4, 'Seated Cable Row', 'Upper-back volume.', array['10-12','10-12','10-12'], array[8,8,8]);

  v_workout_id := public._seed_library_workout('Full Body B', 'Full Body', 'Full-body session with deadlift and secondary press emphasis.', 'Pull first, then secondary press and squat accessory. Keep fatigue controlled.');
  perform public._seed_library_exercise(v_workout_id, 1, 'Conventional Deadlift', 'Primary pull.', array['3-5','3-5','3-5'], array[7,7.5,8]);
  perform public._seed_library_exercise(v_workout_id, 2, 'Overhead Press', 'Secondary press.', array['6-8','6-8','6-8'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 3, 'Bulgarian Split Squat', 'Single-leg lower accessory.', array['8-10','8-10','8-10'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 4, 'Lat Pulldown', 'Vertical pull.', array['10-12','10-12','10-12'], array[8,8,8]);

  v_workout_id := public._seed_library_workout('Full Body C', 'Full Body', 'Full-body session with lighter squat pattern, press variation and hypertrophy support.', 'Use this as the lighter volume full-body day. Aim for quality reps and recovery-friendly volume.');
  perform public._seed_library_exercise(v_workout_id, 1, 'Front Squat', 'Technique squat pattern.', array['4-6','4-6','4-6'], array[7,7,7]);
  perform public._seed_library_exercise(v_workout_id, 2, 'Dumbbell Bench Press', 'Technique/volume press.', array['6-8','6-8','6-8'], array[7,7.5,8]);
  perform public._seed_library_exercise(v_workout_id, 3, 'Hip Thrust', 'Hip extension accessory.', array['8-10','8-10','8-10'], array[8,8,8]);
  perform public._seed_library_exercise(v_workout_id, 4, 'Barbell Row', 'Upper-back support.', array['10-12','10-12','10-12'], array[8,8,8]);

  perform public._seed_library_programme('Strength Big 3', 'Strength', 'Three-session strength split built around squat, bench and deadlift focus days.', 'Best for strength-focused clients training three days per week.', array['Squat Focus','Bench Focus','Deadlift Focus']);
  perform public._seed_library_programme('Upper/Lower 4-Day', 'Strength & Physique', 'Four-session upper/lower structure for strength and physique.', 'Best for lifters who want a repeatable four-day split.', array['Upper A','Lower A','Upper B','Lower B']);
  perform public._seed_library_programme('Full Body 3-Day', 'General Strength', 'Three full-body sessions with different emphasis across the week.', 'Best for busy lifters training two to three days per week.', array['Full Body A','Full Body B','Full Body C']);
end $$;

drop function if exists public._seed_library_programme(text, text, text, text, text[]);
drop function if exists public._seed_library_exercise(uuid, integer, text, text, text[], numeric[], text[]);
drop function if exists public._seed_library_workout(text, text, text, text);

grant select, insert, update, delete on public.equipment_types to authenticated;
grant select, insert, update, delete on public.library_workouts to authenticated;
grant select, insert, update, delete on public.library_workout_exercises to authenticated;
grant select, insert, update, delete on public.library_workout_sets to authenticated;
grant select, insert, update, delete on public.library_programmes to authenticated;
grant select, insert, update, delete on public.library_programme_workouts to authenticated;
