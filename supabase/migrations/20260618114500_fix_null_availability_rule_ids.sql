-- Make availability rule inserts resilient if a stale client bundle sends id = null.
-- Postgres defaults do not fire when a column is explicitly set to NULL, so this trigger fills the UUID before insert.

CREATE OR REPLACE FUNCTION public.set_availability_rule_id_when_null()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_availability_rule_id_when_null ON public.coach_calendar_availability_rules;
CREATE TRIGGER set_availability_rule_id_when_null
  BEFORE INSERT ON public.coach_calendar_availability_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_availability_rule_id_when_null();
