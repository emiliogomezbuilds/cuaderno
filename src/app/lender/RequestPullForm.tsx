"use client";

import { useActionState } from "react";
import { requestPull, type RequestPullState } from "./actions";

const initialState: RequestPullState = {};

export function RequestPullForm() {
  const [state, formAction, pending] = useActionState(requestPull, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-3 text-left">
      <label
        htmlFor="applicant_email"
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        Applicant&apos;s email
      </label>
      <input
        id="applicant_email"
        name="applicant_email"
        type="email"
        required
        maxLength={254}
        className="w-full rounded-lg border border-black/[.08] bg-white p-3 text-sm text-zinc-900 dark:border-white/[.145] dark:bg-black dark:text-zinc-100"
        placeholder="applicant@example.com"
      />
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? "Sending…" : "Send request"}
      </button>
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-green-700 dark:text-green-400">Request sent.</p>
      )}
    </form>
  );
}
