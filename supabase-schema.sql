-- HVAC Dashboard Database Schema
-- Run this SQL in your Supabase SQL Editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'employee',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create work_logs table
CREATE TABLE IF NOT EXISTS work_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hours_worked NUMERIC NOT NULL,
  location TEXT NOT NULL,
  log_date DATE NOT NULL,
  notes TEXT,
  task_description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_work_logs_employee_id ON work_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_log_date ON work_logs(log_date);

-- For now, disable RLS to avoid recursion issues
-- You can enable this after setting up proper access control
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs DISABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can update all work logs" ON work_logs
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  invite_record RECORD;
BEGIN
  -- Check if there's a pending invitation for this email
  SELECT * INTO invite_record
  FROM invitations
  WHERE email = NEW.email AND status = 'pending'
  LIMIT 1;

  -- Create profile with role from invitation or default to employee
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      invite_record.full_name,
      split_part(NEW.email, '@', 1)
    ),
    COALESCE(
      NEW.raw_user_meta_data->>'role',
      invite_record.role,
      'employee'
    )
  );

  -- Mark invitation as accepted if it exists
  IF invite_record.id IS NOT NULL THEN
    UPDATE invitations
    SET status = 'accepted', accepted_at = NOW()
    WHERE id = invite_record.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile on signup
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create invitations table to track pending invites
CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES profiles(id),
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired'))
);

-- Function to handle employee invitation (store in invitations table)
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
BEGIN
  -- Check if caller is authenticated and is admin
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RETURN json_build_object('error', 'User not authenticated');
  END IF;

  SELECT role INTO caller_role FROM profiles WHERE id = caller_id;
  IF caller_role IS NULL THEN
    RETURN json_build_object('error', 'User profile not found');
  END IF;

  IF caller_role != 'admin' THEN
    RETURN json_build_object('error', 'Only admins can invite employees');
  END IF;

  -- Check if user already exists in profiles
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

  -- Note: In a real application, you would send an email here
  -- For now, we'll just create the invitation record
  RETURN json_build_object(
    'success', true,
    'message', 'Employee invitation created successfully',
    'email', employee_email,
    'invitation_id', invite_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to delete employee
CREATE OR REPLACE FUNCTION delete_employee(employee_id UUID)
RETURNS JSON AS $$
DECLARE
  user_role TEXT;
BEGIN
  -- Check if the caller is an admin
  SELECT role INTO user_role FROM profiles WHERE id = auth.uid();
  IF user_role != 'admin' THEN
    RETURN json_build_object('error', 'Only admins can delete employees');
  END IF;

  -- Delete the profile (work logs will be deleted via CASCADE)
  DELETE FROM profiles WHERE id = employee_id;

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;