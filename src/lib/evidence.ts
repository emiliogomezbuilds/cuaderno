import type { SupabaseClient } from "@supabase/supabase-js";
import { checkWhitelist, ShadowClauseViolationError } from "./shadowClause";
import { logShadowClauseViolation } from "./supabase/auditLog";

export type EvidenceFactPayload = {
  amount: number;
  date: string;
  source_type: string;
  counterparty_masked?: string | null;
};

// The write path: every insert into evidence_facts must go through this,
// not straight through the Supabase client. Validates the Shadow Clause
// whitelist before the row ever reaches the database.
export async function insertEvidenceFact(
  supabase: SupabaseClient,
  applicantId: string,
  payload: Record<string, unknown>,
) {
  const check = checkWhitelist(payload);
  if (!check.ok) {
    await logShadowClauseViolation({
      context: "write",
      forbiddenFields: check.forbiddenFields,
      actorId: applicantId,
    });
    throw new ShadowClauseViolationError(check.forbiddenFields);
  }

  const { data, error } = await supabase
    .from("evidence_facts")
    .insert({
      ...(payload as EvidenceFactPayload),
      applicant_id: applicantId,
      is_simulated: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
