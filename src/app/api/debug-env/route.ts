import { NextResponse } from "next/server";

// Temporary diagnostic — verifying the ANTHROPIC_API_KEY fix took effect.
// Never returns the secret value itself. Delete this route once confirmed.
export async function GET() {
  const raw = process.env.ANTHROPIC_API_KEY;
  return NextResponse.json({
    present: typeof raw !== "undefined",
    length: raw?.length ?? 0,
    startsWithSkAnt: raw?.startsWith("sk-ant-") ?? false,
  });
}
