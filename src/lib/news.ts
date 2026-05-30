import { getClient, WRITER_MODEL, extractJson, hasKey } from "./anthropic";
import type { Category } from "./types";

const BOARD_VALUES = [200, 400, 600, 800, 1000];

/** Free, no-auth current-events sources. */
async function fetchHeadlines(): Promise<string[]> {
  const out: string[] = [];
  // Hacker News front page (tech/world discussion).
  try {
    const r = await fetch(
      "https://hn.algolia.com/api/v1/search?tags=front_page",
      { signal: AbortSignal.timeout(6000) }
    );
    const j = await r.json();
    for (const h of j.hits ?? []) if (h.title) out.push(h.title);
  } catch {}
  // Wikipedia "In the news" + most-read for the day.
  try {
    const d = new Date();
    const ymd = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(
      d.getUTCDate()
    )}`;
    const r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/feed/featured/${ymd}`,
      {
        headers: { "User-Agent": "TonightsEdition/1.0 (game-show-demo)" },
        signal: AbortSignal.timeout(6000),
      }
    );
    const j = await r.json();
    for (const n of j.news ?? [])
      if (n.story) out.push(stripHtml(n.story).slice(0, 200));
    for (const a of (j.mostread?.articles ?? []).slice(0, 12))
      if (a.normalizedtitle) out.push(a.normalizedtitle);
  } catch {}
  return out.filter(Boolean).slice(0, 40);
}

/**
 * Turn today's real headlines into ONE AI-written multiple-choice category.
 * This is the dynamic, current-events heart of the board — it can't exist
 * without an LLM and changes every day.
 */
export async function generateLiveCategory(): Promise<Category | null> {
  if (!hasKey()) return null;
  const headlines = await fetchHeadlines();
  if (headlines.length < 5) return null;

  const sys =
    "You write ONE multiple-choice trivia category of exactly 5 questions for a " +
    "friendly daily quiz show, based on today's real headlines. Rules: write in " +
    "plain, everyday language so anyone instantly understands the question — NO " +
    "cryptic phrasing, NO 'this person...' riddles. Each question is a direct " +
    "question. Give exactly 4 short answer options with ONE clearly correct. " +
    "Order the 5 questions easy → hard. Each question gets a one-sentence " +
    "explainer. Keep everything answerable from general awareness of recent " +
    "news; avoid anything offensive or hyper-niche. Return ONLY JSON: " +
    '{"category": string, "source": string, "clues": [{"question": string, ' +
    '"options": [string, string, string, string], "answer": number, ' +
    '"explainer": string}]} where answer is the 0-based index of the correct ' +
    'option and source is a short label like "Headlines, <month> <year>".';

  try {
    const msg = await getClient().messages.create({
      model: WRITER_MODEL,
      max_tokens: 1400,
      system: sys,
      messages: [
        {
          role: "user",
          content:
            "Today's headlines:\n- " +
            headlines.join("\n- ") +
            "\n\nWrite the category now.",
        },
        { role: "assistant", content: "{" },
      ],
    });
    const text =
      "{" + msg.content.map((b) => ("text" in b ? b.text : "")).join("");
    const parsed = extractJson<{
      category: string;
      source?: string;
      clues: {
        question: string;
        options: string[];
        answer: number;
        explainer?: string;
      }[];
    }>(text);
    const clues = (parsed.clues || []).filter(
      (c) => c.question && Array.isArray(c.options) && c.options.length === 4
    );
    if (clues.length < 5) return null;
    return {
      category: parsed.category?.toUpperCase() || "IN THE NEWS",
      difficulty: "hard",
      live: true,
      source: parsed.source || "Today's headlines",
      clues: clues.slice(0, 5).map((c, i) => ({
        value: BOARD_VALUES[i],
        question: c.question,
        options: c.options.slice(0, 4),
        answer: clampIdx(c.answer),
        explainer: c.explainer,
      })),
    };
  } catch (e) {
    console.error("live category generation failed", e);
    return null;
  }
}

function clampIdx(n: number): number {
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : 0;
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
