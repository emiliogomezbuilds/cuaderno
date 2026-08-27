import { Type } from "@google/genai";
import { createGeminiClient } from "./gemini";

// Extraction only, never scoring — and structurally confined to the Shadow
// Clause whitelist (src/lib/shadowClause.ts) via the response schema below.
// insertEvidenceFact() re-checks the whitelist independently at the write
// path regardless of what the model returns.
export type ExtractedFact = {
  amount: number;
  date: string;
  source_type: "whatsapp_transfer" | "cash_receipt" | "other";
  counterparty_masked: string | null;
};

const MODEL = "gemini-3.5-flash-lite";

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    facts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          amount: {
            type: Type.NUMBER,
            description: "Numeric amount in MXN pesos, no currency symbols or commas.",
          },
          date: {
            type: Type.STRING,
            description: "Transaction date in ISO 8601 format (YYYY-MM-DD).",
          },
          source_type: {
            type: Type.STRING,
            enum: ["whatsapp_transfer", "cash_receipt", "other"],
            description: "How the payment was made or recorded.",
          },
          counterparty_masked: {
            type: Type.STRING,
            nullable: true,
            description:
              "The other party's identifier, already MASKED so no real identity is " +
              "recoverable (e.g. 'Juan Pérez' -> 'J*** P***', '+52 55 1234 5678' -> " +
              "'+52 55 **** 5678'). Never a full name, full phone number, address, or any " +
              "family/social-graph detail. Null if no counterparty is mentioned.",
          },
        },
        required: ["amount", "date", "source_type", "counterparty_masked"],
      },
    },
  },
  required: ["facts"],
};

const SYSTEM_PROMPT = `You extract structured payment facts from informal evidence text (e.g. a WhatsApp-style payment log) for an MSME loan applicant in Mexico. You extract facts only — you never score, rate, or recommend anything about the applicant.

Extract ONLY: amount, date, source_type, counterparty_masked. Never extract or infer family relationships, home address, geographic origin, or any contact list / social graph information — if the text mentions any of that, ignore it entirely; it must not appear anywhere in your output, including inside counterparty_masked.

counterparty_masked must already be masked in your output: reduce any name to initials with asterisks and any phone number to a masked form. Never output a real, unmasked identifier.

If the text contains multiple separate payments, extract one fact per payment. If nothing extractable is found, return an empty facts array.`;

export async function extractEvidenceFacts(rawText: string): Promise<ExtractedFact[]> {
  const client = createGeminiClient();
  const response = await client.models.generateContent({
    model: MODEL,
    contents: rawText,
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini did not return a parseable extraction result");
  }

  let parsed: { facts: ExtractedFact[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  return parsed.facts;
}
