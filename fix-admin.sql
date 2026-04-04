-- Fix admin user permissions
-- This script will ensure admin@hvac.com has admin role

-- First, check what auth users exist
SELECT id, email, raw_user_meta_data FROM auth.users WHERE email = 'admin@hvac.com';

-- Create or update the admin profile
INSERT INTO profiles (id, email, full_name, role)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', 'Admin User'),
  'admin'
FROM auth.users au
WHERE au.email = 'admin@hvac.com'
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  full_name = COALESCE(EXCLUDED.full_name, profiles.full_name);

-- Verify the admin user is set up correctly
SELECT id, email, full_name, role FROM profiles WHERE email = 'admin@hvac.com';