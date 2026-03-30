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

    // Verify caller JWT
    const callerToken = authHeader.replace('Bearer ', '')
    const { data: { user: callerUser }, error: callerError } = await adminClient.auth.getUser(callerToken)
    if (callerError || !callerUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const callerRole = callerUser.app_metadata?.role as string
    if (callerRole !== 'admin' && callerRole !== 'super_admin') {
      return new Response(JSON.stringify({ error: 'Only admins can deactivate employees' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { employee_id, active } = await req.json()
    if (!employee_id || typeof active !== 'boolean') {
      return new Response(JSON.stringify({ error: 'employee_id and active (boolean) are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Company admin: verify the target employee belongs to their company
    if (callerRole === 'admin') {
      const callerCompanyId = callerUser.app_metadata?.company_id as string
      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('company_id')
        .eq('id', employee_id)
        .single()

      if (!targetProfile || targetProfile.company_id !== callerCompanyId) {
        return new Response(JSON.stringify({ error: 'Employee not found in your company' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Update profile is_active flag
    const { error: profileErr } = await adminClient
      .from('profiles')
      .update({ is_active: active })
      .eq('id', employee_id)

    if (profileErr) {
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Ban or unban in Supabase Auth
    const { error: authErr } = await adminClient.auth.admin.updateUserById(employee_id, {
      ban_duration: active ? 'none' : '876600h',
    })

    if (authErr) {
      // Rollback profile flag
      await adminClient.from('profiles').update({ is_active: !active }).eq('id', employee_id)
      return new Response(JSON.stringify({ error: authErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true, active }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
