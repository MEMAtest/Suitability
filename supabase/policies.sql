-- Row-Level Security policies required by the Suitability app's client-side flows.
--
-- The app talks to Supabase with the ANON key from the browser (index.html,
-- dashboard.html, client-intake.html). The following policies are the MINIMUM
-- needed for the new features to work, scoped as tightly as the current
-- single-table design allows. Review against your firm's risk appetite before
-- applying — for stricter control, move the mutations behind Edge Functions /
-- RPCs and revoke direct anon writes.
--
-- Table assumed: public.ifa_forms (form_id text primary key, payload jsonb,
--                created_at timestamptz default now(), updated_at timestamptz)
--
-- Apply in the Supabase SQL editor.

alter table public.ifa_forms enable row level security;

-- Ensure updated_at is always populated (the optimistic-lock in client-intake.html
-- matches on it; createClientIntake also sets it explicitly).
alter table public.ifa_forms
  alter column updated_at set default now();

-- 1. READ: the dashboard and the "load saved/intake" flows need to read rows.
--    Tighten with an auth check if you add Supabase Auth.
create policy "anon can read forms"
  on public.ifa_forms for select
  to anon
  using (true);

-- 2. INSERT: saving a form, creating an intake link, writing audit snapshots,
--    and saving a report all insert/upsert rows.
create policy "anon can insert forms"
  on public.ifa_forms for insert
  to anon
  with check (true);

-- 3. UPDATE: client-intake.html submits via UPDATE with an optimistic lock
--    (.eq('updated_at', expected)). loadClientIntake locks the row on import.
--    This policy additionally blocks updates to a row once it has been locked,
--    enforcing the import-immutability server-side rather than only in client JS.
create policy "anon can update unlocked forms"
  on public.ifa_forms for update
  to anon
  using (coalesce((payload ->> 'locked')::boolean, false) = false)
  with check (true);

-- NOTE: the app does not DELETE rows; no delete policy is granted to anon.
--
-- Hardening options not enabled here (decide per deployment):
--  * Restrict SELECT/INSERT/UPDATE to authenticated users only (swap `to anon`
--    for `to authenticated`) once you add Supabase Auth + per-adviser ownership.
--  * Add a WITH CHECK on UPDATE that forbids changing form_id / created_at.
--  * Enforce intake expiry server-side via a CHECK or a trigger that rejects
--    updates where (payload ->> 'expires_at')::timestamptz < now().
