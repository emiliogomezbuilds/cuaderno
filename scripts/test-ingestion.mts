// Verifies Feature 5's acceptance test: pasting sample evidence text
// produces 1+ rows in evidence_facts, each is_simulated, with only
// whitelisted fields populated. Calls the real Gemini API — requires
// GEMINI_API_KEY locally (see DECISIONS.md for how to pull it).
import { createClient } from "@supabase/supabase-js";
import { extractEvidenceFacts } from "../src/lib/extraction";
import { insertEvidenceFact } from "../src/lib/evidence";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!process.env.GEMINI_API_KEY) {
  console.error(
    "GEMINI_API_KEY is not set locally. Pull it from Vercel or run this " +
      "against an environment where it's set.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const password = "test-password-" + Math.random().toString(36).slice(2);
const stamp = Date.now();
const email = `ingestion-test-${stamp}@example.com`;
let applicantId: string;

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`ok - ${message}`);
}

// A fake WhatsApp-style payment log, matching Doña Mari's persona
// (PACKET.md §2) — plus a distractor family/location detail the model
// must NOT carry into its output.
const SAMPLE_TEXT = `
Hoy 1 de agosto recibí $500 de Juan Pérez por Whatsapp, pago de la semana.
El 3 de agosto me pagó $350 en efectivo la señora Rosa por unos tacos.
(Vivo con mi hija en la colonia Doctores, cerca de metro Balderas.)
El 5 de agosto Juan Pérez me volvió a transferir $500 por Whatsapp.
`.trim();

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
    .insert({ id: applicantId, role: "applicant" });
  if (profileErr) throw new Error(profileErr.message);

  const asApplicant = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await asApplicant.auth.signInWithPassword({ email, password });
  if (signInErr) throw new Error(signInErr.message);

  const facts = await extractEvidenceFacts(SAMPLE_TEXT);
  assert(facts.length >= 1, `extraction produced ${facts.length} fact(s) (expected >= 1)`);

  const allowedKeys = ["amount", "date", "source_type", "counterparty_masked"];
  for (const fact of facts) {
    const keys = Object.keys(fact);
    assert(
      keys.every((k) => allowedKeys.includes(k)),
      `extracted fact has only whitelisted keys: ${JSON.stringify(fact)}`,
    );
    const blob = JSON.stringify(fact).toLowerCase();
    assert(
      !blob.includes("doctores") && !blob.includes("balderas") && !blob.includes("hija"),
      `extracted fact excludes family/geography distractor text: ${JSON.stringify(fact)}`,
    );
  }

  for (const fact of facts) {
    const row = await insertEvidenceFact(asApplicant, applicantId, fact);
    assert(row.is_simulated === true, `inserted row ${row.id} is_simulated = true`);
  }

  const { data: storedRows, error: selectErr } = await asApplicant
    .from("evidence_facts")
    .select("*");
  if (selectErr) throw new Error(selectErr.message);
  assert(
    storedRows.length === facts.length,
    `evidence_facts has ${storedRows.length} row(s) matching the ${facts.length} extracted fact(s)`,
  );

  console.log("\nAll ingestion checks passed.");
} finally {
  if (applicantId!) {
    await admin.auth.admin.deleteUser(applicantId);
    console.log("Cleaned up test user and evidence_facts.");
  }
}
