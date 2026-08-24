// The Shadow Clause: no field tied to family, geography-of-origin, contact
// list, or social graph may ever be ingested, stored, or released. This is
// the single source of truth for what's allowed — checked on both the
// evidence_facts write path (src/lib/evidence.ts) and the release-packet
// path (src/lib/releasePacket.ts), not just one.
export const EVIDENCE_FACT_ALLOWED_FIELDS = [
  "amount",
  "date",
  "source_type",
  "counterparty_masked",
] as const;

export type EvidenceFactField = (typeof EVIDENCE_FACT_ALLOWED_FIELDS)[number];

export type WhitelistCheck =
  | { ok: true }
  | { ok: false; forbiddenFields: string[] };

export function checkWhitelist(payload: Record<string, unknown>): WhitelistCheck {
  const allowed: readonly string[] = EVIDENCE_FACT_ALLOWED_FIELDS;
  const forbiddenFields = Object.keys(payload).filter((key) => !allowed.includes(key));
  return forbiddenFields.length > 0 ? { ok: false, forbiddenFields } : { ok: true };
}

export class ShadowClauseViolationError extends Error {
  readonly forbiddenFields: string[];

  constructor(forbiddenFields: string[]) {
    super(
      `Shadow Clause violation: rejected non-whitelisted field(s): ${forbiddenFields.join(", ")}`,
    );
    this.name = "ShadowClauseViolationError";
    this.forbiddenFields = forbiddenFields;
  }
}
