# AI Proxy Edge Function

Removes the Anthropic API key from the browser by routing all Claude calls through your Supabase project. Recommended for any production / shared deployment.

## Deploy

```bash
# 1. Install Supabase CLI
brew install supabase/tap/supabase   # macOS
# or: npm install -g supabase

# 2. Authenticate and link your project
supabase login
supabase link --project-ref maandodhonjolrmcxivo  # your project ref

# 3. Set the API key as a secret (never commit it)
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxxxx

# 4. (Optional) Restrict which origins can call the proxy
supabase secrets set ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# 5. Deploy
supabase functions deploy ai-proxy --no-verify-jwt
# Use --verify-jwt instead if only logged-in Supabase users should call it.
```

After deployment your function URL is:
```
https://<project-ref>.supabase.co/functions/v1/ai-proxy
```

## Switch the browser to use it

In `suitability-features.js`, find each direct call to `https://api.anthropic.com/v1/messages` and replace with your edge function URL. Then delete the `x-api-key`, `anthropic-version`, and `anthropic-dangerous-direct-browser-access` headers — the edge function handles those.

Concretely, change:

```js
const response = await fetch('https://api.anthropic.com/v1/messages', {
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  },
  body: JSON.stringify({ ... }),
});
```

To:

```js
const response = await fetch('https://<project-ref>.supabase.co/functions/v1/ai-proxy', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ... }),
});
```

Once switched, you can remove the "API key" field from the Settings modal — keys live only on the server.

## Costs and rate limiting

Edge functions are billed per invocation (Supabase free tier: 500k/mo). Anthropic charges per token. For a production firm:

- Add a row-level usage cap in the function (e.g., reject if your `usage_log` table shows >N calls this month).
- Add basic abuse detection (e.g., max document size, max messages per minute per IP).
- Log every call to Supabase for audit (input hash + model + token count).
