alter table public.coach_call_bookings
  add column if not exists requested_starts_at timestamptz,
  add column if not exists requested_ends_at timestamptz;

alter table public.coach_call_bookings
  drop constraint if exists coach_call_bookings_requested_time_check;

alter table public.coach_call_bookings
  add constraint coach_call_bookings_requested_time_check
  check (
    (requested_starts_at is null and requested_ends_at is null)
    or
    (requested_starts_at is not null and requested_ends_at is not null and requested_ends_at > requested_starts_at)
  );

create index if not exists idx_coach_call_bookings_client_requested
  on public.coach_call_bookings(client_id, requested_starts_at desc);

create or replace function public.request_coach_call_booking(
  p_client_id uuid,
  p_requested_starts_at timestamptz,
  p_requested_ends_at timestamptz,
  p_client_notes text default null,
  p_booking_type public.coach_call_booking_type default 'weekly_call'
)
returns public.coach_call_bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_coach_id uuid;
  inserted_booking public.coach_call_bookings;
begin
  if p_requested_starts_at is null or p_requested_ends_at is null or p_requested_ends_at <= p_requested_starts_at then
    raise exception 'Requested call time must include a valid start and end time.';
  end if;

  if not exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and c.user_id = auth.uid()
  ) then
    raise exception 'Client record not found for current user.';
  end if;

  select p.id
  into selected_coach_id
  from public.profiles p
  where p.role = 'coach'
  order by p.created_at asc
  limit 1;

  if selected_coach_id is null then
    raise exception 'No coach profile found.';
  end if;

  insert into public.coach_call_bookings (
    coach_id,
    client_id,
    booking_type,
    status,
    requested_starts_at,
    requested_ends_at,
    client_notes
  )
  values (
    selected_coach_id,
    p_client_id,
    p_booking_type,
    'requested',
    p_requested_starts_at,
    p_requested_ends_at,
    nullif(trim(p_client_notes), '')
  )
  returning * into inserted_booking;

  return inserted_booking;
end;
$$;

create or replace function public.respond_to_coach_call_reschedule(
  p_booking_id uuid,
  p_accept boolean
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
      and b.status = 'reschedule_pending'
  ) then
    raise exception 'Reschedule request not found for current client.';
  end if;

  if p_accept then
    update public.coach_call_bookings
    set
      status = 'accepted',
      starts_at = suggested_starts_at,
      ends_at = suggested_ends_at,
      suggested_starts_at = null,
      suggested_ends_at = null,
      updated_at = now()
    where id = p_booking_id
    returning * into updated_booking;
  else
    update public.coach_call_bookings
    set
      status = 'cancelled',
      suggested_starts_at = null,
      suggested_ends_at = null,
      updated_at = now()
    where id = p_booking_id
    returning * into updated_booking;
  end if;

  return updated_booking;
end;
$$;

grant execute on function public.request_coach_call_booking(uuid, timestamptz, timestamptz, text, public.coach_call_booking_type) to authenticated;
grant execute on function public.respond_to_coach_call_reschedule(uuid, boolean) to authenticated;
