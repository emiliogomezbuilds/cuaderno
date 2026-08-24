-- Feature 4: Shadow Clause enforcement. Any payload containing a
-- non-whitelisted field (write path or release path) is rejected and
-- recorded here. No RLS policies: only the service-role client (used by
-- the validator itself) can write or read — no UI surfaces this table.
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  context text not null check (context in ('write', 'release')),
  attempted_fields text[] not null default '{}',
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;
