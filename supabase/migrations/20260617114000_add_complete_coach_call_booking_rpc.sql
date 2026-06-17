create or replace function public.complete_coach_call_booking(p_booking_id uuid)
returns public.coach_call_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_booking public.coach_call_bookings;
begin
  update public.coach_call_bookings
  set
    status = 'completed',
    suggested_starts_at = null,
    suggested_ends_at = null,
    updated_at = now()
  where id = p_booking_id
    and coach_id = auth.uid()
    and status = 'accepted'
  returning * into updated_booking;

  if updated_booking.id is null then
    raise exception 'Accepted coach call booking not found for this coach.';
  end if;

  return updated_booking;
end;
$$;

grant execute on function public.complete_coach_call_booking(uuid) to authenticated;
