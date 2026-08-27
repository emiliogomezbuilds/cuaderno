import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createAnthropicClient } from "./anthropic";

// Extraction only, never scoring — and structurally confined to the Shadow
// Clause whitelist (src/lib/shadowClause.ts): the model literally cannot
// return a field outside this shape. insertEvidenceFact() re-checks the
// whitelist independently at the write path regardless.
const ExtractedFactSchema = z.object({
  amount: z.number().describe("Numeric amount in MXN pesos, no currency symbols or commas."),
  date: z.string().describe("Transaction date in ISO 8601 format (YYYY-MM-DD)."),
  source_type: z
    .enum(["whatsapp_transfer", "cash_receipt", "other"])
    .describe("How the payment was made or recorded."),
  counterparty_masked: z
    .string()
    .nullable()
    .describe(
      "The other party's identifier, already MASKED so no real identity is recoverable " +
        "(e.g. 'Juan Pérez' -> 'J*** P***', '+52 55 1234 5678' -> '+52 55 **** 5678'). " +
        "Never a full name, full phone number, address, or any family/social-graph detail. " +
        "Null if no counterparty is mentioned.",
    ),
});

const ExtractionResultSchema = z.object({
  facts: z.array(ExtractedFactSchema),
});

export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

const SYSTEM_PROMPT = `You extract structured payment facts from informal evidence text (e.g. a WhatsApp-style payment log) for an MSME loan applicant in Mexico. You extract facts only — you never score, rate, or recommend anything about the applicant.

Extract ONLY: amount, date, source_type, counterparty_masked. Never extract or infer family relationships, home address, geographic origin, or any contact list / social graph information — if the text mentions any of that, ignore it entirely; it must not appear anywhere in your output, including inside counterparty_masked.

counterparty_masked must already be masked in your output: reduce any name to initials with asterisks and any phone number to a masked form. Never output a real, unmasked identifier.

If the text contains multiple separate payments, extract one fact per payment. If nothing extractable is found, return an empty facts array.`;

export async function extractEvidenceFacts(rawText: string): Promise<ExtractedFact[]> {
  const client = createAnthropicClient();
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: rawText }],
    output_config: { format: zodOutputFormat(ExtractionResultSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude did not return a parseable extraction result");
  }

  return response.parsed_output.facts;
}
