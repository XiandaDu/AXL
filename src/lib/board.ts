import type { Board, Category } from "./types";

/** Deterministic PRNG so a given (date, level, seed) always yields the board. */
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
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Assemble a 6-column board from the day's category pool. `level` (0–1) is the
 * player's running accuracy and biases the mix toward harder categories — the
 * per-user adaptive dimension. A `live` (headlines) category, if present in the
 * pool, is always placed first.
 */
export function assembleBoard(
  date: string,
  level: number,
  pool: Category[],
  seed = ""
): Board {
  const rand = mulberry32(seedFromString(`${date}:${level.toFixed(1)}:${seed}`));

  const live = pool.find((c) => c.live) ?? null;
  const classics = pool.filter((c) => !c.live);
  const slots = live ? 5 : 6;

  const wantHard = Math.round(slots * (0.25 + 0.5 * clamp01(level)));
  const hard = shuffle(classics.filter((c) => c.difficulty === "hard"), rand);
  const standard = shuffle(
    classics.filter((c) => c.difficulty !== "hard"),
    rand
  );

  const picked: Category[] = [];
  const takeFrom = (arr: Category[], n: number) => {
    for (let i = 0; i < arr.length && n > 0; i++) {
      if (!picked.includes(arr[i])) {
        picked.push(arr[i]);
        n--;
      }
    }
  };
  takeFrom(hard, wantHard);
  takeFrom(standard, slots - picked.length);
  takeFrom(hard, slots - picked.length); // backfill if a pool runs short

  const categories = live
    ? [live, ...picked.slice(0, 5)]
    : picked.slice(0, 6);

  // Daily Double on a non-cheapest tile of a random classic category.
  const ddCat = live
    ? 1 + Math.floor(rand() * Math.max(1, categories.length - 1))
    : Math.floor(rand() * categories.length);
  const ddClue = 1 + Math.floor(rand() * 4);

  return {
    date,
    dailyDouble: [ddCat, ddClue],
    categories,
    liveOk: categories.length > 0,
    headlinesOk: !!live,
  };
}
