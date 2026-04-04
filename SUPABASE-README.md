# Supabase Setup

This project uses Supabase for backend services. To set up the database:

## Database Schema

1. Go to your Supabase dashboard: https://supabase.com/dashboard
2. Navigate to your project (dtdbodnmfexsfypkpsze)
3. Go to SQL Editor
4. Run the SQL from `supabase-schema.sql`

## Edge Functions

The project uses two Edge Functions:

### delete-employee
Deletes an employee from the system (removes from auth and cascades to profiles/work_logs)

### invite-employee
Invites a new employee via email

To deploy these functions:

1. Install Supabase CLI (if not already installed)
2. Login: `supabase login`
3. Link project: `supabase link --project-ref dtdbodnmfexsfypkpsze`
4. Deploy functions: `supabase functions deploy`

## Environment Variables

Make sure your `.env.local` has:
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

## Regenerating Types

After schema changes, regenerate types:
`supabase gen types typescript --local > src/types/database.ts`