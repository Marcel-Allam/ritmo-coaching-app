-- RITMO Coaching App Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('coach', 'client')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coach-Client relationship
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  UNIQUE(coach_id, client_id)
);

-- Client profiles (coaching-specific data)
CREATE TABLE client_profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  current_focus TEXT,
  next_review_date DATE,
  next_call_date DATE,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Assigned tasks
CREATE TABLE assigned_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Submissions (generic parent)
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('weekly_checkin', 'workout_checkin', 'key_lift', 'nutrition', 'bodyweight')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'reviewed', 'flagged')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

-- Weekly check-ins
CREATE TABLE weekly_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE UNIQUE,
  week_start DATE NOT NULL,
  energy INT CHECK (energy BETWEEN 1 AND 10),
  sleep_quality INT CHECK (sleep_quality BETWEEN 1 AND 10),
  stress INT CHECK (stress BETWEEN 1 AND 10),
  motivation INT CHECK (motivation BETWEEN 1 AND 10),
  adherence INT CHECK (adherence BETWEEN 1 AND 10),
  notes TEXT,
  pain_flags TEXT,
  wins TEXT
);

-- Workout check-ins
CREATE TABLE workout_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE UNIQUE,
  workout_date DATE NOT NULL,
  session_name TEXT NOT NULL,
  rpe INT CHECK (rpe BETWEEN 1 AND 10),
  volume_completed BOOLEAN DEFAULT true,
  notes TEXT
);

-- Key lift / top set entries
CREATE TABLE key_lifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE UNIQUE,
  exercise_name TEXT NOT NULL,
  top_set_weight DECIMAL(7,2) NOT NULL,
  top_set_reps INT NOT NULL,
  estimated_1rm DECIMAL(7,2),
  notes TEXT
);

-- Nutrition submissions
CREATE TABLE nutrition_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE UNIQUE,
  date DATE NOT NULL,
  calories INT,
  protein_g DECIMAL(6,1),
  carbs_g DECIMAL(6,1),
  fats_g DECIMAL(6,1),
  adherence INT CHECK (adherence BETWEEN 1 AND 10),
  notes TEXT
);

-- Bodyweight entries
CREATE TABLE bodyweight_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE UNIQUE,
  weight DECIMAL(5,1) NOT NULL,
  weighed_at DATE NOT NULL,
  notes TEXT
);

-- Insight flags (pain, support, milestone, etc.)
CREATE TABLE insight_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('pain', 'support', 'milestone', 'stall', 'breakthrough')),
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  message TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Coach actions (action queue)
CREATE TABLE coach_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('review_checkin', 'review_workout', 'review_lift', 'review_nutrition', 'review_bodyweight', 'send_feedback', 'schedule_review', 'update_program')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Feedback notes
CREATE TABLE feedback_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Progress reviews
CREATE TABLE progress_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  review_date DATE NOT NULL,
  summary TEXT NOT NULL,
  adjustments TEXT,
  next_focus TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE assigned_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE key_lifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE nutrition_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodyweight_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE insight_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_reviews ENABLE ROW LEVEL SECURITY;

-- Profiles RLS
CREATE POLICY "select_own_profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
-- Coaches need to see client profiles
CREATE POLICY "coach_view_clients" ON profiles FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM clients WHERE clients.coach_id = auth.uid() AND clients.client_id = profiles.id)
);

-- Clients RLS - coaches see their clients, clients see their own relationships
CREATE POLICY "coach_manage_clients" ON clients FOR SELECT TO authenticated USING (coach_id = auth.uid() OR client_id = auth.uid());
CREATE POLICY "coach_insert_clients" ON clients FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_update_clients" ON clients FOR UPDATE TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_delete_clients" ON clients FOR DELETE TO authenticated USING (coach_id = auth.uid());

-- Client profiles RLS
CREATE POLICY "select_own_client_profile" ON client_profiles FOR SELECT TO authenticated USING (
  client_id = auth.uid() OR EXISTS (SELECT 1 FROM clients WHERE clients.coach_id = auth.uid() AND clients.client_id = client_profiles.client_id)
);
CREATE POLICY "insert_own_client_profile" ON client_profiles FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());
CREATE POLICY "update_own_client_profile" ON client_profiles FOR UPDATE TO authenticated USING (
  client_id = auth.uid() OR EXISTS (SELECT 1 FROM clients WHERE clients.coach_id = auth.uid() AND clients.client_id = client_profiles.client_id)
);

-- Assigned tasks RLS
CREATE POLICY "select_own_tasks" ON assigned_tasks FOR SELECT TO authenticated USING (client_id = auth.uid() OR coach_id = auth.uid());
CREATE POLICY "coach_insert_tasks" ON assigned_tasks FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "update_own_tasks" ON assigned_tasks FOR UPDATE TO authenticated USING (coach_id = auth.uid() OR client_id = auth.uid()) WITH CHECK (coach_id = auth.uid() OR client_id = auth.uid());
CREATE POLICY "coach_delete_tasks" ON assigned_tasks FOR DELETE TO authenticated USING (coach_id = auth.uid());

-- Submissions RLS
CREATE POLICY "select_own_submissions" ON submissions FOR SELECT TO authenticated USING (client_id = auth.uid() OR coach_id = auth.uid());
CREATE POLICY "insert_own_submissions" ON submissions FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());
CREATE POLICY "update_own_submissions" ON submissions FOR UPDATE TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());

-- Weekly checkins RLS (via submission ownership)
CREATE POLICY "select_accessible_checkins" ON weekly_checkins FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = weekly_checkins.submission_id AND (submissions.client_id = auth.uid() OR submissions.coach_id = auth.uid()))
);
CREATE POLICY "insert_accessible_checkins" ON weekly_checkins FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = weekly_checkins.submission_id AND submissions.client_id = auth.uid())
);
CREATE POLICY "update_accessible_checkins" ON weekly_checkins FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = weekly_checkins.submission_id AND submissions.coach_id = auth.uid())
);

-- Workout checkins RLS
CREATE POLICY "select_accessible_workout_checkins" ON workout_checkins FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = workout_checkins.submission_id AND (submissions.client_id = auth.uid() OR submissions.coach_id = auth.uid()))
);
CREATE POLICY "insert_accessible_workout_checkins" ON workout_checkins FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = workout_checkins.submission_id AND submissions.client_id = auth.uid())
);
CREATE POLICY "update_accessible_workout_checkins" ON workout_checkins FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = workout_checkins.submission_id AND submissions.coach_id = auth.uid())
);

-- Key lifts RLS
CREATE POLICY "select_accessible_key_lifts" ON key_lifts FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = key_lifts.submission_id AND (submissions.client_id = auth.uid() OR submissions.coach_id = auth.uid()))
);
CREATE POLICY "insert_accessible_key_lifts" ON key_lifts FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = key_lifts.submission_id AND submissions.client_id = auth.uid())
);
CREATE POLICY "update_accessible_key_lifts" ON key_lifts FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = key_lifts.submission_id AND submissions.coach_id = auth.uid())
);

-- Nutrition submissions RLS
CREATE POLICY "select_accessible_nutrition" ON nutrition_submissions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = nutrition_submissions.submission_id AND (submissions.client_id = auth.uid() OR submissions.coach_id = auth.uid()))
);
CREATE POLICY "insert_accessible_nutrition" ON nutrition_submissions FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = nutrition_submissions.submission_id AND submissions.client_id = auth.uid())
);
CREATE POLICY "update_accessible_nutrition" ON nutrition_submissions FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = nutrition_submissions.submission_id AND submissions.coach_id = auth.uid())
);

-- Bodyweight entries RLS
CREATE POLICY "select_accessible_bodyweight" ON bodyweight_entries FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = bodyweight_entries.submission_id AND (submissions.client_id = auth.uid() OR submissions.coach_id = auth.uid()))
);
CREATE POLICY "insert_accessible_bodyweight" ON bodyweight_entries FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = bodyweight_entries.submission_id AND submissions.client_id = auth.uid())
);
CREATE POLICY "update_accessible_bodyweight" ON bodyweight_entries FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM submissions WHERE submissions.id = bodyweight_entries.submission_id AND submissions.coach_id = auth.uid())
);

-- Insight flags RLS
CREATE POLICY "select_own_flags" ON insight_flags FOR SELECT TO authenticated USING (coach_id = auth.uid() OR client_id = auth.uid());
CREATE POLICY "coach_insert_flags" ON insight_flags FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_update_flags" ON insight_flags FOR UPDATE TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_delete_flags" ON insight_flags FOR DELETE TO authenticated USING (coach_id = auth.uid());

-- Coach actions RLS
CREATE POLICY "select_own_actions" ON coach_actions FOR SELECT TO authenticated USING (coach_id = auth.uid());
CREATE POLICY "insert_own_actions" ON coach_actions FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "update_own_actions" ON coach_actions FOR UPDATE TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "delete_own_actions" ON coach_actions FOR DELETE TO authenticated USING (coach_id = auth.uid());

-- Feedback notes RLS
CREATE POLICY "select_own_feedback" ON feedback_notes FOR SELECT TO authenticated USING (coach_id = auth.uid() OR client_id = auth.uid());
CREATE POLICY "coach_insert_feedback" ON feedback_notes FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_update_feedback" ON feedback_notes FOR UPDATE TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_delete_feedback" ON feedback_notes FOR DELETE TO authenticated USING (coach_id = auth.uid());

-- Progress reviews RLS
CREATE POLICY "select_own_reviews" ON progress_reviews FOR SELECT TO authenticated USING (coach_id = auth.uid() OR client_id = auth.uid());
CREATE POLICY "coach_insert_reviews" ON progress_reviews FOR INSERT TO authenticated WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_update_reviews" ON progress_reviews FOR UPDATE TO authenticated USING (coach_id = auth.uid()) WITH CHECK (coach_id = auth.uid());
CREATE POLICY "coach_delete_reviews" ON progress_reviews FOR DELETE TO authenticated USING (coach_id = auth.uid());

-- Index for common lookups
CREATE INDEX idx_clients_coach_id ON clients(coach_id);
CREATE INDEX idx_clients_client_id ON clients(client_id);
CREATE INDEX idx_submissions_client_id ON submissions(client_id);
CREATE INDEX idx_submissions_coach_id ON submissions(coach_id);
CREATE INDEX idx_assigned_tasks_client_id ON assigned_tasks(client_id);
CREATE INDEX idx_coach_actions_coach_id ON coach_actions(coach_id);
CREATE INDEX idx_insight_flags_client_id ON insight_flags(client_id);
CREATE INDEX idx_feedback_notes_client_id ON feedback_notes(client_id);