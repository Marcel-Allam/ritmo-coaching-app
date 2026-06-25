alter table public.workout_sessions
  add column if not exists program_week integer;

alter table public.workout_sessions
  drop constraint if exists workout_sessions_program_week_check;

alter table public.workout_sessions
  add constraint workout_sessions_program_week_check
  check (program_week is null or (program_week >= 0 and program_week <= 52));

create index if not exists workout_sessions_client_workout_week_idx
  on public.workout_sessions (client_id, program_workout_id, program_week);

comment on column public.workout_sessions.program_week is
  'Programme week the workout session belongs to. Allows the same workout to be completed once per programme week.';
