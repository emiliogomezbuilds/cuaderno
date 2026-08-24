# Implementation Prompt — Week 2 Build
### Paste this whole file to your coding agent (Claude Code) to start building.

## Context

I'm building the MVP described in `docs/PACKET.md` in this repo — read that file first for
full context (problem, user, benchmark, flow diagram). Summary: a consent-gated,
per-pull evidence verification service for informal borrowers in Mexico. It never scores
or recommends — it only releases lender-authorized, applicant-consented, whitelisted
facts, and logs one fee-eligible "pull" event per release.

**Stack:** Next.js (React) on Vercel · Supabase (Postgres + Auth, "Sign in with Google") ·
Claude API for extraction only (never scoring) · all secrets in Vercel environment
variables, never in the repo.

**Non-negotiable (Shadow Clause):** no field tied to family, geography-of-origin, contact
list, or social graph may ever be ingested, stored, or released — enforced by a schema
whitelist checked at BOTH ingestion and release, not just one.

## Build in this order — small, testable, one feature per commit

### 1. Project scaffold + Supabase connection
- Next.js app deployed to Vercel (empty page is fine for the first deploy).
- Supabase project created; env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) set in Vercel, never committed.
- **Acceptance:** app loads at a live Vercel URL; Supabase client connects with no errors.

### 2. Auth — "Sign in with Google" via Supabase Auth
- Two roles at sign-in: `applicant` or `lender` (simple toggle/claim at signup for MVP).
- **Acceptance:** a real Google account can sign in and land on a role-appropriate page;
  signed-out users can't reach any data page.

### 3. Data model + Row Level Security
Tables (all in Supabase Postgres, RLS **ON** for every one):
- `evidence_facts` — `id, applicant_id, amount, date, source_type, counterparty_masked, created_at, is_simulated boolean`
- `pull_requests` — `id, lender_id, applicant_id, status (pending/consented/denied), created_at`
- `pull_events` — `id, pull_request_id, released_at` (one row = one fee-eligible release)
- **Acceptance:** an applicant querying `evidence_facts` only ever sees rows where
  `applicant_id = auth.uid()`; a lender querying `pull_requests` only sees their own
  requests. Verify by attempting a cross-user read and confirming it returns zero rows.

### 4. Schema whitelist validator (Shadow Clause enforcement)
- A shared validation function listing ONLY allowed fields:
  `amount, date, source_type, counterparty_masked`.
- Runs on every write to `evidence_facts` AND on every read that builds a release
  packet — reject (don't silently strip) any payload containing a non-whitelisted key,
  and write a row to an `audit_log` table.
- **Acceptance:** a test payload containing `family_members` or `home_address` is
  rejected with a clear error, on both the write path and the release path, and appears
  in `audit_log`.

### 5. Simulated evidence ingestion + LLM extraction
- Applicant pastes simulated evidence text (a fake WhatsApp-style payment log) into a
  form. Claude API extracts it into whitelisted fields only (no free-text passthrough).
  Every record gets `is_simulated = true` and a visible "SIMULATED DATA" label on screen.
- **Acceptance:** pasting sample text produces 1+ rows in `evidence_facts`, each visibly
  labeled simulated, with only whitelisted fields populated.

### 6. Lender pull request + consent gate
- Lender picks one named applicant and submits a `pull_requests` row (status `pending`).
- Applicant sees a pending request and can approve or deny (build the UI from
  `docs/mockup_consent_gate.svg`).
- **Acceptance:** with no applicant action, the lender sees nothing and no
  `pull_events` row exists. On deny, status becomes `denied`, still nothing released.

### 7. Release + fee-event logging
- On consent, release the whitelisted fact packet to the lender AND write exactly one
  `pull_events` row for that `pull_request_id`.
- Re-requesting without a new consent must NOT create a second release or a second
  `pull_events` row.
- **Acceptance:** one consent → exactly one packet shown to lender → exactly one
  `pull_events` row. Confirm by counting rows before/after in a test.

### 8. Revoke access
- Applicant can revoke a previously consented grant; any lender UI polling that grant
  must stop showing data after revoke.
- **Acceptance:** revoke a grant, attempt to re-read the packet as the lender, confirm
  it's no longer accessible.

## Security floor (check before every deploy)
1. No secrets in code or repo — Vercel env vars only.
2. Every page with personal data requires auth.
3. RLS on for every table above.
4. Every form validates input (length, type) before it touches the DB or the LLM prompt.
5. Every seeded/demo fact is simulated and labeled — no real people.

## Commit plan (minimum 5 commits, 2 deploys)
1. `scaffold: Next.js + Supabase connection, first deploy`
2. `feat: Google auth with applicant/lender roles`
3. `feat: data model + RLS policies`
4. `feat: schema whitelist validator + Shadow Clause audit log`
5. `feat: evidence ingestion + LLM extraction (simulated data)`
6. `feat: consent gate + pull request flow`
7. `feat: release + fee-event logging, second deploy`
8. `feat: revoke access`

End every session per the course's Session Close: update `DECISIONS.md` with what
happened, note tomorrow's first move, commit, push.
