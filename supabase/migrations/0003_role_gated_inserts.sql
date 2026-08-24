-- 0002's insert policies only checked auth.uid() = <owner column>, which
-- lets any authenticated user name themselves as lender_id (or
-- applicant_id) regardless of their actual claimed role. Require the
-- inserting user to hold the matching role from profiles.
drop policy "lender can create pull requests" on public.pull_requests;

create policy "lender can create pull requests"
  on public.pull_requests for insert
  to authenticated
  with check (
    auth.uid() = lender_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'lender'
    )
  );

drop policy "applicant can insert own evidence" on public.evidence_facts;

create policy "applicant can insert own evidence"
  on public.evidence_facts for insert
  to authenticated
  with check (
    auth.uid() = applicant_id
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'applicant'
    )
  );
