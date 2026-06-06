// Supabase Edge Function: AI Proxy for Anthropic API
//
// Why: in production, the firm's Anthropic API key should NOT live in the
// browser. This edge function holds the key server-side and proxies calls
// from the form. The form sends the same `/v1/messages` request body; the
// function injects the API key and returns Claude's response unchanged.
//
// Deploy:
//   1. Install Supabase CLI: https://supabase.com/docs/guides/cli
//   2. supabase login
//   3. supabase link --project-ref <your-project-ref>
//   4. supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   5. supabase functions deploy ai-proxy --no-verify-jwt
//      (use --verify-jwt if you want only authenticated users to call it)
//
// Then in the browser, hit `/functions/v1/ai-proxy` instead of
// api.anthropic.com directly. See README.md for the client-side switch.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || '*').split(',').map((s) => s.trim());

const corsHeaders = (origin: string | null) => {
  const allowOrigin = !origin || ALLOWED_ORIGINS.includes('*')
    ? '*'
    : ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  };
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }

  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': response.headers.get('Content-Type') || 'application/json',
    },
  });
});
