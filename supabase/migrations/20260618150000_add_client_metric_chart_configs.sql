create table if not exists public.client_metric_chart_configs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  slot integer not null check (slot between 1 and 3),
  source_type text not null check (source_type in ('exercise', 'bodyweight')),
  exercise_name text,
  metric_key text not null check (metric_key in ('estimated_1rm', 'top_weight', 'volume', 'top_reps', 'completed_sets', 'avg_reps_per_set', 'bodyweight')),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_metric_chart_configs_unique_slot unique (client_id, slot),
  constraint client_metric_chart_configs_source_check check (
    (source_type = 'bodyweight' and metric_key = 'bodyweight')
    or
    (source_type = 'exercise' and exercise_name is not null and metric_key <> 'bodyweight')
  )
);

create index if not exists client_metric_chart_configs_client_idx
  on public.client_metric_chart_configs(client_id, slot);

create or replace function public.touch_client_metric_chart_configs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_client_metric_chart_configs_updated_at on public.client_metric_chart_configs;
create trigger touch_client_metric_chart_configs_updated_at
before update on public.client_metric_chart_configs
for each row
execute function public.touch_client_metric_chart_configs_updated_at();

grant select, insert, update, delete on public.client_metric_chart_configs to authenticated;
