drop policy if exists "Clients can cancel own coach call bookings" on public.coach_call_bookings;

create policy "Clients can cancel own coach call bookings"
on public.coach_call_bookings
for update
to authenticated
using (
  status in ('requested', 'accepted', 'reschedule_pending')
  and exists (
    select 1
    from public.clients c
    where c.id = client_id
      and c.user_id = auth.uid()
  )
)
with check (
  status = 'cancelled'
  and exists (
    select 1
    from public.clients c
    where c.id = client_id
      and c.user_id = auth.uid()
  )
);
