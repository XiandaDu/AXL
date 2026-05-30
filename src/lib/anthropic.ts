import Anthropic from "@anthropic-ai/sdk";

// Fast + cheap for per-answer judging; higher-quality for board writing.
export const JUDGE_MODEL = "claude-haiku-4-5";
export const WRITER_MODEL = "claude-sonnet-4-6";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export function hasKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Pull the first balanced JSON object/array out of a model response. */
export function extractJson<T>(text: string): T {
  const start = text.search(/[{[]/);
  if (start === -1) throw new Error("no JSON in model output");
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error("unbalanced JSON in model output");
}
