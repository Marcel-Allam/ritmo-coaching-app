create table if not exists public.client_hub_settings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  show_calorie_target boolean not null default false,
  calorie_target integer,
  show_protein_target boolean not null default false,
  protein_target_g integer,
  show_carb_target boolean not null default false,
  carb_target_g integer,
  show_fat_target boolean not null default false,
  fat_target_g integer,
  show_bodyweight_card boolean not null default true,
  show_submit_bodyweight boolean not null default true,
  show_next_workout_card boolean not null default true,
  show_coaching_status_card boolean not null default true,
  show_progress_cards boolean not null default true,
  target_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_hub_settings_client_id_key unique (client_id)
);

alter table public.client_hub_settings enable row level security;

create index if not exists client_hub_settings_client_id_idx on public.client_hub_settings(client_id);
