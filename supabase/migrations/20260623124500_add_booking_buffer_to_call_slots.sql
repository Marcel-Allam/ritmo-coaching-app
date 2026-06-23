-- Add a 2-hour minimum booking buffer to available coach call slots.
-- Also keeps the client booking window controlled by the p_days_ahead argument.

create or replace function public.get_available_coach_call_slots(
  p_days_ahead integer default 6
)
returns table (
  slot_start timestamptz,
  slot_end timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_coach_id uuid;
  selected_timezone text := 'Europe/London';
  selected_window_days integer := 6;
begin
  select p.id
  into selected_coach_id
  from public.profiles p
  where p.role = 'coach'
  order by p.created_at asc
  limit 1;

  if selected_coach_id is null then
    return;
  end if;

  select
    coalesce(s.timezone, 'Europe/London'),
    least(greatest(coalesce(p_days_ahead, 6), 1), 90)
  into selected_timezone, selected_window_days
  from public.coach_calendar_availability_settings s
  where s.coach_id = selected_coach_id;

  if selected_timezone is null then
    selected_timezone := 'Europe/London';
  end if;

  if selected_window_days is null then
    selected_window_days := least(greatest(coalesce(p_days_ahead, 6), 1), 90);
  end if;

  return query
  with day_series as (
    select generate_series(
      (now() at time zone selected_timezone)::date,
      ((now() at time zone selected_timezone)::date + selected_window_days),
      interval '1 day'
    )::date as local_date
  ),
  rules as (
    select r.weekday, r.starts_at, r.ends_at
    from public.coach_calendar_availability_rules r
    where r.coach_id = selected_coach_id
      and r.is_available = true
  ),
  candidate_slots as (
    select
      (slot_values.slot_local at time zone selected_timezone) as candidate_start,
      ((slot_values.slot_local + interval '30 minutes') at time zone selected_timezone) as candidate_end,
      d.local_date
    from day_series d
    join rules r
      on r.weekday = extract(isodow from d.local_date)::integer
    cross join lateral generate_series(
      d.local_date::timestamp + r.starts_at,
      d.local_date::timestamp + r.ends_at - interval '30 minutes',
      interval '30 minutes'
    ) as slot_values(slot_local)
  ),
  active_booking_ranges as (
    select
      case
        when b.status = 'requested' then b.requested_starts_at
        when b.status = 'accepted' then b.starts_at
        when b.status = 'reschedule_pending' then coalesce(b.suggested_starts_at, b.requested_starts_at, b.starts_at)
      end as range_start,
      case
        when b.status = 'requested' then b.requested_ends_at
        when b.status = 'accepted' then b.ends_at
        when b.status = 'reschedule_pending' then coalesce(b.suggested_ends_at, b.requested_ends_at, b.ends_at)
      end as range_end
    from public.coach_call_bookings b
    where b.coach_id = selected_coach_id
      and b.status in ('requested', 'accepted', 'reschedule_pending')
  )
  select c.candidate_start, c.candidate_end
  from candidate_slots c
  where c.candidate_start >= now() + interval '2 hours'
    and not exists (
      select 1
      from public.coach_calendar_blocked_days bd
      where bd.coach_id = selected_coach_id
        and bd.blocked_date = c.local_date
    )
    and not exists (
      select 1
      from public.coach_calendar_blocks cb
      where cb.coach_id = selected_coach_id
        and cb.starts_at < c.candidate_end
        and cb.ends_at > c.candidate_start
    )
    and not exists (
      select 1
      from active_booking_ranges abr
      where abr.range_start is not null
        and abr.range_end is not null
        and abr.range_start < c.candidate_end
        and abr.range_end > c.candidate_start
    )
  order by c.candidate_start asc
  limit 200;
end;
$$;

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

  if p_requested_ends_at - p_requested_starts_at <> interval '30 minutes' then
    raise exception 'Coach calls must be requested in 30-minute slots.';
  end if;

  if p_requested_starts_at < now() + interval '2 hours' then
    raise exception 'Coach calls must be requested at least 2 hours in advance.';
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

  perform pg_advisory_xact_lock(hashtext(selected_coach_id::text), hashtext(p_requested_starts_at::text));

  if not exists (
    select 1
    from public.get_available_coach_call_slots(90) available_slots
    where available_slots.slot_start = p_requested_starts_at
      and available_slots.slot_end = p_requested_ends_at
  ) then
    raise exception 'This coach call slot is no longer available. Please choose another time.';
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

grant execute on function public.get_available_coach_call_slots(integer) to authenticated;
grant execute on function public.request_coach_call_booking(uuid, timestamptz, timestamptz, text, public.coach_call_booking_type) to authenticated;
