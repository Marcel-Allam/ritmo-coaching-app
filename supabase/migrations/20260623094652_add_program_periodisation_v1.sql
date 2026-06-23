-- Add a simple V1 periodisation and calibration data model.
-- This supports a manual-first 12-week strength-led physique block without introducing auto-programming.

alter table public.workout_sessions
add column if not exists is_calibration boolean not null default false;

create table if not exists public.program_periodisation_settings (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null unique references public.training_programs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,

  programme_length_weeks integer not null default 12 check (programme_length_weeks > 0),
  current_week integer not null default 0 check (current_week >= 0),

  current_block_name text not null default 'Calibration',
  current_block_start_week integer not null default 0 check (current_block_start_week >= 0),
  current_block_end_week integer not null default 0 check (current_block_end_week >= 0),
  current_block_goal text,
  client_explanation text,
  next_block_name text,
  loading_guide text,

  client_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint program_periodisation_settings_week_range_check check (current_block_end_week >= current_block_start_week),
  constraint program_periodisation_settings_week_lte_length_check check (current_week <= programme_length_weeks)
);

create table if not exists public.program_calibration_lifts (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_programs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,

  lift_name text not null,
  top_set_weight_kg numeric not null check (top_set_weight_kg > 0),
  top_set_reps integer not null check (top_set_reps > 0),
  estimated_1rm_kg numeric generated always as (
    round((top_set_weight_kg * (1 + (top_set_reps::numeric / 30.0))), 1)
  ) stored,

  source_session_id uuid references public.workout_sessions(id) on delete set null,
  source_performed_set_id uuid references public.performed_sets(id) on delete set null,
  formula text not null default 'weight * (1 + reps / 30)',

  client_visible boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint program_calibration_lifts_unique_program_lift unique (program_id, lift_name)
);

create index if not exists program_periodisation_settings_client_id_idx
on public.program_periodisation_settings(client_id);

create index if not exists program_calibration_lifts_program_id_idx
on public.program_calibration_lifts(program_id);

create index if not exists program_calibration_lifts_client_id_idx
on public.program_calibration_lifts(client_id);

create index if not exists workout_sessions_is_calibration_idx
on public.workout_sessions(is_calibration)
where is_calibration = true;

alter table public.program_periodisation_settings enable row level security;
alter table public.program_calibration_lifts enable row level security;

drop policy if exists "Coaches can manage program periodisation settings" on public.program_periodisation_settings;
create policy "Coaches can manage program periodisation settings"
on public.program_periodisation_settings
for all
using (public.is_coach())
with check (public.is_coach());

drop policy if exists "Clients can view own visible periodisation settings" on public.program_periodisation_settings;
create policy "Clients can view own visible periodisation settings"
on public.program_periodisation_settings
for select
using (
  client_visible
  and exists (
    select 1
    from public.clients c
    where c.id = program_periodisation_settings.client_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists "Coaches can manage program calibration lifts" on public.program_calibration_lifts;
create policy "Coaches can manage program calibration lifts"
on public.program_calibration_lifts
for all
using (public.is_coach())
with check (public.is_coach());

drop policy if exists "Clients can view own visible calibration lifts" on public.program_calibration_lifts;
create policy "Clients can view own visible calibration lifts"
on public.program_calibration_lifts
for select
using (
  client_visible
  and exists (
    select 1
    from public.clients c
    where c.id = program_calibration_lifts.client_id
      and c.user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.program_periodisation_settings to authenticated;
grant select, insert, update, delete on public.program_calibration_lifts to authenticated;

drop trigger if exists set_program_periodisation_settings_updated_at on public.program_periodisation_settings;
create trigger set_program_periodisation_settings_updated_at
before update on public.program_periodisation_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_program_calibration_lifts_updated_at on public.program_calibration_lifts;
create trigger set_program_calibration_lifts_updated_at
before update on public.program_calibration_lifts
for each row execute function public.set_updated_at();
