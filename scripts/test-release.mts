// Verifies Feature 7's acceptance test: one consent -> exactly one packet
// shown to the lender -> exactly one pull_events row. Re-requesting
// without a new consent must not create a second release. Exercises the
// real src/lib/pullRequests.ts functions, not a reimplementation.
import { createClient } from "@supabase/supabase-js";
import { createPullRequest, respondToPullRequest } from "../src/lib/pullRequests";
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
  const email = `release-test-${label}-${stamp}@example.com`;
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

async function eventCountFor(pullRequestId: string) {
  const { count, error } = await admin
    .from("pull_events")
    .select("*", { count: "exact", head: true })
    .eq("pull_request_id", pullRequestId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

try {
  const applicantA = await createTestUser("applicant-a", "applicant");
  const lenderA = await createTestUser("lender-a", "lender");
  const outsiderLender = await createTestUser("lender-outsider", "lender");

  const asApplicantA = await sessionFor(applicantA.email);
  const asLenderA = await sessionFor(lenderA.email);
  const asOutsiderLender = await sessionFor(outsiderLender.email);

  await insertEvidenceFact(asApplicantA, applicantA.id, {
    amount: 500,
    date: "2026-08-01",
    source_type: "whatsapp_transfer",
    counterparty_masked: "J*** P***",
  });
  await insertEvidenceFact(asApplicantA, applicantA.id, {
    amount: 350,
    date: "2026-08-03",
    source_type: "cash_receipt",
    counterparty_masked: null,
  });

  const created = await createPullRequest(asLenderA, lenderA.id, applicantA.email);
  assert("data" in created, `createPullRequest succeeded: ${JSON.stringify(created)}`);
  const requestId = "data" in created ? created.data.id : "";

  assert((await eventCountFor(requestId)) === 0, "0 pull_events rows before consent");

  // --- one consent ---
  const consented = await respondToPullRequest(asApplicantA, requestId, "consented");
  assert(consented.status === "consented", "consent updates status to consented");

  assert((await eventCountFor(requestId)) === 1, "exactly 1 pull_events row after consent");

  // --- exactly one packet, whitelisted fields only ---
  const { data: eventRow, error: eventErr } = await admin
    .from("pull_events")
    .select("packet")
    .eq("pull_request_id", requestId)
    .single();
  if (eventErr) throw new Error(eventErr.message);
  const packet = eventRow.packet as Record<string, unknown>[];
  assert(packet.length === 2, `packet has 2 facts (${packet.length})`);
  const allowedKeys = ["amount", "date", "source_type", "counterparty_masked"];
  assert(
    packet.every((fact) => Object.keys(fact).every((k) => allowedKeys.includes(k))),
    "packet facts contain only whitelisted keys",
  );

  // --- lender sees exactly the packet; applicant sees it too; a stranger doesn't ---
  const { data: lenderSees } = await asLenderA
    .from("pull_events")
    .select("packet")
    .eq("pull_request_id", requestId)
    .maybeSingle();
  assert(lenderSees?.packet?.length === 2, "lender can view the packet via RLS");

  const { data: applicantSees } = await asApplicantA
    .from("pull_events")
    .select("packet")
    .eq("pull_request_id", requestId)
    .maybeSingle();
  assert(applicantSees?.packet?.length === 2, "applicant can view their own released packet");

  const { data: outsiderSees } = await asOutsiderLender
    .from("pull_events")
    .select("packet")
    .eq("pull_request_id", requestId)
    .maybeSingle();
  assert(!outsiderSees, "an unrelated lender cannot view the packet");

  // --- re-requesting without a new consent: can't re-decide the same request ---
  let redecideBlocked = false;
  try {
    await respondToPullRequest(asApplicantA, requestId, "consented");
  } catch {
    redecideBlocked = true;
  }
  assert(redecideBlocked, "the same request cannot be consented to twice");
  assert(
    (await eventCountFor(requestId)) === 1,
    "still exactly 1 pull_events row after the blocked re-consent attempt",
  );

  // --- a genuinely NEW pull request is a separate, distinct fee event ---
  const createdAgain = await createPullRequest(asLenderA, lenderA.id, applicantA.email);
  assert("data" in createdAgain, "lender can submit a fresh pull request to the same applicant");
  const secondRequestId = "data" in createdAgain ? createdAgain.data.id : "";
  await respondToPullRequest(asApplicantA, secondRequestId, "consented");
  assert(
    (await eventCountFor(secondRequestId)) === 1,
    "a new pull request produces its own, separate pull_events row",
  );
  assert(requestId !== secondRequestId, "the two requests are genuinely distinct rows");

  console.log("\nAll release/fee-event checks passed.");
} finally {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`Cleaned up ${createdUserIds.length} test users.`);
}
