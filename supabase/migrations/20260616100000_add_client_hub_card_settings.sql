alter table public.client_settings
  add column if not exists show_key_lift_card boolean not null default true,
  add column if not exists show_bodyweight_card boolean not null default true,
  add column if not exists show_calorie_guideline_card boolean not null default false,
  add column if not exists show_today_actions_card boolean not null default true,
  add column if not exists show_upcoming_actions_card boolean not null default true,
  add column if not exists show_latest_feedback_card boolean not null default true;
