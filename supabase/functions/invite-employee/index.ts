import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify caller JWT (same pattern as create-employee / delete-employee)
    const callerToken = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: callerError } = await adminClient.auth.getUser(callerToken)
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Only admins can invite
    const callerRole = callerUser.app_metadata?.role as string
    if (callerRole !== 'admin' && callerRole !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Only admins can invite employees' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get caller's company_id
    const { data: callerProfile } = await adminClient
      .from('profiles')
      .select('company_id')
      .eq('id', callerUser.id)
      .single()

    if (!callerProfile?.company_id) {
      return new Response(JSON.stringify({ error: 'Caller company not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { full_name, email, role, redirect_to } = await req.json()
    if (!full_name || !email || !role) {
      return new Response(JSON.stringify({ error: 'full_name, email and role are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const companyId = callerProfile.company_id

    // ── Resolve user ID ────────────────────────────────────────────────────────
    let userId: string

    // 1. Check profiles table first (cheapest lookup)
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingProfile?.id) {
      // User already has a profile — update their role/company in place
      userId = existingProfile.id
    } else {
      // Try to send an invite email
      const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
        email,
        { data: { full_name }, redirectTo: redirect_to }
      )

      if (!inviteError) {
        userId = inviteData.user.id
      } else {
        // User exists in auth but has no profile yet — find them via listUsers
        const { data: { users } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
        const found = users?.find((u) => u.email === email)
        if (!found) {
          return new Response(JSON.stringify({ error: inviteError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        userId = found.id
      }
    }

    // ── Set app_metadata (role + company_id appear in the JWT after login) ─────
    await adminClient.auth.admin.updateUserById(userId, {
      app_metadata: { role, company_id: companyId },
    })

    // ── Upsert profile row ─────────────────────────────────────────────────────
    const { error: upsertErr } = await adminClient.from('profiles').upsert({
      id: userId,
      email,
      full_name,
      role,
      company_id: companyId,
    })

    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
