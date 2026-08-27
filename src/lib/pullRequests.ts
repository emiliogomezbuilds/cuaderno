import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/admin";

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
// instead of a silent no-op.
export async function respondToPullRequest(
  supabase: SupabaseClient,
  requestId: string,
  decision: "consented" | "denied",
) {
  const { data, error } = await supabase
    .from("pull_requests")
    .update({ status: decision })
    .eq("id", requestId)
    .select("id, status")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("Request not found, not yours, or already decided.");
  }
  return data;
}
