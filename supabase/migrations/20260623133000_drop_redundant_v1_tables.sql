-- Drop redundant tables and old task/review infrastructure after the V1 cleanup.
-- Keep task_submissions because the current workout-review/action queue still uses it.

-- Remove the old weekly task recurrence trigger/function that depended on assigned_tasks.
drop trigger if exists task_submissions_create_next_weekly_client_task on public.task_submissions;
drop function if exists public.create_next_weekly_client_task();

-- Remove obsolete nullable task linkage from the retained task_submissions table.
alter table if exists public.task_submissions
  drop column if exists assigned_task_id;

-- Drop old task/request tables that are no longer referenced by the app.
drop table if exists public.assigned_tasks cascade;
drop table if exists public.workout_checkins cascade;
drop table if exists public.key_lift_entries cascade;
drop table if exists public.nutrition_submissions cascade;
drop table if exists public.client_review_logs cascade;
drop table if exists public.client_settings cascade;

-- Drop legacy MVP-era generic submission/analytics tables that are no longer used.
drop table if exists public.weekly_checkins cascade;
drop table if exists public.key_lifts cascade;
drop table if exists public.coach_actions cascade;
drop table if exists public.insight_flags cascade;
drop table if exists public.progress_reviews cascade;
drop table if exists public.client_profiles cascade;
drop table if exists public.submissions cascade;
