import { NextResponse } from "next/server";

// Temporary diagnostic — verifying GEMINI_API_KEY has a real value at
// runtime (ANTHROPIC_API_KEY hit this exact class of bug: present but
// empty). Never returns the secret value itself. Delete once confirmed.
export async function GET() {
  const raw = process.env.GEMINI_API_KEY;
  return NextResponse.json({
    present: typeof raw !== "undefined",
    length: raw?.length ?? 0,
  });
}
