// Verifies Feature 6's acceptance test: a lender submits a pull_requests
// row (pending) for one named applicant; with no applicant action, no
// pull_events row exists; on deny, status becomes denied and still
// nothing is released. Exercises the real src/lib/pullRequests.ts
// functions, not a reimplementation.
import { createClient } from "@supabase/supabase-js";
import { createPullRequest, respondToPullRequest } from "../src/lib/pullRequests";

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
  const email = `consent-gate-${label}-${stamp}@example.com`;
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

  const asLenderA = await sessionFor(lenderA.email);
  const asApplicantA = await sessionFor(applicantA.email);
  const asApplicantB = await sessionFor(applicantB.email);

  // --- lender creates a pull request for one named applicant ---
  const created = await createPullRequest(asLenderA, lenderA.id, applicantA.email);
  assert("data" in created, `createPullRequest succeeded: ${JSON.stringify(created)}`);
  const requestId = "data" in created ? created.data.id : "";

  const notFoundResult = await createPullRequest(
    asLenderA,
    lenderA.id,
    `nobody-${stamp}@example.com`,
  );
  assert(
    "error" in notFoundResult,
    "createPullRequest returns an error for an email that isn't an applicant",
  );

  // --- cross-visibility: each side can see the other's profile ---
  const { data: applicantSeesLender } = await asApplicantA
    .from("profiles")
    .select("email")
    .eq("id", lenderA.id)
    .maybeSingle();
  assert(
    applicantSeesLender?.email === lenderA.email,
    "applicant can see the requesting lender's profile",
  );

  const { data: lenderSeesApplicant } = await asLenderA
    .from("profiles")
    .select("email")
    .eq("id", applicantA.id)
    .maybeSingle();
  assert(
    lenderSeesApplicant?.email === applicantA.email,
    "lender can see the requested applicant's profile",
  );

  // --- no applicant action yet: lender's own view shows pending, no release ---
  const { data: lenderView } = await asLenderA
    .from("pull_requests")
    .select("status")
    .eq("id", requestId)
    .single();
  assert(lenderView?.status === "pending", "lender sees the request as pending, not consented");

  const { count: eventsBeforeCount } = await admin
    .from("pull_events")
    .select("*", { count: "exact", head: true })
    .eq("pull_request_id", requestId);
  assert(eventsBeforeCount === 0, "no pull_events row exists before any applicant action");

  // --- a different applicant cannot respond to someone else's request ---
  let crossApplicantBlocked = false;
  try {
    await respondToPullRequest(asApplicantB, requestId, "consented");
  } catch {
    crossApplicantBlocked = true;
  }
  assert(crossApplicantBlocked, "applicant B cannot respond to applicant A's pull request");

  // --- applicant A denies ---
  const denied = await respondToPullRequest(asApplicantA, requestId, "denied");
  assert(denied.status === "denied", "applicant A's deny updates status to denied");

  const { count: eventsAfterCount } = await admin
    .from("pull_events")
    .select("*", { count: "exact", head: true })
    .eq("pull_request_id", requestId);
  assert(eventsAfterCount === 0, "still no pull_events row after deny — nothing released");

  // --- a decided request can't be re-decided ---
  let redecideBlocked = false;
  try {
    await respondToPullRequest(asApplicantA, requestId, "consented");
  } catch {
    redecideBlocked = true;
  }
  assert(redecideBlocked, "an already-decided request cannot be decided again");

  console.log("\nAll consent-gate checks passed.");
} finally {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`Cleaned up ${createdUserIds.length} test users.`);
}
