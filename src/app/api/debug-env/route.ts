import { NextResponse } from "next/server";
import { extractEvidenceFacts } from "@/lib/extraction";

// Temporary diagnostic — verifying the real Gemini call works end-to-end
// (ANTHROPIC_API_KEY hit the "present but empty" class of bug, so presence
// alone isn't enough evidence). Returns only synthetic extracted facts,
// nothing sensitive. Delete once confirmed.
export async function GET() {
  const raw = process.env.GEMINI_API_KEY;
  const envCheck = { present: typeof raw !== "undefined", length: raw?.length ?? 0 };

  try {
    const facts = await extractEvidenceFacts(
      "Recibí $500 de Juan Pérez por Whatsapp el 1 de agosto de 2026.",
    );
    return NextResponse.json({ envCheck, extractionOk: true, facts });
  } catch (err) {
    return NextResponse.json(
      {
        envCheck,
        extractionOk: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
