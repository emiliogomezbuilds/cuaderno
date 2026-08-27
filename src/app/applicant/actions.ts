"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { extractEvidenceFacts } from "@/lib/extraction";
import { insertEvidenceFact } from "@/lib/evidence";
import { ShadowClauseViolationError } from "@/lib/shadowClause";
import { respondToPullRequest, revokePullRequest } from "@/lib/pullRequests";

const MAX_EVIDENCE_TEXT_LENGTH = 4000;

export type SubmitEvidenceState = {
  error?: string;
  insertedCount?: number;
};

export async function submitEvidence(
  _prevState: SubmitEvidenceState,
  formData: FormData,
): Promise<SubmitEvidenceState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "applicant") redirect("/login");

  const rawText = formData.get("evidence_text");
  if (typeof rawText !== "string" || rawText.trim().length === 0) {
    return { error: "Paste some evidence text first." };
  }
  if (rawText.length > MAX_EVIDENCE_TEXT_LENGTH) {
    return { error: `Evidence text is too long (max ${MAX_EVIDENCE_TEXT_LENGTH} characters).` };
  }

  let facts;
  try {
    facts = await extractEvidenceFacts(rawText);
  } catch (err) {
    return { error: `Extraction failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (facts.length === 0) {
    return { error: "No payment facts could be extracted from that text." };
  }

  let insertedCount = 0;
  for (const fact of facts) {
    try {
      await insertEvidenceFact(supabase, user.id, fact);
      insertedCount++;
    } catch (err) {
      if (err instanceof ShadowClauseViolationError) {
        return { error: `Rejected: ${err.message}` };
      }
      throw err;
    }
  }

  revalidatePath("/applicant");
  return { insertedCount };
}

export async function respondToRequest(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const requestId = formData.get("request_id");
  const decision = formData.get("decision");
  if (
    typeof requestId !== "string" ||
    (decision !== "consented" && decision !== "denied")
  ) {
    throw new Error("Invalid request");
  }

  await respondToPullRequest(supabase, requestId, decision);
  revalidatePath("/applicant");
}

export async function revokeAccess(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const requestId = formData.get("request_id");
  if (typeof requestId !== "string") {
    throw new Error("Invalid request");
  }

  await revokePullRequest(supabase, requestId);
  revalidatePath("/applicant");
}
