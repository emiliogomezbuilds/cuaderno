-- Feature 3: core data model + RLS.
-- evidence_facts: applicant-owned facts extracted from evidence (Feature 5).
-- pull_requests: a lender's request to view one named applicant's packet.
-- pull_events: one row per consented release (Feature 7) — fee-eligible.

create table if not exists public.evidence_facts (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references auth.users (id) on delete cascade,
  amount numeric(12, 2) not null,
  date date not null,
  source_type text not null,
  counterparty_masked text,
  created_at timestamptz not null default now(),
  is_simulated boolean not null default true
);

alter table public.evidence_facts enable row level security;

create policy "applicant can view own evidence"
  on public.evidence_facts for select
  to authenticated
  using (auth.uid() = applicant_id);

create policy "applicant can insert own evidence"
  on public.evidence_facts for insert
  to authenticated
  with check (auth.uid() = applicant_id);

create table if not exists public.pull_requests (
  id uuid primary key default gen_random_uuid(),
  lender_id uuid not null references auth.users (id) on delete cascade,
  applicant_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'consented', 'denied')),
  created_at timestamptz not null default now()
);

alter table public.pull_requests enable row level security;

create policy "lender can view own pull requests"
  on public.pull_requests for select
  to authenticated
  using (auth.uid() = lender_id);

create policy "applicant can view requests about them"
  on public.pull_requests for select
  to authenticated
  using (auth.uid() = applicant_id);

create policy "lender can create pull requests"
  on public.pull_requests for insert
  to authenticated
  with check (auth.uid() = lender_id);

-- pull_events has no policies yet: writes happen server-side (service role,
-- Feature 7's release route) to guarantee exactly-one-event-per-consent, and
-- no UI reads it yet. RLS is on, so it's deny-all until Feature 7 adds the
-- policies it actually needs.
create table if not exists public.pull_events (
  id uuid primary key default gen_random_uuid(),
  pull_request_id uuid not null references public.pull_requests (id) on delete cascade,
  released_at timestamptz not null default now()
);

alter table public.pull_events enable row level security;
