grant update (tdee_gender, date_of_birth, height_cm) on public.clients to authenticated;

drop policy if exists "Clients can update own tdee profile" on public.clients;
create policy "Clients can update own tdee profile"
on public.clients
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
