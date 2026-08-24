import { createAdminClient } from "./admin";

export async function logShadowClauseViolation(params: {
  context: "write" | "release";
  forbiddenFields: string[];
  actorId: string | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.from("audit_log").insert({
    event_type: "shadow_clause_violation",
    context: params.context,
    attempted_fields: params.forbiddenFields,
    actor_id: params.actorId,
  });

  if (error) {
    throw new Error(`Failed to write audit_log: ${error.message}`);
  }
}
