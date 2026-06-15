create table if not exists public.client_settings (
  client_id uuid primary key references public.clients(id) on delete cascade,
  nutrition_enabled boolean not null default false,
  nutrition_tracking_mode text not null default 'simple' check (nutrition_tracking_mode in ('simple', 'calories_protein', 'macros', 'habits')),
  show_calorie_target boolean not null default false,
  show_protein_target boolean not null default true,
  show_macro_targets boolean not null default false,
  bodyweight_enabled boolean not null default true,
  progress_photos_enabled boolean not null default false,
  workout_rpe_enabled boolean not null default true,
  client_feedback_enabled boolean not null default true,
  training_availability_enabled boolean not null default true,
  settings_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on table client_settings to authenticated;

create or replace function public.set_client_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists client_settings_set_updated_at on public.client_settings;
create trigger client_settings_set_updated_at
before update on public.client_settings
for each row
execute function public.set_client_settings_updated_at();

alter table public.client_settings enable row level security;

drop policy if exists "coach_or_client_select_client_settings" on public.client_settings;
create policy "coach_or_client_select_client_settings"
on public.client_settings
for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'coach'
  )
  or exists (
    select 1 from public.clients
    where clients.id = client_settings.client_id
      and clients.user_id = auth.uid()
  )
);

drop policy if exists "coach_insert_client_settings" on public.client_settings;
create policy "coach_insert_client_settings"
on public.client_settings
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'coach'
  )
);

drop policy if exists "coach_update_client_settings" on public.client_settings;
create policy "coach_update_client_settings"
on public.client_settings
for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'coach'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'coach'
  )
);

drop policy if exists "coach_delete_client_settings" on public.client_settings;
create policy "coach_delete_client_settings"
on public.client_settings
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
      and profiles.role = 'coach'
  )
);

insert into public.client_settings (client_id)
select clients.id
from public.clients
left join public.client_settings on client_settings.client_id = clients.id
where client_settings.client_id is null;

create index if not exists idx_client_settings_nutrition_enabled on public.client_settings(nutrition_enabled);
