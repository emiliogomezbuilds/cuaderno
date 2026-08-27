-- Feature 6: lender pull request + consent gate.

-- A lender names an applicant by email (not a public directory); backfill
-- existing profiles (there's at least one real one from Feature 2 testing).
alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

alter table public.profiles alter column email set not null;

-- The applicant can respond to their own pending requests, and only into
-- consented/denied (never back to pending, never someone else's row).
create policy "applicant can respond to own pending pull requests"
  on public.pull_requests for update
  to authenticated
  using (auth.uid() = applicant_id and status = 'pending')
  with check (auth.uid() = applicant_id and status in ('consented', 'denied'));

-- Each side needs to know who they're dealing with: an applicant sees the
-- profile of a lender who has requested them, and a lender sees the
-- profile of an applicant they've requested — never a general directory.
create policy "applicant can view lender profiles that requested them"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.pull_requests pr
      where pr.lender_id = profiles.id
        and pr.applicant_id = auth.uid()
    )
  );

create policy "lender can view applicant profiles they requested"
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1 from public.pull_requests pr
      where pr.applicant_id = profiles.id
        and pr.lender_id = auth.uid()
    )
  );
