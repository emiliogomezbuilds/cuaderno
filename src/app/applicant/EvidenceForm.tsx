"use client";

import { useActionState } from "react";
import { submitEvidence, type SubmitEvidenceState } from "./actions";

const initialState: SubmitEvidenceState = {};

export function EvidenceForm() {
  const [state, formAction, pending] = useActionState(submitEvidence, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-3 text-left">
      <label
        htmlFor="evidence_text"
        className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        Paste your payment history (WhatsApp export, informal receipts)
      </label>
      <textarea
        id="evidence_text"
        name="evidence_text"
        rows={6}
        required
        maxLength={4000}
        className="w-full rounded-lg border border-black/[.08] bg-white p-3 text-sm text-zinc-900 dark:border-white/[.145] dark:bg-black dark:text-zinc-100"
        placeholder={'Ej: "Recibí $500 de Juan Pérez por Whatsapp el 1 de agosto de 2026"'}
      />
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? "Extracting…" : "Submit evidence"}
      </button>
      {state.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
      {state.insertedCount !== undefined && (
        <p className="text-sm text-green-700 dark:text-green-400">
          Added {state.insertedCount} fact{state.insertedCount === 1 ? "" : "s"}.
        </p>
      )}
    </form>
  );
}
