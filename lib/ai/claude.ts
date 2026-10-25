import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// `server-only` makes the build fail if a client component imports this file,
// so ANTHROPIC_API_KEY can never end up in browser JavaScript.
//
// The race protocol fixes the envelope, never the model, so this sits behind the
// same one-function interface the Gemini helper used. Swapping models is a one-line change.

const DEFAULT_MODEL = "claude-opus-5-5";

/**
 * For mechanical steps: reshaping an answer into a JSON Schema, pulling named fields out of an
 * instruction. No judgement is involved, and the latency saved buys headroom inside the layer's
 * time limit. Anything the verifier actually grades stays on the default model.
 */
export const FAST_MODEL = "claude-haiku-5-5";

/**
 * Effort is the only depth control on this model: thinking is always on and cannot be
 * disabled. Keep it low for the race, where every answer has to land inside the layer's
 * 20 to 60 second window, and raise it only where the extra thinking earns its latency.
 */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

let client: Anthropic | null = null;

export class MissingAnthropicKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart `npm run dev`.");
  }
}

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new MissingAnthropicKeyError();
  client ??= new Anthropic({ apiKey });
  return client;
}

export async function askClaude(prompt: string, opts: { effort?: Effort; maxTokens?: number; model?: string } = {}): Promise<string> {
  const response = await getClient().messages.create({
    model: opts.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
    max_tokens: opts.maxTokens ?? 16_000,
    output_config: { effort: opts.effort ?? "low" },
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`The model declined this request (${response.stop_details?.category ?? "unknown category"}).`);
  }

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}
