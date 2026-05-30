// Builds a curated Jeopardy clue pool from the 538k-clue corpus.
// Streams the TSV from stdin so we never commit the 77MB source.
//
//   curl -sL <combined_season1-41.tsv> | node scripts/build-clues.mjs
//
// Output: src/data/clues.json  — an array of intact categories, each with
// exactly 5 clues remapped to a clean $200–$1000 board ladder.

import { createInterface } from "node:readline";
import { writeFileSync, mkdirSync } from "node:fs";

const TARGET_CATEGORIES = 600; // diverse pool; each game samples a few
const BOARD_VALUES = [200, 400, 600, 800, 1000];

// Reject clues that lean on audio/visual media or are otherwise unplayable
// as plain text.
const MEDIA = /\b(seen here|heard here|pictured|this video|audio|sketchpad)\b/i;
const cleanText = (s) =>
  (s || "")
    .replace(/\\"/g, '"') // dataset backslash-escapes quotes
    .replace(/\\'/g, "'")
    .replace(/<[^>]+>/g, " ") // strip stray HTML/links
    .replace(/\\+/g, "") // drop remaining stray backslashes
    .replace(/\s+/g, " ")
    .replace(/^["'(]+|["')]+$/g, "")
    .trim();

// group key -> { round, category, airDate, clues: [{value, clue, answer}] }
const groups = new Map();

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
let header = null;
let lineNo = 0;

for await (const line of rl) {
  lineNo++;
  const cols = line.split("\t");
  if (!header) {
    header = cols;
    continue;
  }
  const [round, clueValue, , category, comments, answer, question, airDate] =
    cols;
  if (round !== "1" && round !== "2") continue; // skip Final Jeopardy
  const clue = cleanText(answer);
  const resp = cleanText(question);
  const cat = cleanText(category);
  if (!clue || !resp || !cat) continue;
  if (clue.length < 12 || clue.length > 240) continue;
  if (resp.length > 60) continue;
  if (MEDIA.test(clue) || MEDIA.test(comments) || /href|http/i.test(answer))
    continue;

  const key = `${airDate}|${round}|${cat}`;
  if (!groups.has(key))
    groups.set(key, { round, category: cat, airDate, clues: [] });
  groups.get(key).clues.push({ value: Number(clueValue) || 0, clue, answer: resp });
}

// Keep only intact 5-clue categories with a clean ascending value ladder.
const seenCats = new Set();
const pool = [];
for (const g of groups.values()) {
  if (g.clues.length !== 5) continue;
  g.clues.sort((a, b) => a.value - b.value);
  const values = g.clues.map((c) => c.value);
  if (new Set(values).size !== 5) continue; // need 5 distinct rungs
  if (values[0] === 0) continue;
  const norm = g.category.toUpperCase();
  if (seenCats.has(norm)) continue; // one board per category name
  if (/^\d{3,4}S?$/.test(norm)) continue; // skip dry pure-year categories
  seenCats.add(norm);
  pool.push({
    category: g.category,
    // round 1 ~ easier, round 2 ~ harder
    difficulty: g.round === "1" ? "standard" : "hard",
    airDate: g.airDate,
    clues: g.clues.map((c, i) => ({
      value: BOARD_VALUES[i],
      clue: c.clue,
      answer: c.answer,
    })),
  });
}

// Deterministic shuffle (seeded) so the committed pool is reproducible but
// topically diverse — NOT biased toward any slice of the alphabet.
let seed = 0x9e3779b9;
const rng = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 1000000) / 1000000;
};
const shuffle = (arr) => {
  for (let k = arr.length - 1; k > 0; k--) {
    const j = Math.floor(rng() * (k + 1));
    [arr[k], arr[j]] = [arr[j], arr[k]];
  }
  return arr;
};
const standard = shuffle(pool.filter((p) => p.difficulty === "standard"));
const hard = shuffle(pool.filter((p) => p.difficulty === "hard"));
const picked = [];
let i = 0;
while (picked.length < TARGET_CATEGORIES && (standard[i] || hard[i])) {
  if (standard[i]) picked.push(standard[i]);
  if (hard[i] && picked.length < TARGET_CATEGORIES) picked.push(hard[i]);
  i++;
}

mkdirSync("src/data", { recursive: true });
writeFileSync("src/data/clues.json", JSON.stringify(picked));
console.error(
  `Parsed ${lineNo} rows -> ${groups.size} category-rounds -> ` +
    `${pool.length} intact -> wrote ${picked.length} curated categories ` +
    `(${(JSON.stringify(picked).length / 1024).toFixed(0)} KB)`
);
