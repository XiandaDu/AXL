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
 * Turn today's headlines into a single AI-written Jeopardy category.
 * This is the dynamic heart of the board — it can't exist without an LLM.
 */
export async function generateLiveCategory(): Promise<Category | null> {
  if (!hasKey()) return null;
  const headlines = await fetchHeadlines();
  if (headlines.length < 5) return null;

  const sys =
    "You are a Jeopardy! head writer. Given today's real headlines, write ONE " +
    "category of exactly 5 clues. Clues must be answerable from general " +
    "awareness of current events — clever and fair, in Jeopardy's declarative " +
    "style (the clue is a statement; the response is the question). Keep " +
    "answers to a few words. Ascend in difficulty. Avoid anything offensive. " +
    'Return ONLY JSON: {"category": string, "clues": [{"clue": string, ' +
    '"answer": string}], "source": string} where source is a short label like ' +
    '"Headlines, <month> <year>".';

  try {
    const msg = await getClient().messages.create({
      model: WRITER_MODEL,
      max_tokens: 900,
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
      clues: { clue: string; answer: string }[];
      source?: string;
    }>(text);
    if (!parsed.clues || parsed.clues.length < 5) return null;
    return {
      category: parsed.category?.toUpperCase() || "TODAY'S HEADLINES",
      difficulty: "hard",
      live: true,
      source: parsed.source || "Today's headlines",
      clues: parsed.clues.slice(0, 5).map((c, i) => ({
        value: BOARD_VALUES[i],
        clue: c.clue,
        answer: c.answer,
      })),
    };
  } catch (e) {
    console.error("live category generation failed", e);
    return null;
  }
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
