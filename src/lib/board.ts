import cluesData from "@/data/clues.json";
import type { Board, Category, Difficulty } from "./types";

const POOL = cluesData as Category[];

/** Deterministic PRNG so a given (date, level) always yields the same board. */
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

/**
 * Assemble a board for `date`. `level` (0–1) is the player's running skill,
 * biasing the mix toward harder categories — this is the per-user adaptive
 * dimension. `live` is the AI-generated headlines category (placed first).
 */
export function assembleBoard(
  date: string,
  level: number,
  live: Category | null,
  seed = ""
): Board {
  const rand = mulberry32(seedFromString(`${date}:${level.toFixed(1)}:${seed}`));
  const slots = live ? 5 : 6;

  // Harder players see more "hard" categories; weight the pool accordingly.
  const wantHard = Math.round(slots * (0.3 + 0.5 * clamp01(level)));
  const hard = shuffle(POOL.filter((c) => c.difficulty === "hard"), rand);
  const standard = shuffle(
    POOL.filter((c) => c.difficulty === "standard"),
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
  takeFrom(hard, slots - picked.length); // backfill if pool short

  const categories = live ? [live, ...picked.slice(0, 5)] : picked.slice(0, 6);

  // Daily Double on a non-cheapest tile of a random classic category.
  const ddCat = live ? 1 + Math.floor(rand() * (categories.length - 1)) : Math.floor(rand() * categories.length);
  const ddClue = 1 + Math.floor(rand() * 4);

  return {
    date,
    dailyDouble: [ddCat, ddClue],
    categories,
    liveOk: !!live,
  };
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

export const POOL_SIZE = POOL.length;
export const TOTAL_CLUES_SOURCED = 538000; // corpus the pool was distilled from
export type { Difficulty };
