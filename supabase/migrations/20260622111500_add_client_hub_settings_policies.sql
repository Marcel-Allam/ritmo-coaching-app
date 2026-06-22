create policy "Coaches can manage client hub settings"
on public.client_hub_settings
for all
to authenticated
using (public.is_coach())
with check (public.is_coach());

create policy "Clients can view own client hub settings"
on public.client_hub_settings
for select
to authenticated
using (
  exists (
    select 1
    from public.clients
    where clients.id = client_hub_settings.client_id
      and clients.user_id = auth.uid()
  )
);
