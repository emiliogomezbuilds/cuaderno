import { NextResponse } from "next/server";

// Temporary diagnostic for the ANTHROPIC_API_KEY runtime-resolution bug.
// Never returns the secret value itself — presence/length only. Delete
// this route once the bug is understood.
export async function GET() {
  const raw = process.env.ANTHROPIC_API_KEY;
  return NextResponse.json({
    present: typeof raw !== "undefined",
    length: raw?.length ?? 0,
    startsWithSkAnt: raw?.startsWith("sk-ant-") ?? false,
    trimmedLength: raw?.trim().length ?? 0,
  });
}
