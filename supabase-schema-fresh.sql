-- HVAC Dashboard - Fresh Database Schema
-- This drops and recreates all tables based on project requirements

-- Drop all existing objects in correct dependency order
DROP FUNCTION IF EXISTS delete_employee(UUID) CASCADE;
DROP FUNCTION IF EXISTS invite_employee(TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS invite_employee(TEXT, TEXT, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users CASCADE;
DROP TABLE IF EXISTS work_logs CASCADE;
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. PROFILES TABLE - Stores user information
-- ============================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for role queries
CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_email ON profiles(email);

-- ============================================================================
-- 2. WORK_LOGS TABLE - Records employee work hours and tasks
-- ============================================================================
CREATE TABLE work_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hours_worked NUMERIC(5, 2) NOT NULL CHECK (hours_worked > 0),
  location TEXT NOT NULL,
  log_date DATE NOT NULL,
  task_description TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_work_logs_employee_id ON work_logs(employee_id);
CREATE INDEX idx_work_logs_log_date ON work_logs(log_date);
CREATE INDEX idx_work_logs_created_at ON work_logs(created_at DESC);

-- ============================================================================
-- 3. INVITATIONS TABLE - Tracks pending employee invitations
-- ============================================================================
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES profiles(id),
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired'))
);

-- Create indexes for invitations queries
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_status ON invitations(status);

-- ============================================================================
-- 4. TRIGGER - Automatically create profile when user signs up
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invite_record RECORD;
  user_full_name TEXT;
  user_role TEXT;
BEGIN
  -- Check if there's a pending invitation for this email
  SELECT * INTO invite_record
  FROM public.invitations
  WHERE email = NEW.email AND status = 'pending'
  LIMIT 1;

  -- Use invitation data if available, otherwise use defaults
  user_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    invite_record.full_name,
    split_part(NEW.email, '@', 1)
  );

  user_role := COALESCE(
    NEW.raw_user_meta_data->>'role',
    invite_record.role,
    'employee'
  );

  -- Create the profile
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, user_full_name, user_role);

  -- Mark invitation as accepted if it exists
  IF invite_record.id IS NOT NULL THEN
    UPDATE public.invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = invite_record.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new user signups
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- 5. DATABASE FUNCTIONS - Business logic
-- ============================================================================

-- Function to invite a new employee
CREATE OR REPLACE FUNCTION invite_employee(
  employee_email TEXT,
  employee_name TEXT,
  employee_role TEXT DEFAULT 'employee'
)
RETURNS JSON AS $$
DECLARE
  caller_role TEXT;
  caller_id UUID;
  invite_id UUID;
  caller_email TEXT;
  caller_full_name TEXT;
BEGIN
  -- Get the caller (must be authenticated)
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RETURN json_build_object('error', 'User not authenticated');
  END IF;

  -- Check if caller is an admin: prefer profile role, fallback to auth user metadata
  SELECT role, email, full_name INTO caller_role, caller_email, caller_full_name
  FROM profiles
  WHERE id = caller_id;

  IF caller_role IS NULL THEN
    SELECT raw_user_meta_data->>'role', raw_user_meta_data->>'full_name', email
    INTO caller_role, caller_full_name, caller_email
    FROM auth.users
    WHERE id = caller_id;
  END IF;

  -- if we found an admin role in auth metadata, ensure the profile exists
  IF caller_role = 'admin' AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = caller_id) THEN
    INSERT INTO profiles (id, email, full_name, role)
    VALUES (caller_id, COALESCE(caller_email, ''), COALESCE(caller_full_name, 'Administrator'), 'admin')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF caller_role IS NULL THEN
    RETURN json_build_object('error', 'User profile not found');
  END IF;

  IF caller_role != 'admin' THEN
    RETURN json_build_object('error', 'Only admins can invite employees');
  END IF;

  -- Validate inputs
  IF employee_email IS NULL OR employee_name IS NULL THEN
    RETURN json_build_object('error', 'Invalid input: email and name required');
  END IF;

  -- Check if user already exists
  IF EXISTS (SELECT 1 FROM profiles WHERE email = employee_email) THEN
    RETURN json_build_object('error', 'User with this email already exists');
  END IF;

  -- Check if invitation already exists
  IF EXISTS (SELECT 1 FROM invitations WHERE email = employee_email AND status = 'pending') THEN
    RETURN json_build_object('error', 'Invitation already sent to this email');
  END IF;

  -- Create invitation record
  invite_id := uuid_generate_v4();
  INSERT INTO invitations (id, email, invited_by, full_name, role)
  VALUES (invite_id, employee_email, caller_id, employee_name, employee_role);

  RETURN json_build_object(
    'success', true,
    'message', 'Employee invitation created successfully',
    'email', employee_email,
    'invitation_id', invite_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete an employee
CREATE OR REPLACE FUNCTION delete_employee(employee_id UUID)
RETURNS JSON AS $$
DECLARE
  caller_role TEXT;
  caller_id UUID;
BEGIN
  -- Get the caller (must be authenticated)
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RETURN json_build_object('error', 'User not authenticated');
  END IF;

  -- Check if caller is an admin: prefer profile role, fallback to auth user metadata
  SELECT role INTO caller_role FROM profiles WHERE id = caller_id;

  IF caller_role IS NULL THEN
    SELECT raw_user_meta_data->>'role' INTO caller_role
    FROM auth.users
    WHERE id = caller_id;
  END IF;

  IF caller_role != 'admin' THEN
    RETURN json_build_object('error', 'Only admins can delete employees');
  END IF;

  -- Delete the profile (work_logs will be deleted via CASCADE)
  DELETE FROM profiles WHERE id = employee_id;

  -- Also mark any invitations as expired
  UPDATE invitations
  SET status = 'expired'
  WHERE email = (SELECT email FROM profiles WHERE id = employee_id LIMIT 1)
    AND status = 'pending';

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. ROW LEVEL SECURITY (Disabled for now - can be enabled later)
-- ============================================================================
-- RLS is disabled to avoid recursion issues
-- Access control is handled by functions and application logic
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE invitations DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 7. INITIAL SETUP (Optional - remove if not needed)
-- ============================================================================
-- Insert admin user (replace with actual admin email)
-- You'll need to create the auth user first, then the profile will be created by trigger
-- Or directly insert if needed:
-- INSERT INTO profiles (id, email, full_name, role) 
-- VALUES (uuid_generate_v4(), 'admin@hvac.com', 'Admin User', 'admin');
