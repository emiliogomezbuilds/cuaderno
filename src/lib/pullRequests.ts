import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";
import { buildReleasePacket } from "./releasePacket";

export type CreatePullRequestResult =
  | { data: { id: string } }
  | { error: string };

// The lender names an applicant by email — there's no public directory.
// The lookup runs on the admin client (bypasses RLS) so a lender can find
// the applicant's id without gaining any broader read access to profiles;
// the insert itself runs on the lender's own session so Feature 3's
// role-gated RLS policy still governs who's allowed to create the row.
export async function createPullRequest(
  supabase: SupabaseClient,
  lenderId: string,
  applicantEmail: string,
): Promise<CreatePullRequestResult> {
  const admin = createAdminClient();
  const { data: applicant, error: lookupError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", applicantEmail)
    .eq("role", "applicant")
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  if (!applicant) {
    return { error: "No applicant found with that email." };
  }

  const { data, error } = await supabase
    .from("pull_requests")
    .insert({ lender_id: lenderId, applicant_id: applicant.id })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { data };
}

// RLS (0005_pull_request_consent.sql) already restricts this to the
// applicant's own pending requests, transitioning only into
// consented/denied — this just turns "no row matched" into a clear error
// instead of a silent no-op. On consent, releases the packet and logs the
// fee event in the same call: the "pending -> decided exactly once" RLS
// guard means this update can only ever succeed once per request, so
// there's no separate path that could re-trigger a release.
export async function respondToPullRequest(
  supabase: SupabaseClient,
  requestId: string,
  decision: "consented" | "denied",
) {
  const { data, error } = await supabase
    .from("pull_requests")
    .update({ status: decision })
    .eq("id", requestId)
    .select("id, status, applicant_id, lender_id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Request not found, not yours, or already decided.");
  }

  if (decision === "consented") {
    await releasePacketForRequest(supabase, data.id, data.applicant_id, data.lender_id);
  }

  return data;
}

// RLS (0007_revoke_access.sql) restricts this to the applicant's own
// consented, not-yet-revoked grants. Deliberately does NOT delete the
// pull_events row — the applicant's own SELECT policy still shows it (full
// history), only the lender's SELECT policy is revoked-gated, so "stop
// showing data after revoke" happens at the RLS layer, not by mutating or
// deleting the release record itself.
export async function revokePullRequest(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase
    .from("pull_requests")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", requestId)
    .select("id, status, revoked_at")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Request not found, not yours, or not eligible for revoke.");
  }
  return data;
}

// The read runs on the applicant's own session (RLS: they can only ever
// select their own evidence_facts, which is exactly the actor who's
// allowed to trigger a release). Only whitelisted columns are selected —
// never select("*") here, since buildReleasePacket would correctly reject
// internal columns like id/applicant_id/is_simulated as "non-whitelisted."
// The insert runs on the admin client since pull_events has no INSERT
// policy for anyone — this is the one place fee events get written.
async function releasePacketForRequest(
  supabase: SupabaseClient,
  requestId: string,
  applicantId: string,
  lenderId: string,
) {
  const { data: facts, error } = await supabase
    .from("evidence_facts")
    .select("amount, date, source_type, counterparty_masked")
    .eq("applicant_id", applicantId);
  if (error) throw new Error(error.message);

  const packet = await buildReleasePacket(lenderId, facts ?? []);

  const admin = createAdminClient();
  const { error: insertError } = await admin
    .from("pull_events")
    .insert({ pull_request_id: requestId, packet });
  if (insertError) throw new Error(insertError.message);
}
