# RITMO App Live Supabase Schema Reference

Last checked: 2026-06-23
Project: RITMO App (`ukhvnfbylqgytmylwbxp`)

This file exists because the live Supabase schema has moved ahead of the earliest committed migration files. Treat this as the current app-ready schema reference until the migrations are consolidated.

## Source-of-truth warning

The early migration `20260613135322_001_ritmo_schema.sql` no longer fully represents the live database. In particular, the live `clients` table is the main coach-created client record table, not a coach/client relationship join table.

Before making database changes, check this file and the live Supabase schema.

## Core identity tables

### `profiles`

Supabase auth extension table for app users.

Columns:
- `id uuid primary key`
- `role user_role not null` — `coach` or `client`
- `full_name text`
- `email text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `clients`

Main client record created and managed by the coach.

Columns:
- `id uuid primary key`
- `user_id uuid null` — linked Supabase auth user for the client login
- `full_name text not null`
- `email text`
- `phone text`
- `status text not null`
- `start_date date`
- `end_date date`
- `current_focus text`
- `next_review_date date`
- `next_call_date date`
- `private_coach_notes text`
- `tdee_gender text`
- `date_of_birth date`
- `height_cm numeric`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `client_invites`

One-time invite flow for linking a coach-created client record to a client login.

## Client configuration

### `client_settings`

Controls what each client sees and tracks.

Columns:
- `client_id uuid primary key references clients(id)`
- `nutrition_enabled boolean not null default false`
- `nutrition_tracking_mode text not null` — `simple`, `calories_protein`, `macros`, or `habits`
- `show_calorie_target boolean not null default false`
- `show_protein_target boolean not null default true`
- `show_macro_targets boolean not null default false`
- `bodyweight_enabled boolean not null default true`
- `progress_photos_enabled boolean not null default false`
- `workout_rpe_enabled boolean not null default true`
- `client_feedback_enabled boolean not null default true`
- `training_availability_enabled boolean not null default true`
- `settings_json jsonb not null default '{}'::jsonb`
- `show_key_lift_card boolean not null default true`
- `show_bodyweight_card boolean not null default true`
- `show_calorie_guideline_card boolean not null default false`
- `show_today_actions_card boolean not null default true`
- `show_upcoming_actions_card boolean not null default true`
- `show_latest_feedback_card boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `client_hub_settings`

Controls client hub visibility and nutrition target display.

Columns include:
- `client_id uuid not null unique references clients(id)`
- `show_calorie_target boolean not null default false`
- `calorie_target integer`
- `show_protein_target boolean not null default false`
- `protein_target_g integer`
- `show_carb_target boolean not null default false`
- `carb_target_g integer`
- `show_fat_target boolean not null default false`
- `fat_target_g integer`
- `show_bodyweight_card boolean not null default true`
- `show_submit_bodyweight boolean not null default true`
- `show_next_workout_card boolean not null default true`
- `show_coaching_status_card boolean not null default true`
- `show_progress_cards boolean not null default true`
- `target_notes text`
- `calorie_adjustment integer not null default -500`
- `protein_multiplier numeric not null default 1.80`
- `estimated_bmr integer`
- `estimated_tdee integer`
- `activity_multiplier numeric`
- `workouts_past_7_days integer not null default 0`

## Assigned tasks and flexible submissions

### `assigned_tasks`

Coach-created tasks assigned to a client.

Columns:
- `id uuid primary key`
- `client_id uuid not null references clients(id)`
- `task_name text not null`
- `task_type text not null`
- `frequency text not null`
- `required boolean not null`
- `start_date date`
- `end_date date`
- `active boolean not null`
- `instructions text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Common `task_type` values used by the app:
- `weekly_checkin`
- `training_availability`
- `workout_checkin`
- `key_lift`
- `nutrition`
- `bodyweight`
- `progress_photo`
- `habit_check`

### `task_submissions`

Flexible submission summary table used by the coach review workflow.

Columns:
- `id uuid primary key`
- `client_id uuid not null references clients(id)`
- `assigned_task_id uuid null references assigned_tasks(id)`
- `submitted_at timestamptz not null`
- `submission_type text not null`
- `answer_value numeric`
- `answer_text text`
- `file_url text`
- `review_status review_status not null`
- `coach_note text`
- `followup_required boolean not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

## Delivery submissions

### `weekly_checkins`

Short pre-call weekly check-in.

### `nutrition_submissions`

Structured nutrition tracking data.

Columns:
- `id uuid primary key`
- `client_id uuid not null references clients(id)`
- `submitted_at timestamptz not null`
- `submission_date date not null`
- `tracking_mode text not null`
- `calories numeric`
- `protein_g numeric`
- `carbs_g numeric`
- `fats_g numeric`
- `meal_photo_url text`
- `habit_completed boolean`
- `notes text`
- `review_status review_status not null`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `bodyweight_entries`

Structured bodyweight log.

Columns:
- `id uuid primary key`
- `client_id uuid not null references clients(id)`
- `submitted_at timestamptz not null`
- `entry_date date not null`
- `bodyweight_kg numeric not null`
- `notes text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `workout_sessions`

A completed or in-progress run of a programme workout.

Columns include:
- `id uuid primary key`
- `client_id uuid not null references clients(id)`
- `program_workout_id uuid not null references program_workouts(id)`
- `started_at timestamptz not null default now()`
- `completed_at timestamptz`
- `status text not null` — `in_progress`, `completed`, or `reviewed`
- `review_status review_status not null`
- `client_notes text`
- `coach_note text`
- `is_calibration boolean not null default false`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### `performed_sets`

Actual set logs submitted inside a workout session.

Columns include:
- `id uuid primary key`
- `session_id uuid not null references workout_sessions(id)`
- `program_exercise_id uuid not null references program_exercises(id)`
- `program_set_id uuid null references program_sets(id)`
- `set_order integer not null`
- `actual_weight_kg numeric`
- `actual_reps integer`
- `actual_rpe numeric`
- `completed boolean not null default true`
- `notes text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

### Other submission tables

- `workout_checkins`
- `key_lift_entries`
- `progress_reviews`

## Training programme tables

Current programme/workout system:
- `training_programs`
- `program_workouts`
- `program_exercises`
- `program_sets`
- `workout_sessions`
- `performed_sets`
- `exercise_catalogue`
- `program_periodisation_settings`
- `program_calibration_lifts`

### `program_periodisation_settings`

Manual-first periodisation settings for a client programme. One settings row is expected per `training_programs` row.

Columns:
- `id uuid primary key`
- `program_id uuid not null unique references training_programs(id)`
- `client_id uuid not null references clients(id)`
- `programme_length_weeks integer not null default 12`
- `current_week integer not null default 0`
- `current_block_name text not null default 'Calibration'`
- `current_block_start_week integer not null default 0`
- `current_block_end_week integer not null default 0`
- `current_block_goal text`
- `client_explanation text`
- `next_block_name text`
- `loading_guide text`
- `client_visible boolean not null default true`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

V1 block convention:
- Week 0: Calibration
- Weeks 1–4: Accumulation
- Weeks 5–8: Intensification
- Weeks 9–10: Peak / Realisation
- Week 11: Deload / Taper
- Week 12: Test / Review

### `program_calibration_lifts`

Stores calibration top sets and generated estimated 1RM values for key lifts inside a programme.

Columns:
- `id uuid primary key`
- `program_id uuid not null references training_programs(id)`
- `client_id uuid not null references clients(id)`
- `lift_name text not null`
- `top_set_weight_kg numeric not null`
- `top_set_reps integer not null`
- `estimated_1rm_kg numeric generated always as round(weight * (1 + reps / 30), 1) stored`
- `source_session_id uuid null references workout_sessions(id)`
- `source_performed_set_id uuid null references performed_sets(id)`
- `formula text not null default 'weight * (1 + reps / 30)'`
- `client_visible boolean not null default true`
- `notes text`
- `created_at timestamptz not null`
- `updated_at timestamptz not null`

Constraints:
- unique `(program_id, lift_name)`

## Feedback, insight, and action tables

### `feedback_notes`

Structured coach feedback visible to clients when `client_visible = true`.

Columns include:
- `client_id`
- `coach_id`
- `feedback_date`
- `main_win`
- `main_focus`
- `agreed_action`
- `plan_change`
- `next_review_date`
- `client_visible`

### `insight_flags`

Stores coaching insight signals, separate from raw data.

### `coach_actions`

Coach execution queue.

## Enums

### `user_role`
- `coach`
- `client`

### `review_status`
- `new`
- `reviewed`
- `needs_feedback`
- `needs_action`
- `flagged`
- `resolved`

### `priority_level`
- `low`
- `medium`
- `high`

### `coach_action_status`
- `new`
- `in_progress`
- `waiting_on_client`
- `waiting_on_coach`
- `done`
- `no_action_needed`

## RLS policy summary

Live RLS is enabled on key tables. Current policy pattern:
- Coaches can manage clients, assigned tasks, submissions, feedback notes, insight flags, coach actions, training programmes, workout sessions, performed sets, periodisation settings, and calibration lifts.
- Clients can view their own client record.
- Clients can insert/view their own nutrition submissions, bodyweight entries, task submissions, workout sessions, and performed sets.
- Clients can view their own visible periodisation settings and calibration lifts when `client_visible = true`.
- Clients can only view feedback notes where `client_visible = true`.

## Current build implication

New app features should target the live table shape above. Do not reintroduce the older `clients(coach_id, client_id)` relationship-table assumption.
