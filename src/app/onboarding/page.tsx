import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { chooseRole } from "./actions";

export default async function OnboardingPage() {
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
  if (profile) redirect(`/${profile.role}`);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-sm flex-col items-center gap-6 px-8 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Who are you?
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          This can&apos;t be changed later in the MVP — pick the role that
          matches this account.
        </p>
        <form action={chooseRole} className="flex w-full flex-col gap-3">
          <button
            type="submit"
            name="role"
            value="applicant"
            className="w-full rounded-full bg-foreground px-5 py-3 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            I&apos;m an applicant
          </button>

          <div className="my-1 flex w-full flex-col gap-2 rounded-xl border border-black/[.08] p-3 text-left dark:border-white/[.145]">
            <label
              htmlFor="display_name"
              className="text-xs text-zinc-600 dark:text-zinc-400"
            >
              Institution name (lenders only — shown to applicants instead of
              your email on the consent screen)
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              maxLength={80}
              placeholder="e.g. Banco Azteca"
              className="w-full rounded-lg border border-black/[.08] bg-white p-2 text-sm text-zinc-900 dark:border-white/[.145] dark:bg-black dark:text-zinc-100"
            />
            <button
              type="submit"
              name="role"
              value="lender"
              className="w-full rounded-full border border-solid border-black/[.08] px-5 py-3 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              I&apos;m a lender
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
