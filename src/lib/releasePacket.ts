import { checkWhitelist, ShadowClauseViolationError } from "./shadowClause";
import { logShadowClauseViolation } from "./supabase/auditLog";
import type { EvidenceFactPayload } from "./evidence";

// The release path: every fact packet handed to a lender must go through
// this, checked independently of the write-path check in evidence.ts — the
// Shadow Clause is enforced at BOTH ingestion and release, not just one.
export async function buildReleasePacket(
  lenderId: string,
  facts: Record<string, unknown>[],
): Promise<EvidenceFactPayload[]> {
  const packet: EvidenceFactPayload[] = [];

  for (const fact of facts) {
    const check = checkWhitelist(fact);
    if (!check.ok) {
      await logShadowClauseViolation({
        context: "release",
        forbiddenFields: check.forbiddenFields,
        actorId: lenderId,
      });
      throw new ShadowClauseViolationError(check.forbiddenFields);
    }
    packet.push(fact as EvidenceFactPayload);
  }

  return packet;
}
