-- Feature 8: revoke access. A separate revoked_at timestamp (not a status
-- overwrite) so the record keeps saying "this was consented, then later
-- revoked" rather than losing that history.
alter table public.pull_requests add column if not exists revoked_at timestamptz;

-- The applicant can revoke their own consented, not-yet-revoked grant.
-- USING gates which rows are eligible (must currently be a live consent);
-- WITH CHECK only allows the resulting row to still be status='consented'
-- with revoked_at now set — this policy can't be used to change status
-- itself, only to revoke.
create policy "applicant can revoke own consented pull requests"
  on public.pull_requests for update
  to authenticated
  using (auth.uid() = applicant_id and status = 'consented' and revoked_at is null)
  with check (auth.uid() = applicant_id and status = 'consented' and revoked_at is not null);

-- Tighten the lender's read of pull_events: a revoked grant must stop
-- showing data immediately, at the RLS layer, not just in the UI. The
-- applicant's own SELECT policy (0006) is left as-is — they keep seeing
-- their full history, revoked or not, for transparency.
drop policy "lender can view events for own pull requests" on public.pull_events;

create policy "lender can view events for own pull requests"
  on public.pull_events for select
  to authenticated
  using (
    exists (
      select 1 from public.pull_requests pr
      where pr.id = pull_events.pull_request_id
        and pr.lender_id = auth.uid()
        and pr.revoked_at is null
    )
  );
