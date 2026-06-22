alter table public.client_hub_settings
  add column if not exists calorie_adjustment integer not null default -500,
  add column if not exists protein_multiplier numeric(3,2) not null default 1.80,
  add column if not exists estimated_bmr integer,
  add column if not exists estimated_tdee integer,
  add column if not exists activity_multiplier numeric(4,2),
  add column if not exists workouts_past_7_days integer not null default 0;

grant select, insert, update, delete on public.client_hub_settings to authenticated;
grant select on public.client_hub_settings to anon;
