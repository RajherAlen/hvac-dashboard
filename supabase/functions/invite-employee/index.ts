import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RequestBody {
  full_name: string
  email: string
  role: 'admin' | 'employee'
  redirect_to: string
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

    const { full_name, email, role, redirect_to }: RequestBody = await req.json()

    if (!full_name || !email || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields: full_name, email, role' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (existingUser) {
      return new Response(JSON.stringify({ error: 'User with this email already exists' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Create the user account
    const { data: authData, error: authError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name,
        role,
      },
      redirectTo: redirect_to
    })

    if (authError) {
      console.error('Error inviting user:', authError)
      return new Response(JSON.stringify({ error: `Failed to invite user: ${authError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // The profile will be created via trigger when the user signs up
    // But we can pre-create it if needed
    if (authData.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          email,
          full_name,
          role,
        })

      if (profileError) {
        console.error('Error creating profile:', profileError)
        // Don't fail the whole operation if profile creation fails
        console.warn('Profile creation failed, but user invitation succeeded')
      }
    }

    return new Response(JSON.stringify({
      success: true,
      user: authData.user,
      message: 'User invited successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: `Internal server error: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}

    return new Response(JSON.stringify({
      success: true,
      user: authData.user
    }), {
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