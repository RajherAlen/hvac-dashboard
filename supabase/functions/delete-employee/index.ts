import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RequestBody {
  employee_id: string
}

export async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    // Use service role for admin operations
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { employee_id }: RequestBody = await req.json()

    if (!employee_id) {
      return new Response(JSON.stringify({ error: 'Employee ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // First, delete the profile (this will cascade to work_logs)
    const { error: profileError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', employee_id)

    if (profileError) {
      console.error('Error deleting profile:', profileError)
      return new Response(JSON.stringify({ error: 'Failed to delete employee profile' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Then delete the user from auth
    const { error: authError } = await supabase.auth.admin.deleteUser(employee_id)

    if (authError) {
      console.error('Error deleting user from auth:', authError)
      // Don't fail if auth deletion fails, profile is already deleted
      console.warn('Auth user deletion failed, but profile was deleted successfully')
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}