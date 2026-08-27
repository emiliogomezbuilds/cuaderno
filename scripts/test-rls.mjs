// Verifies Feature 3's acceptance test: an applicant querying evidence_facts
// only ever sees their own rows, and a lender querying pull_requests only
// sees their own requests. Creates disposable test users via the admin API,
// signs in as each with a real session (so RLS/auth.uid() applies exactly
// as it would in the app), and cleans up afterward.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const password = "test-password-" + Math.random().toString(36).slice(2);
const stamp = Date.now();
const createdUserIds = [];

async function createTestUser(label) {
  const email = `rls-test-${label}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser(${label}): ${error.message}`);
  createdUserIds.push(data.user.id);
  return data.user;
}

async function sessionFor(email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn(${email}): ${error.message}`);
  return client;
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`ok - ${message}`);
}

try {
  // --- evidence_facts: applicant isolation ---
  const applicantA = await createTestUser("applicant-a");
  const applicantB = await createTestUser("applicant-b");
  const { error: profileErrA } = await admin.from("profiles").insert([
    { id: applicantA.id, role: "applicant", email: applicantA.email },
    { id: applicantB.id, role: "applicant", email: applicantB.email },
  ]);
  if (profileErrA) throw new Error(`profile insert: ${profileErrA.message}`);

  const asA = await sessionFor(applicantA.email);
  const { error: insertErr } = await asA.from("evidence_facts").insert({
    applicant_id: applicantA.id,
    amount: 500,
    date: "2026-08-01",
    source_type: "whatsapp_transfer",
    counterparty_masked: "J*** R***",
  });
  assert(!insertErr, `applicant A can insert own evidence_facts row (${insertErr?.message ?? ""})`);

  const { data: ownRows, error: ownErr } = await asA.from("evidence_facts").select("*");
  assert(!ownErr && ownRows.length === 1, "applicant A sees exactly 1 row (their own)");

  const asB = await sessionFor(applicantB.email);
  const { data: crossRows, error: crossErr } = await asB.from("evidence_facts").select("*");
  assert(!crossErr && crossRows.length === 0, "applicant B's cross-user read returns 0 rows");

  // --- pull_requests: lender isolation ---
  const lenderA = await createTestUser("lender-a");
  const lenderB = await createTestUser("lender-b");
  const { error: profileErrL } = await admin.from("profiles").insert([
    { id: lenderA.id, role: "lender", email: lenderA.email },
    { id: lenderB.id, role: "lender", email: lenderB.email },
  ]);
  if (profileErrL) throw new Error(`profile insert: ${profileErrL.message}`);

  const asLenderA = await sessionFor(lenderA.email);
  const { error: prInsertErr } = await asLenderA.from("pull_requests").insert({
    lender_id: lenderA.id,
    applicant_id: applicantA.id,
  });
  assert(!prInsertErr, `lender A can insert own pull_requests row (${prInsertErr?.message ?? ""})`);

  const { data: lenderOwnRows, error: lenderOwnErr } = await asLenderA
    .from("pull_requests")
    .select("*");
  assert(!lenderOwnErr && lenderOwnRows.length === 1, "lender A sees exactly 1 pull_request (their own)");

  const asLenderB = await sessionFor(lenderB.email);
  const { data: lenderCrossRows, error: lenderCrossErr } = await asLenderB
    .from("pull_requests")
    .select("*");
  assert(!lenderCrossErr && lenderCrossRows.length === 0, "lender B's cross-user read returns 0 rows");

  // --- applicant can see requests made about them ---
  const { data: applicantSeesRequest, error: applicantSeesErr } = await asA
    .from("pull_requests")
    .select("*");
  assert(
    !applicantSeesErr && applicantSeesRequest.length === 1,
    "applicant A sees the pull_request lender A made about them",
  );

  // --- negative paths: spoofing another user's id is rejected ---
  const { error: spoofEvidenceErr } = await asB.from("evidence_facts").insert({
    applicant_id: applicantA.id, // B trying to write as A
    amount: 999,
    date: "2026-08-01",
    source_type: "cash_receipt",
  });
  assert(!!spoofEvidenceErr, "applicant B cannot insert evidence_facts claiming to be applicant A");

  const { error: spoofPullErr } = await asLenderB.from("pull_requests").insert({
    lender_id: lenderA.id, // B trying to write as A
    applicant_id: applicantA.id,
  });
  assert(!!spoofPullErr, "lender B cannot insert a pull_request claiming to be lender A");

  const { error: applicantAsLenderErr } = await asA.from("pull_requests").insert({
    lender_id: applicantA.id, // A's own uid, but A's role is 'applicant' not 'lender'
    applicant_id: applicantA.id,
  });
  assert(!!applicantAsLenderErr, "an applicant cannot create pull_requests naming themselves lender_id");

  const { error: lenderAsApplicantErr } = await asLenderA.from("evidence_facts").insert({
    applicant_id: lenderA.id, // lender A's own uid, but role is 'lender' not 'applicant'
    amount: 1,
    date: "2026-08-01",
    source_type: "cash_receipt",
  });
  assert(!!lenderAsApplicantErr, "a lender cannot create evidence_facts naming themselves applicant_id");

  // --- unauthenticated reads see nothing ---
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: anonRows, error: anonErr } = await anon.from("evidence_facts").select("*");
  assert(!anonErr && anonRows.length === 0, "unauthenticated read of evidence_facts returns 0 rows");

  console.log("\nAll RLS isolation checks passed.");
} finally {
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`Cleaned up ${createdUserIds.length} test users.`);
}
