create or replace function public.cancel_own_coach_call_booking(
  p_booking_id uuid
)
returns public.coach_call_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_booking public.coach_call_bookings;
begin
  if not exists (
    select 1
    from public.coach_call_bookings b
    join public.clients c on c.id = b.client_id
    where b.id = p_booking_id
      and c.user_id = auth.uid()
      and b.status in ('requested', 'accepted', 'reschedule_pending')
  ) then
    raise exception 'Active coach call not found for current client.';
  end if;

  update public.coach_call_bookings
  set
    status = 'cancelled',
    suggested_starts_at = null,
    suggested_ends_at = null,
    updated_at = now()
  where id = p_booking_id
  returning * into updated_booking;

  return updated_booking;
end;
$$;

grant execute on function public.cancel_own_coach_call_booking(uuid) to authenticated;
