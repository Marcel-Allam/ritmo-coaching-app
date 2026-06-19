alter table public.clients
  add column if not exists tdee_gender text,
  add column if not exists date_of_birth date,
  add column if not exists height_cm numeric;
