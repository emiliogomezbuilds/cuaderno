import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";
import { EvidenceForm } from "./EvidenceForm";
import { ConsentRequestCard } from "./ConsentRequestCard";
import { revokeAccess } from "./actions";

export default async function ApplicantPage() {
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
  if (!profile) redirect("/onboarding");
  if (profile.role !== "applicant") redirect(`/${profile.role}`);

  const { data: facts } = await supabase
    .from("evidence_facts")
    .select("id, amount, date, source_type, counterparty_masked, is_simulated")
    .order("date", { ascending: false });

  const { data: requests } = await supabase
    .from("pull_requests")
    .select("id, lender_id, status, revoked_at, created_at")
    .order("created_at", { ascending: false });

  const lenderIds = [...new Set((requests ?? []).map((r) => r.lender_id))];
  const { data: lenderProfiles } = lenderIds.length
    ? await supabase.from("profiles").select("id, email").in("id", lenderIds)
    : { data: [] as { id: string; email: string }[] };
  const lenderEmailById = new Map((lenderProfiles ?? []).map((p) => [p.id, p.email]));

  const pendingRequests = (requests ?? []).filter((r) => r.status === "pending");
  const decidedRequests = (requests ?? []).filter((r) => r.status !== "pending");

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 px-8 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Applicant
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">{user.email}</p>
        </div>

        {pendingRequests.length > 0 && (
          <section className="flex w-full flex-col gap-4">
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Solicitud de un prestamista autorizado
            </h2>
            {pendingRequests.map((r) => (
              <ConsentRequestCard
                key={r.id}
                id={r.id}
                lenderEmail={lenderEmailById.get(r.lender_id) ?? r.lender_id}
              />
            ))}
          </section>
        )}

        <section className="w-full rounded-xl border border-black/[.08] p-5 dark:border-white/[.145]">
          <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Add evidence
          </h2>
          <EvidenceForm />
        </section>

        <section className="w-full">
          <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Your evidence
          </h2>
          {facts && facts.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {facts.map((fact) => (
                <li
                  key={fact.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-black/[.08] px-4 py-3 text-sm dark:border-white/[.145]"
                >
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">
                      ${Number(fact.amount).toLocaleString()} · {fact.date}
                    </p>
                    <p className="text-zinc-600 dark:text-zinc-400">
                      {fact.source_type}
                      {fact.counterparty_masked ? ` · ${fact.counterparty_masked}` : ""}
                    </p>
                  </div>
                  {fact.is_simulated && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      SIMULATED DATA
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No evidence yet.</p>
          )}
        </section>

        {decidedRequests.length > 0 && (
          <section className="w-full">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              Historial de solicitudes
            </h2>
            <ul className="flex flex-col gap-2 text-sm">
              {decidedRequests.map((r) => {
                const isActiveConsent = r.status === "consented" && !r.revoked_at;
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-black/[.08] px-4 py-3 dark:border-white/[.145]"
                  >
                    <span className="text-zinc-900 dark:text-zinc-100">
                      {lenderEmailById.get(r.lender_id) ?? r.lender_id}
                    </span>
                    <div className="flex shrink-0 items-center gap-3">
                      <span
                        className={
                          r.status === "denied"
                            ? "text-red-600 dark:text-red-400"
                            : r.revoked_at
                              ? "text-zinc-500 dark:text-zinc-400"
                              : "text-green-700 dark:text-green-400"
                        }
                      >
                        {r.status === "denied"
                          ? "no permitido"
                          : r.revoked_at
                            ? "revocado"
                            : "permitido"}
                      </span>
                      {isActiveConsent && (
                        <form action={revokeAccess}>
                          <input type="hidden" name="request_id" value={r.id} />
                          <button
                            type="submit"
                            className="text-xs text-zinc-500 underline transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                          >
                            Revocar acceso
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <form action={signOut}>
          <button
            type="submit"
            className="rounded-full border border-solid border-black/[.08] px-5 py-2 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Sign out
          </button>
        </form>
      </main>
    </div>
  );
}
