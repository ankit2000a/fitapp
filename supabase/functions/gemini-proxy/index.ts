import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verify Authorization Header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing Authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Initialize Supabase Admin Client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // 3. Authenticate User JWT
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid token.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const userId = user.id

    // 4. Parse request body
    const body = await req.json()
    const { contents, model = 'gemini-3.1-flash-lite' } = body

    if (!contents) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: contents' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Classify Request (Future You vs. Food Log)
    let requestType = 'food_log'
    const promptText = JSON.stringify(contents)
    
    if (promptText.includes("Future Self") || promptText.includes("future_message")) {
      requestType = 'future_you'
    }

    // Define limits
    const LIMITS = {
      food_log: 50,
      future_you: 30
    }
    const limit = LIMITS[requestType as keyof typeof LIMITS] || 50

    // 6. Enforce Rate Limiting (UTC Calendar Day)
    const todayStr = new Date().toISOString().split('T')[0]
    const startOfToday = `${todayStr}T00:00:00.000Z`

    const { count, error: countError } = await supabaseAdmin
      .from('api_usage_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('request_type', requestType)
      .gte('created_at', startOfToday)

    if (countError) {
      console.error('Error counting API usage:', countError)
    } else if (count !== null && count >= limit) {
      return new Response(
        JSON.stringify({ 
          error: `Daily limit reached. You can only make ${limit} ${requestType === 'food_log' ? 'food logs' : 'Future You calculations'} per day.` 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 7. Fetch server-side Cloud Run settings
    const CLOUD_RUN_URL = Deno.env.get('CLOUD_RUN_URL')
    const PROXY_TOKEN = Deno.env.get('PROXY_TOKEN')
    
    if (!CLOUD_RUN_URL || !PROXY_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: CLOUD_RUN_URL or PROXY_TOKEN is not configured.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 8. Log this request to the database
    const { error: logError } = await supabaseAdmin
      .from('api_usage_logs')
      .insert({ user_id: userId, request_type: requestType })

    if (logError) {
      console.error('Error logging API usage:', logError)
    }

    // 9. Fetch from Cloud Run Proxy
    const res = await fetch(`${CLOUD_RUN_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Proxy-Token': PROXY_TOKEN
      },
      body: JSON.stringify({ contents, model }),
    })

    const data = await res.json()
    return new Response(
      JSON.stringify(data),
      {
        status: res.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
