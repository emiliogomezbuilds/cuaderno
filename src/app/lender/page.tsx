import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions";
import { RequestPullForm } from "./RequestPullForm";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  consented: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  denied: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export default async function LenderPage() {
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
  if (profile.role !== "lender") redirect(`/${profile.role}`);

  const { data: requests } = await supabase
    .from("pull_requests")
    .select("id, applicant_id, status, created_at")
    .order("created_at", { ascending: false });

  const applicantIds = [...new Set((requests ?? []).map((r) => r.applicant_id))];
  const { data: applicantProfiles } = applicantIds.length
    ? await supabase.from("profiles").select("id, email").in("id", applicantIds)
    : { data: [] as { id: string; email: string }[] };
  const emailById = new Map((applicantProfiles ?? []).map((p) => [p.id, p.email]));

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 px-8 py-16">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
            Lender
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">{user.email}</p>
        </div>

        <section className="w-full rounded-xl border border-black/[.08] p-5 dark:border-white/[.145]">
          <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Request an applicant&apos;s evidence
          </h2>
          <RequestPullForm />
        </section>

        <section className="w-full">
          <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Your requests
          </h2>
          {requests && requests.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-black/[.08] px-4 py-3 text-sm dark:border-white/[.145]"
                >
                  <span className="text-zinc-900 dark:text-zinc-100">
                    {emailById.get(r.applicant_id) ?? r.applicant_id}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[r.status]}`}
                  >
                    {r.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No requests yet.</p>
          )}
        </section>

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
