-- Add coach calendar availability settings.
-- These settings define recurring bookable hours and full blocked weekdays.

CREATE TABLE IF NOT EXISTS public.coach_calendar_availability_settings (
  coach_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Europe/London',
  appointment_duration_minutes integer NOT NULL DEFAULT 30 CHECK (appointment_duration_minutes IN (30, 45, 60, 90)),
  booking_window_days integer NOT NULL DEFAULT 14 CHECK (booking_window_days BETWEEN 1 AND 90),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coach_calendar_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  weekday integer NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  is_available boolean NOT NULL DEFAULT true,
  starts_at time NOT NULL DEFAULT '09:00',
  ends_at time NOT NULL DEFAULT '17:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_calendar_availability_rules_valid_time CHECK (ends_at > starts_at),
  CONSTRAINT coach_calendar_availability_rules_unique_day UNIQUE (coach_id, weekday)
);

CREATE TABLE IF NOT EXISTS public.coach_calendar_blocked_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coach_calendar_blocked_days_unique UNIQUE (coach_id, blocked_date)
);

CREATE INDEX IF NOT EXISTS idx_coach_calendar_availability_rules_coach_weekday
  ON public.coach_calendar_availability_rules (coach_id, weekday);

CREATE INDEX IF NOT EXISTS idx_coach_calendar_blocked_days_coach_date
  ON public.coach_calendar_blocked_days (coach_id, blocked_date);

ALTER TABLE public.coach_calendar_availability_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_calendar_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_calendar_blocked_days ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_coach_calendar_availability_settings_updated_at ON public.coach_calendar_availability_settings;
CREATE TRIGGER set_coach_calendar_availability_settings_updated_at
  BEFORE UPDATE ON public.coach_calendar_availability_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_coach_calendar_availability_rules_updated_at ON public.coach_calendar_availability_rules;
CREATE TRIGGER set_coach_calendar_availability_rules_updated_at
  BEFORE UPDATE ON public.coach_calendar_availability_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_coach_calendar_blocked_days_updated_at ON public.coach_calendar_blocked_days;
CREATE TRIGGER set_coach_calendar_blocked_days_updated_at
  BEFORE UPDATE ON public.coach_calendar_blocked_days
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP POLICY IF EXISTS "Coaches can manage own calendar availability settings" ON public.coach_calendar_availability_settings;
CREATE POLICY "Coaches can manage own calendar availability settings"
  ON public.coach_calendar_availability_settings
  FOR ALL
  TO authenticated
  USING (public.is_coach() AND coach_id = auth.uid())
  WITH CHECK (public.is_coach() AND coach_id = auth.uid());

DROP POLICY IF EXISTS "Coaches can manage own calendar availability rules" ON public.coach_calendar_availability_rules;
CREATE POLICY "Coaches can manage own calendar availability rules"
  ON public.coach_calendar_availability_rules
  FOR ALL
  TO authenticated
  USING (public.is_coach() AND coach_id = auth.uid())
  WITH CHECK (public.is_coach() AND coach_id = auth.uid());

DROP POLICY IF EXISTS "Coaches can manage own blocked calendar days" ON public.coach_calendar_blocked_days;
CREATE POLICY "Coaches can manage own blocked calendar days"
  ON public.coach_calendar_blocked_days
  FOR ALL
  TO authenticated
  USING (public.is_coach() AND coach_id = auth.uid())
  WITH CHECK (public.is_coach() AND coach_id = auth.uid());

DROP POLICY IF EXISTS "Clients can view coach calendar availability settings" ON public.coach_calendar_availability_settings;
CREATE POLICY "Clients can view coach calendar availability settings"
  ON public.coach_calendar_availability_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Clients can view coach calendar availability rules" ON public.coach_calendar_availability_rules;
CREATE POLICY "Clients can view coach calendar availability rules"
  ON public.coach_calendar_availability_rules
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Clients can view coach blocked calendar days" ON public.coach_calendar_blocked_days;
CREATE POLICY "Clients can view coach blocked calendar days"
  ON public.coach_calendar_blocked_days
  FOR SELECT
  TO authenticated
  USING (true);
