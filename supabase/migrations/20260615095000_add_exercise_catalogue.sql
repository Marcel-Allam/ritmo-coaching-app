create table if not exists public.exercise_catalogue (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  movement_pattern text,
  primary_muscles text[] not null default '{}',
  equipment text,
  default_notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

alter table public.exercise_catalogue enable row level security;

drop policy if exists "Coaches can manage exercise catalogue" on public.exercise_catalogue;
create policy "Coaches can manage exercise catalogue"
on public.exercise_catalogue
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'coach'
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'coach'
  )
);

drop policy if exists "Clients can read exercise catalogue" on public.exercise_catalogue;
create policy "Clients can read exercise catalogue"
on public.exercise_catalogue
for select
to authenticated
using (is_active = true);

insert into public.exercise_catalogue (name, category, movement_pattern, primary_muscles, equipment, default_notes) values
  ('Back Squat', 'Lower Body', 'Squat', array['Quads','Glutes','Adductors'], 'Barbell', 'Brace hard, controlled depth, drive through mid-foot.'),
  ('Front Squat', 'Lower Body', 'Squat', array['Quads','Upper Back','Core'], 'Barbell', 'Stay tall, elbows high, keep reps crisp.'),
  ('Leg Press', 'Lower Body', 'Squat', array['Quads','Glutes'], 'Machine', 'Control depth and avoid locking out aggressively.'),
  ('Romanian Deadlift', 'Lower Body', 'Hinge', array['Hamstrings','Glutes','Erectors'], 'Barbell', 'Soft knees, push hips back, keep lats tight.'),
  ('Conventional Deadlift', 'Lower Body', 'Hinge', array['Glutes','Hamstrings','Back'], 'Barbell', 'Brace before pulling, keep bar close.'),
  ('Hip Thrust', 'Lower Body', 'Hip Extension', array['Glutes'], 'Barbell', 'Pause briefly at lockout, ribs down.'),
  ('Walking Lunge', 'Lower Body', 'Single Leg', array['Quads','Glutes'], 'Dumbbells', 'Long controlled steps, stable torso.'),
  ('Bulgarian Split Squat', 'Lower Body', 'Single Leg', array['Quads','Glutes'], 'Dumbbells', 'Use controlled range and keep front foot planted.'),
  ('Leg Curl', 'Lower Body', 'Knee Flexion', array['Hamstrings'], 'Machine', 'Control the eccentric and squeeze hard.'),
  ('Standing Calf Raise', 'Lower Body', 'Calf Raise', array['Calves'], 'Machine', 'Full stretch, full contraction.'),
  ('Bench Press', 'Upper Body', 'Horizontal Push', array['Chest','Triceps','Front Delts'], 'Barbell', 'Stable setup, controlled touch, strong press.'),
  ('Incline Dumbbell Press', 'Upper Body', 'Incline Push', array['Upper Chest','Triceps','Front Delts'], 'Dumbbells', 'Control the bottom position, press smoothly.'),
  ('Dumbbell Bench Press', 'Upper Body', 'Horizontal Push', array['Chest','Triceps','Front Delts'], 'Dumbbells', 'Keep shoulders pinned and range consistent.'),
  ('Overhead Press', 'Upper Body', 'Vertical Push', array['Shoulders','Triceps'], 'Barbell', 'Brace glutes and abs, press in a straight path.'),
  ('Machine Chest Press', 'Upper Body', 'Horizontal Push', array['Chest','Triceps'], 'Machine', 'Set seat height so handles line up with mid-chest.'),
  ('Cable Fly', 'Upper Body', 'Chest Isolation', array['Chest'], 'Cable', 'Soft elbows, squeeze across the chest.'),
  ('Pull-Up', 'Upper Body', 'Vertical Pull', array['Lats','Upper Back','Biceps'], 'Bodyweight', 'Full hang to strong chest-up pull.'),
  ('Lat Pulldown', 'Upper Body', 'Vertical Pull', array['Lats','Upper Back','Biceps'], 'Cable', 'Pull elbows down, avoid leaning back excessively.'),
  ('Barbell Row', 'Upper Body', 'Horizontal Pull', array['Upper Back','Lats','Biceps'], 'Barbell', 'Hinge stable, row to lower ribs.'),
  ('Seated Cable Row', 'Upper Body', 'Horizontal Pull', array['Upper Back','Lats','Biceps'], 'Cable', 'Pause with shoulder blades back.'),
  ('Chest-Supported Row', 'Upper Body', 'Horizontal Pull', array['Upper Back','Lats'], 'Machine', 'Keep chest planted and row with elbows.'),
  ('Face Pull', 'Upper Body', 'Rear Delt', array['Rear Delts','Upper Back'], 'Cable', 'Pull toward face with elbows high.'),
  ('Lateral Raise', 'Upper Body', 'Shoulder Isolation', array['Side Delts'], 'Dumbbells', 'Lead with elbows, controlled tempo.'),
  ('Rear Delt Fly', 'Upper Body', 'Rear Delt', array['Rear Delts','Upper Back'], 'Dumbbells', 'Keep traps relaxed and sweep wide.'),
  ('Biceps Curl', 'Upper Body', 'Elbow Flexion', array['Biceps'], 'Dumbbells', 'Keep elbows still and control the lowering.'),
  ('Cable Triceps Pushdown', 'Upper Body', 'Elbow Extension', array['Triceps'], 'Cable', 'Lock elbows by sides, full extension.'),
  ('Plank', 'Core', 'Anti-Extension', array['Abs','Core'], 'Bodyweight', 'Ribs down, glutes tight, steady breathing.'),
  ('Cable Crunch', 'Core', 'Spinal Flexion', array['Abs'], 'Cable', 'Curl ribs toward pelvis, avoid hip hinge.'),
  ('Pallof Press', 'Core', 'Anti-Rotation', array['Obliques','Core'], 'Cable', 'Hold square hips and resist rotation.'),
  ('Farmer Carry', 'Conditioning', 'Loaded Carry', array['Grip','Traps','Core'], 'Dumbbells', 'Walk tall with controlled steps.')
on conflict (name) do update set
  category = excluded.category,
  movement_pattern = excluded.movement_pattern,
  primary_muscles = excluded.primary_muscles,
  equipment = excluded.equipment,
  default_notes = excluded.default_notes,
  is_active = true,
  updated_at = now();