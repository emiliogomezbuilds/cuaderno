-- Feature 7: release + fee-event logging.

-- The packet is a snapshot at the moment of release, not a live query —
-- consenting to release "current facts" shouldn't retroactively expose
-- facts the applicant adds later. This column is also the lender-visible
-- record of exactly what was released.
alter table public.pull_events add column if not exists packet jsonb not null default '[]'::jsonb;
alter table public.pull_events alter column packet drop default;

-- Belt-and-suspenders on top of Feature 6's "pending -> decided exactly
-- once" RLS guard: even under a bug or a race, the database itself
-- refuses a second event for the same pull request.
alter table public.pull_events
  add constraint pull_events_pull_request_id_key unique (pull_request_id);

-- No INSERT/UPDATE/DELETE policy for anyone: the release path always
-- writes through the service-role client (src/lib/pullRequests.ts), which
-- bypasses RLS, so the "exactly one event, only right after consent" logic
-- lives in one place instead of being trusted to client-side RLS alone.
create policy "lender can view events for own pull requests"
  on public.pull_events for select
  to authenticated
  using (
    exists (
      select 1 from public.pull_requests pr
      where pr.id = pull_events.pull_request_id
        and pr.lender_id = auth.uid()
    )
  );

create policy "applicant can view events for their own pull requests"
  on public.pull_events for select
  to authenticated
  using (
    exists (
      select 1 from public.pull_requests pr
      where pr.id = pull_events.pull_request_id
        and pr.applicant_id = auth.uid()
    )
  );
