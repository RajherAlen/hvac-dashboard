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

    // Verify caller is super_admin
    const callerToken = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: callerError } = await adminClient.auth.getUser(callerToken)
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (callerUser.app_metadata?.role !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Only super admins can create companies' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { company_name, admin_full_name, admin_email, redirect_to } = await req.json()
    if (!company_name?.trim() || !admin_full_name?.trim() || !admin_email?.trim()) {
      return new Response(JSON.stringify({ error: 'company_name, admin_full_name and admin_email are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Create the company
    const { data: company, error: companyErr } = await adminClient
      .from('companies')
      .insert({ name: company_name.trim() })
      .select('id')
      .single()

    if (companyErr) {
      return new Response(JSON.stringify({ error: companyErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const companyId = company.id

    // 2. Resolve admin user — invite or find existing
    let adminUserId: string

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      admin_email.trim(),
      { data: { full_name: admin_full_name.trim() }, redirectTo: redirect_to }
    )

    if (!inviteError) {
      adminUserId = inviteData.user.id
    } else {
      // Already registered — look up in profiles first, then listUsers
      const { data: existingProfile } = await adminClient
        .from('profiles')
        .select('id')
        .eq('email', admin_email.trim())
        .maybeSingle()

      if (existingProfile?.id) {
        adminUserId = existingProfile.id
      } else {
        const { data: { users } } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
        const found = users?.find((u) => u.email === admin_email.trim())
        if (!found) {
          // Rollback company
          await adminClient.from('companies').delete().eq('id', companyId)
          return new Response(JSON.stringify({ error: inviteError.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        adminUserId = found.id
      }
    }

    // 3. Set app_metadata: role=admin, company_id
    const { error: metaErr } = await adminClient.auth.admin.updateUserById(adminUserId, {
      app_metadata: { role: 'admin', company_id: companyId },
    })
    if (metaErr) {
      await adminClient.from('companies').delete().eq('id', companyId)
      return new Response(JSON.stringify({ error: metaErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Upsert profile
    const { error: profileErr } = await adminClient.from('profiles').upsert({
      id: adminUserId,
      email: admin_email.trim(),
      full_name: admin_full_name.trim(),
      role: 'admin',
      company_id: companyId,
      is_active: true,
    })
    if (profileErr) {
      await adminClient.from('companies').delete().eq('id', companyId)
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, company_id: companyId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
