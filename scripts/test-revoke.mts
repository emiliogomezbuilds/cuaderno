// Verifies Feature 8's acceptance test: revoke a grant, then attempt to
// re-read the packet as the lender, and confirm it's no longer
// accessible. Exercises the real src/lib/pullRequests.ts functions.
import { createClient } from "@supabase/supabase-js";
import {
  createPullRequest,
  respondToPullRequest,
  revokePullRequest,
} from "../src/lib/pullRequests";
import { insertEvidenceFact } from "../src/lib/evidence";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const password = "test-password-" + Math.random().toString(36).slice(2);
const stamp = Date.now();
const createdUserIds: string[] = [];

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`ok - ${message}`);
}

async function createTestUser(label: string, role: "applicant" | "lender") {
  const email = `revoke-test-${label}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${label}): ${error.message}`);
  createdUserIds.push(data.user.id);

  const { error: profileErr } = await admin
    .from("profiles")
    .insert({ id: data.user.id, role, email });
  if (profileErr) throw new Error(`profile insert (${label}): ${profileErr.message}`);

  return { id: data.user.id, email };
}

async function sessionFor(email: string) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return client;
}

try {
  const applicantA = await createTestUser("applicant-a", "applicant");
  const applicantB = await createTestUser("applicant-b", "applicant");
  const lenderA = await createTestUser("lender-a", "lender");

  const asApplicantA = await sessionFor(applicantA.email);
  const asApplicantB = await sessionFor(applicantB.email);
  const asLenderA = await sessionFor(lenderA.email);

  await insertEvidenceFact(asApplicantA, applicantA.id, {
    amount: 500,
    date: "2026-08-01",
    source_type: "whatsapp_transfer",
    counterparty_masked: "J*** P***",
  });

  const created = await createPullRequest(asLenderA, lenderA.id, applicantA.email);
  assert("data" in created, `createPullRequest succeeded: ${JSON.stringify(created)}`);
  const requestId = "data" in created ? created.data.id : "";

  await respondToPullRequest(asApplicantA, requestId, "consented");

  // --- before revoke: lender can read the packet ---
  const { data: beforeRevoke } = await asLenderA
    .from("pull_events")
    .select("packet")
    .eq("pull_request_id", requestId)
    .maybeSingle();
  assert(beforeRevoke?.packet?.length === 1, "lender can read the packet before revoke");

  // --- a different applicant cannot revoke someone else's grant ---
  let crossApplicantBlocked = false;
  try {
    await revokePullRequest(asApplicantB, requestId);
  } catch {
    crossApplicantBlocked = true;
  }
  assert(crossApplicantBlocked, "applicant B cannot revoke applicant A's grant");

  // --- applicant A revokes ---
  const revoked = await revokePullRequest(asApplicantA, requestId);
  assert(revoked.status === "consented", "status stays consented after revoke (history preserved)");
  assert(!!revoked.revoked_at, "revoked_at is set");

  // --- after revoke: lender can no longer read the packet ---
  const { data: afterRevoke } = await asLenderA
    .from("pull_events")
    .select("packet")
    .eq("pull_request_id", requestId)
    .maybeSingle();
  assert(!afterRevoke, "lender can no longer read the packet after revoke");

  // --- the pull_events row itself still exists (admin/audit view) ---
  const { data: adminSees } = await admin
    .from("pull_events")
    .select("packet")
    .eq("pull_request_id", requestId)
    .maybeSingle();
  assert(!!adminSees, "the pull_events row is not deleted, just hidden from the lender by RLS");

  // --- the applicant still sees their own history after revoking ---
  const { data: applicantStillSees } = await asApplicantA
    .from("pull_events")
    .select("packet")
    .eq("pull_request_id", requestId)
    .maybeSingle();
  assert(!!applicantStillSees, "applicant still sees their own released-then-revoked history");

  // --- revoking again is blocked (already revoked) ---
  let reRevokeBlocked = false;
  try {
    await revokePullRequest(asApplicantA, requestId);
  } catch {
    reRevokeBlocked = true;
  }
  assert(reRevokeBlocked, "an already-revoked grant cannot be revoked again");

  // --- cannot revoke a request that was never consented ---
  const createdDenied = await createPullRequest(asLenderA, lenderA.id, applicantA.email);
  const deniedRequestId = "data" in createdDenied ? createdDenied.data.id : "";
  await respondToPullRequest(asApplicantA, deniedRequestId, "denied");
  let denyRevokeBlocked = false;
  try {
    await revokePullRequest(asApplicantA, deniedRequestId);
  } catch {
    denyRevokeBlocked = true;
  }
  assert(denyRevokeBlocked, "a denied (never-consented) request cannot be revoked");

  console.log("\nAll revoke checks passed.");
} finally {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`Cleaned up ${createdUserIds.length} test users.`);
}
