-- Client-facing helpers for requesting and responding to coach call bookings.
-- Current app schema stores client user ownership on public.clients.user_id and does not yet store coach_id per client.
-- For the current single-coach app, new requests are assigned to the first coach profile.

CREATE OR REPLACE FUNCTION public.request_coach_call_booking(
  p_client_id uuid,
  p_client_notes text DEFAULT NULL,
  p_booking_type public.coach_call_booking_type DEFAULT 'weekly_call'
)
RETURNS public.coach_call_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
  v_booking public.coach_call_bookings;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.clients
    WHERE clients.id = p_client_id
      AND clients.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Client record not found for this user.' USING ERRCODE = '42501';
  END IF;

  SELECT profiles.id
  INTO v_coach_id
  FROM public.profiles
  WHERE profiles.role = 'coach'
  ORDER BY profiles.created_at ASC
  LIMIT 1;

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'No coach profile found.';
  END IF;

  INSERT INTO public.coach_call_bookings (
    coach_id,
    client_id,
    booking_type,
    status,
    client_notes
  ) VALUES (
    v_coach_id,
    p_client_id,
    p_booking_type,
    'requested',
    NULLIF(trim(p_client_notes), '')
  )
  RETURNING * INTO v_booking;

  RETURN v_booking;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_to_coach_call_reschedule(
  p_booking_id uuid,
  p_accept boolean
)
RETURNS public.coach_call_bookings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.coach_call_bookings;
BEGIN
  SELECT coach_call_bookings.*
  INTO v_booking
  FROM public.coach_call_bookings
  JOIN public.clients ON clients.id = coach_call_bookings.client_id
  WHERE coach_call_bookings.id = p_booking_id
    AND clients.user_id = auth.uid();

  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found for this user.' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status <> 'reschedule_pending' THEN
    RAISE EXCEPTION 'This booking is not waiting for a reschedule response.';
  END IF;

  IF p_accept THEN
    IF v_booking.suggested_starts_at IS NULL OR v_booking.suggested_ends_at IS NULL THEN
      RAISE EXCEPTION 'No suggested time exists for this booking.';
    END IF;

    UPDATE public.coach_call_bookings
    SET
      status = 'accepted',
      starts_at = suggested_starts_at,
      ends_at = suggested_ends_at
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;
  ELSE
    UPDATE public.coach_call_bookings
    SET
      status = 'requested',
      suggested_starts_at = NULL,
      suggested_ends_at = NULL
    WHERE id = p_booking_id
    RETURNING * INTO v_booking;
  END IF;

  RETURN v_booking;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_coach_call_booking(uuid, text, public.coach_call_booking_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_coach_call_reschedule(uuid, boolean) TO authenticated;
