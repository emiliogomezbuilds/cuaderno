"use client";

import { useEffect, useState } from "react";

type HealthResult = { ok: boolean; error?: string };

export default function Home() {
  const [health, setHealth] = useState<HealthResult | "loading">("loading");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setHealth({ ok: false, error: String(err) }));
  }, []);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-6 px-8 py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Cuaderno
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Consent-gated, per-pull evidence verification. Scaffold + Supabase
          connection check.
        </p>

        <div className="flex items-center gap-2 rounded-full border border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              health === "loading"
                ? "bg-zinc-400 animate-pulse"
                : health.ok
                  ? "bg-green-500"
                  : "bg-red-500"
            }`}
          />
          <span className="text-zinc-700 dark:text-zinc-300">
            {health === "loading"
              ? "Checking Supabase connection…"
              : health.ok
                ? "Supabase connected"
                : `Supabase connection failed: ${health.error}`}
          </span>
        </div>

        <div className="flex gap-4 text-sm font-medium">
          <a
            href="/dashboard"
            className="rounded-full bg-foreground px-5 py-2 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Dashboard
          </a>
          <a
            href="/login"
            className="rounded-full border border-solid border-black/[.08] px-5 py-2 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Sign in
          </a>
        </div>
      </main>
    </div>
  );
}
