-- Grant authenticated users access to the coach booking tables.
-- Row-level security policies still control which rows each user can access.

GRANT USAGE ON TYPE public.calendar_block_type TO authenticated;
GRANT USAGE ON TYPE public.coach_call_booking_type TO authenticated;
GRANT USAGE ON TYPE public.coach_call_booking_status TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_calendar_blocks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_call_bookings TO authenticated;
