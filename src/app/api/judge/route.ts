import { NextRequest, NextResponse } from "next/server";
import { getClient, JUDGE_MODEL, extractJson, hasKey } from "@/lib/anthropic";
import type { Judgement } from "@/lib/types";

export const runtime = "nodejs";

const SYSTEM = `You are the judge AND host of a Jeopardy-style game. Rule on whether the contestant's response is correct.

Be lenient like a real host: accept minor misspellings, missing/added articles, partial names that are unambiguous, and the gist of the right answer. Phrasing as a question ("what is...") is NOT required and never affects correctness. Reject answers that name the wrong entity or are too vague to be sure.

Always reply with ONLY a JSON object:
{"correct": boolean, "confidence": number (0-1), "reason": "<one short sentence>", "quip": "<one short in-character host line reacting to them>"}
Keep quip playful and PG. If correct, be warm; if wrong, reveal nothing beyond what the reason already states.`;

export async function POST(req: NextRequest) {
  const { clue, correctAnswer, response } = await req.json();

  if (typeof response !== "string" || !response.trim()) {
    return NextResponse.json({
      correct: false,
      confidence: 1,
      reason: "No answer was given.",
      quip: "Silence! A bold strategy.",
    } satisfies Judgement);
  }

  // Graceful local fallback so the game is playable without a key.
  if (!hasKey()) {
    const correct = normalize(response).includes(normalize(correctAnswer)) ||
      normalize(correctAnswer).includes(normalize(response));
    return NextResponse.json({
      correct,
      confidence: 0.5,
      reason: correct
        ? "Matched the accepted answer."
        : `The accepted answer was "${correctAnswer}".`,
      quip: correct ? "Nicely done!" : "Not what our judges had.",
    } satisfies Judgement);
  }

  try {
    const msg = await getClient().messages.create({
      model: JUDGE_MODEL,
      max_tokens: 220,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content:
            `Clue: ${clue}\n` +
            `Accepted answer: ${correctAnswer}\n` +
            `Contestant said: ${response}`,
        },
        { role: "assistant", content: "{" },
      ],
    });
    const text =
      "{" + msg.content.map((b) => ("text" in b ? b.text : "")).join("");
    const j = extractJson<Judgement>(text);
    return NextResponse.json({
      correct: !!j.correct,
      confidence: typeof j.confidence === "number" ? j.confidence : 0.6,
      reason: j.reason || "",
      quip: j.quip || "",
    } satisfies Judgement);
  } catch (e) {
    console.error("judge failed", e);
    const correct = normalize(response).includes(normalize(correctAnswer));
    return NextResponse.json({
      correct,
      confidence: 0.4,
      reason: correct ? "Close enough." : `The answer was "${correctAnswer}".`,
      quip: "Our judge stepped out — ruling by the book.",
    } satisfies Judgement);
  }
}

function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/^(what|who|where|when|why|how)\s+(is|are|was|were)\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}
