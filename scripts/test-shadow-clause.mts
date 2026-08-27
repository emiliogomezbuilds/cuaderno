// Verifies Feature 4's acceptance test: a payload containing a
// non-whitelisted field (e.g. family_members, home_address) is rejected —
// with a clear error, not a silent strip — on both the evidence_facts
// write path and the release-packet path, and shows up in audit_log.
// Exercises the actual src/lib functions, not a reimplementation of them.
import { createClient } from "@supabase/supabase-js";
import { insertEvidenceFact } from "../src/lib/evidence";
import { buildReleasePacket } from "../src/lib/releasePacket";
import { ShadowClauseViolationError } from "../src/lib/shadowClause";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const password = "test-password-" + Math.random().toString(36).slice(2);
const stamp = Date.now();
const email = `shadow-clause-test-${stamp}@example.com`;
let applicantId: string;

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`ok - ${message}`);
}

async function auditLogRowExists(context: "write" | "release", field: string, since: string) {
  const { data, error } = await admin
    .from("audit_log")
    .select("*")
    .eq("context", context)
    .eq("actor_id", applicantId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);
  return (data ?? []).some((row) => row.attempted_fields.includes(field));
}

try {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw new Error(createErr.message);
  applicantId = created.user.id;

  const { error: profileErr } = await admin
    .from("profiles")
    .insert({ id: applicantId, role: "applicant", email });
  if (profileErr) throw new Error(profileErr.message);

  const asApplicant = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await asApplicant.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(signInErr.message);

  // --- write path: happy case, whitelisted fields only ---
  const goodRow = await insertEvidenceFact(asApplicant, applicantId, {
    amount: 250,
    date: "2026-08-01",
    source_type: "whatsapp_transfer",
    counterparty_masked: "M*** L***",
  });
  assert(goodRow.id, "write path accepts a payload with only whitelisted fields");

  // --- write path: forbidden field ---
  const writeStart = new Date().toISOString();
  let writeRejected = false;
  let writeErrorMessage = "";
  try {
    await insertEvidenceFact(asApplicant, applicantId, {
      amount: 300,
      date: "2026-08-02",
      source_type: "cash_receipt",
      family_members: ["daughter", "son"],
    });
  } catch (err) {
    writeRejected = err instanceof ShadowClauseViolationError;
    writeErrorMessage = err instanceof Error ? err.message : String(err);
  }
  assert(writeRejected, "write path rejects a payload containing family_members");
  assert(
    writeErrorMessage.includes("family_members"),
    `write path error message names the forbidden field: "${writeErrorMessage}"`,
  );
  assert(
    await auditLogRowExists("write", "family_members", writeStart),
    "write-path rejection appears in audit_log",
  );

  // --- release path: forbidden field ---
  const releaseStart = new Date().toISOString();
  let releaseRejected = false;
  let releaseErrorMessage = "";
  try {
    await buildReleasePacket(applicantId, [
      {
        amount: 250,
        date: "2026-08-01",
        source_type: "whatsapp_transfer",
        counterparty_masked: "M*** L***",
        home_address: "Av. Insurgentes 123",
      },
    ]);
  } catch (err) {
    releaseRejected = err instanceof ShadowClauseViolationError;
    releaseErrorMessage = err instanceof Error ? err.message : String(err);
  }
  assert(releaseRejected, "release path rejects a payload containing home_address");
  assert(
    releaseErrorMessage.includes("home_address"),
    `release path error message names the forbidden field: "${releaseErrorMessage}"`,
  );
  assert(
    await auditLogRowExists("release", "home_address", releaseStart),
    "release-path rejection appears in audit_log",
  );

  // --- release path: happy case ---
  const packet = await buildReleasePacket(applicantId, [
    {
      amount: 250,
      date: "2026-08-01",
      source_type: "whatsapp_transfer",
      counterparty_masked: "M*** L***",
    },
  ]);
  assert(packet.length === 1, "release path accepts a payload with only whitelisted fields");

  console.log("\nAll Shadow Clause checks passed.");
} finally {
  if (applicantId!) {
    await admin.from("audit_log").delete().eq("actor_id", applicantId);
    await admin.auth.admin.deleteUser(applicantId);
    console.log("Cleaned up test user, evidence_facts, and audit_log rows.");
  }
}
