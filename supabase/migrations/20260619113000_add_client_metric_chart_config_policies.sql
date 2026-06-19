alter table public.client_metric_chart_configs enable row level security;

drop policy if exists "Coaches can manage client metric chart configs" on public.client_metric_chart_configs;
drop policy if exists "Clients can view own metric chart configs" on public.client_metric_chart_configs;

create policy "Coaches can manage client metric chart configs"
on public.client_metric_chart_configs
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

create policy "Clients can view own metric chart configs"
on public.client_metric_chart_configs
for select
to authenticated
using (
  exists (
    select 1
    from public.clients c
    where c.id = client_metric_chart_configs.client_id
      and c.user_id = auth.uid()
  )
);
