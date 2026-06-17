-- Add proper coach calendar and call booking foundation.
-- This replaces the temporary coach-call workflow that currently uses task_submissions.

DO $$
BEGIN
  CREATE TYPE public.calendar_block_type AS ENUM ('available', 'blocked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.coach_call_booking_type AS ENUM ('weekly_call', 'extra_support');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE public.coach_call_booking_status AS ENUM (
    'requested',
    'accepted',
    'declined',
    'reschedule_pending',
    'cancelled',
    'completed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.coach_calendar_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  block_type public.calendar_block_type NOT NULL,
  title text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_calendar_blocks_valid_time CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.coach_call_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  booking_type public.coach_call_booking_type NOT NULL DEFAULT 'weekly_call',
  starts_at timestamptz,
  ends_at timestamptz,
  status public.coach_call_booking_status NOT NULL DEFAULT 'requested',
  client_notes text,
  coach_note text,
  suggested_starts_at timestamptz,
  suggested_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_call_bookings_valid_time CHECK (
    (starts_at IS NULL AND ends_at IS NULL)
    OR (starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
  ),
  CONSTRAINT coach_call_bookings_valid_suggested_time CHECK (
    (suggested_starts_at IS NULL AND suggested_ends_at IS NULL)
    OR (suggested_starts_at IS NOT NULL AND suggested_ends_at IS NOT NULL AND suggested_ends_at > suggested_starts_at)
  )
);

CREATE INDEX IF NOT EXISTS idx_coach_calendar_blocks_coach_starts
  ON public.coach_calendar_blocks (coach_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_coach_calendar_blocks_coach_range
  ON public.coach_calendar_blocks (coach_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_coach_calendar_blocks_type
  ON public.coach_calendar_blocks (block_type);

CREATE INDEX IF NOT EXISTS idx_coach_call_bookings_coach_starts
  ON public.coach_call_bookings (coach_id, starts_at);

CREATE INDEX IF NOT EXISTS idx_coach_call_bookings_coach_status
  ON public.coach_call_bookings (coach_id, status);

CREATE INDEX IF NOT EXISTS idx_coach_call_bookings_client_created
  ON public.coach_call_bookings (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_coach_call_bookings_client_status
  ON public.coach_call_bookings (client_id, status);

ALTER TABLE public.coach_calendar_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_call_bookings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_coach_calendar_blocks_updated_at ON public.coach_calendar_blocks;
CREATE TRIGGER set_coach_calendar_blocks_updated_at
  BEFORE UPDATE ON public.coach_calendar_blocks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_coach_call_bookings_updated_at ON public.coach_call_bookings;
CREATE TRIGGER set_coach_call_bookings_updated_at
  BEFORE UPDATE ON public.coach_call_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "Coaches can manage own calendar blocks" ON public.coach_calendar_blocks;
CREATE POLICY "Coaches can manage own calendar blocks"
  ON public.coach_calendar_blocks
  FOR ALL
  TO authenticated
  USING (public.is_coach() AND coach_id = auth.uid())
  WITH CHECK (public.is_coach() AND coach_id = auth.uid());

DROP POLICY IF EXISTS "Coaches can manage own call bookings" ON public.coach_call_bookings;
CREATE POLICY "Coaches can manage own call bookings"
  ON public.coach_call_bookings
  FOR ALL
  TO authenticated
  USING (public.is_coach() AND coach_id = auth.uid())
  WITH CHECK (public.is_coach() AND coach_id = auth.uid());

DROP POLICY IF EXISTS "Clients can view own call bookings" ON public.coach_call_bookings;
CREATE POLICY "Clients can view own call bookings"
  ON public.coach_call_bookings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients
      WHERE clients.id = coach_call_bookings.client_id
        AND clients.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients can request own call bookings" ON public.coach_call_bookings;
CREATE POLICY "Clients can request own call bookings"
  ON public.coach_call_bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'requested'
    AND EXISTS (
      SELECT 1
      FROM public.clients
      WHERE clients.id = coach_call_bookings.client_id
        AND clients.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Clients can respond to own call bookings" ON public.coach_call_bookings;
CREATE POLICY "Clients can respond to own call bookings"
  ON public.coach_call_bookings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clients
      WHERE clients.id = coach_call_bookings.client_id
        AND clients.user_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('requested', 'accepted', 'declined')
    AND EXISTS (
      SELECT 1
      FROM public.clients
      WHERE clients.id = coach_call_bookings.client_id
        AND clients.user_id = auth.uid()
    )
  );
