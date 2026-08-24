# DECISIONS

## 2026-08-23 — Feature 1: scaffold + Supabase connection

Built and deployed. Live at https://cuaderno-beta.vercel.app.

- Scaffolded Next.js 16 (App Router, TypeScript, Tailwind) at the repo root.
- Added a browser Supabase client (`src/lib/supabase/client.ts`, anon key)
  and a server-only admin client (`src/lib/supabase/admin.ts`, service role
  key — never imported from client code).
- `/api/health` round-trips to Supabase's Auth admin API (`listUsers`) to
  prove the connection is real, not just that env vars are present.
  Homepage polls it and shows a green/red status badge.
- No local Node/npm/Vercel CLI existed on this machine — installed `nvm` +
  Node 24 LTS (user-space, no sudo) to build anything at all.
- Provisioned Supabase through **Vercel's Marketplace integration**
  (`vercel integration add supabase`) rather than the Supabase dashboard
  directly. This auto-wired `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` (plus raw
  Postgres connection strings) into Vercel's env vars for
  Production/Preview/Development — no manual copy-pasting of keys. Required
  the user to (a) `vercel login` interactively and (b) accept Supabase's
  marketplace terms in-browser once; both are one-time steps under their
  account that couldn't be scripted.
- `vercel link` also auto-detected and connected the existing GitHub repo
  (`emiliogomezbuilds/cuaderno`), so `git push origin main` alone triggers a
  production deploy — no separate `vercel deploy` needed going forward.
- The deployment's unique hash URL (`cuaderno-kkedul0b2-....vercel.app`) sits
  behind Vercel's SSO wall by default; the stable alias
  `cuaderno-beta.vercel.app` is the one that's actually public. Use that
  alias (or a custom domain, once added) for anything shared externally.
- `ANTHROPIC_API_KEY` is not set yet — not needed until Feature 5 (LLM
  extraction). Add it in Vercel env vars before starting that feature.

**Tomorrow's first move:** Feature 2 — Google sign-in via Supabase Auth with
`applicant`/`lender` role selection at signup. Will need Google OAuth
credentials (Google Cloud Console) wired into Supabase Auth settings before
any code changes.
