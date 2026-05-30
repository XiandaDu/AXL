import cluesData from "@/data/clues.json";
import fallbackData from "@/data/fallback.json";
import { getClient, WRITER_MODEL, extractJson, hasKey } from "./anthropic";
import type { Category, Difficulty } from "./types";

const BOARD_VALUES = [200, 400, 600, 800, 1000];

type ArchiveCategory = {
  category: string;
  difficulty: Difficulty;
  clues: { clue: string; answer: string }[];
};

// The 538k-clue archive (distilled to a topic pool). We use it for its real
// category TOPICS so the daily board is grounded in genuine subject matter,
// then have the LLM rewrite each topic as clear, multiple-choice questions.
const ARCHIVE = cluesData as ArchiveCategory[];
const FALLBACK = fallbackData as Category[];

/** Deterministic PRNG so a given day yields the same topic selection. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function clampIdx(n: number): number {
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : 0;
}

/** Ask the writer model to turn one topic into 5 clear MC questions. */
export async function writeMcCategory(
  topic: string,
  difficulty: Difficulty,
  sampleAnswers: string[],
  source = "Grounded in the Jeopardy! archive"
): Promise<Category | null> {
  if (!hasKey()) return null;
  const sys =
    "You write ONE multiple-choice trivia category of exactly 5 questions for a " +
    "friendly quiz show. Rules: use plain, everyday language so ANYONE instantly " +
    "understands what is being asked — no cryptic 'this ___' riddles, no " +
    "answer-in-the-form-of-a-question phrasing. Each item is a direct question " +
    "with exactly 4 short options, ONE clearly correct. Order easy → hard. " +
    "Add a one-sentence explainer per question. Keep it broadly known " +
    "general knowledge (not hyper-obscure). Return ONLY JSON: " +
    '{"category": string, "clues": [{"question": string, "options": ' +
    '[string,string,string,string], "answer": number, "explainer": string}]} ' +
    "where answer is the 0-based index of the correct option.";

  const user =
    `Topic for the category: "${topic}".\n` +
    (sampleAnswers.length
      ? `For inspiration, some real answers that have appeared under this topic: ` +
        sampleAnswers.slice(0, 6).join(", ") +
        `.\n`
      : "") +
    `Write 5 fresh, clear multiple-choice questions on this topic now. ` +
    `Difficulty target: ${difficulty === "hard" ? "challenging" : "approachable"}.`;

  try {
    const msg = await getClient().messages.create({
      model: WRITER_MODEL,
      max_tokens: 1300,
      system: sys,
      messages: [
        { role: "user", content: user },
        { role: "assistant", content: "{" },
      ],
    });
    const text =
      "{" + msg.content.map((b) => ("text" in b ? b.text : "")).join("");
    const parsed = extractJson<{
      category: string;
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
      category: (parsed.category || topic).toUpperCase(),
      difficulty,
      source,
      clues: clues.slice(0, 5).map((c, i) => ({
        value: BOARD_VALUES[i],
        question: c.question,
        options: c.options.slice(0, 4),
        answer: clampIdx(c.answer),
        explainer: c.explainer,
      })),
    };
  } catch (e) {
    console.error(`writeMcCategory failed for "${topic}"`, e);
    return null;
  }
}

/** Ask the model for N distinct sub-topics that all sit under one theme. */
export async function generateSubtopics(
  theme: string,
  n: number
): Promise<string[]> {
  if (!hasKey()) return [];
  const sys =
    `You name distinct sub-topics for a quiz-show theme. Return ONLY a JSON ` +
    `array of ${n} short category titles (2–4 words each), every one a ` +
    `different angle on the theme, all well-known enough to write fair ` +
    `general-knowledge questions about. No duplicates, no commentary.`;
  try {
    const msg = await getClient().messages.create({
      model: WRITER_MODEL,
      max_tokens: 300,
      system: sys,
      messages: [
        { role: "user", content: `Theme: "${theme}". Give ${n} sub-topics.` },
        { role: "assistant", content: "[" },
      ],
    });
    const text =
      "[" + msg.content.map((b) => ("text" in b ? b.text : "")).join("");
    const arr = extractJson<string[]>(text);
    return Array.isArray(arr)
      ? arr.filter((x) => typeof x === "string" && x.trim()).slice(0, n)
      : [];
  } catch (e) {
    console.error("generateSubtopics failed", e);
    return [];
  }
}

/**
 * Build a pool of `count` categories that all orbit a user-supplied theme.
 * Powers the "steer the whole board" input.
 */
export async function generateThemedPool(
  theme: string,
  count = 6
): Promise<Category[]> {
  if (!hasKey()) return FALLBACK;
  const subs = await generateSubtopics(theme, count);
  while (subs.length < count) subs.push(theme);

  const cats = await Promise.all(
    subs.map((s, i) =>
      writeMcCategory(
        s,
        i % 3 === 2 ? "hard" : "standard",
        [],
        `AI · theme: ${theme}`
      )
    )
  );
  const ok = cats.filter((c): c is Category => !!c);
  if (ok.length < Math.min(6, count)) {
    for (const f of FALLBACK) {
      if (ok.length >= 6) break;
      if (!ok.some((c) => c.category === f.category)) ok.push(f);
    }
  }
  return ok;
}

/** One on-demand category for a single board column (theme or free topic). */
export async function generateOneCategory(
  topic: string,
  difficulty: Difficulty = "standard"
): Promise<Category | null> {
  if (!hasKey()) {
    const hit = FALLBACK.find((f) =>
      f.category.toLowerCase().includes(topic.toLowerCase())
    );
    return hit ?? FALLBACK[0] ?? null;
  }
  return writeMcCategory(topic, difficulty, [], `AI · ${topic}`);
}

/**
 * Build the day's pool of classic (non-headlines) categories as clear MC
 * questions. With a key: real archive topics, AI-rewritten. Without: the
 * curated offline fallback so the game is always playable.
 */
export async function generateClassicPool(date: string): Promise<Category[]> {
  if (!hasKey()) return FALLBACK;

  const rand = mulberry32(seedFromString(`pool:${date}`));
  const hard = shuffle(ARCHIVE.filter((c) => c.difficulty === "hard"), rand);
  const standard = shuffle(
    ARCHIVE.filter((c) => c.difficulty !== "hard"),
    rand
  );
  const picks = [...standard.slice(0, 5), ...hard.slice(0, 3)];

  const generated = await Promise.all(
    picks.map((p) =>
      writeMcCategory(
        p.category,
        p.difficulty === "hard" ? "hard" : "standard",
        p.clues.map((c) => c.answer)
      )
    )
  );
  const ok = generated.filter((c): c is Category => !!c);

  if (ok.length < 6) {
    for (const f of FALLBACK) {
      if (ok.length >= 6) break;
      if (!ok.some((c) => c.category === f.category)) ok.push(f);
    }
  }
  return ok;
}

export const ARCHIVE_SIZE = ARCHIVE.length;
export const TOTAL_CLUES_SOURCED = 538000;
