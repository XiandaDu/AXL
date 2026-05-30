export type Difficulty = "standard" | "hard";

export interface Clue {
  value: number;
  clue: string;
  answer: string;
}

export interface Category {
  category: string;
  difficulty: Difficulty;
  airDate?: string;
  /** Marks the AI-generated "Today's Headlines" category. */
  live?: boolean;
  /** One-line provenance shown in the UI, e.g. a source headline. */
  source?: string;
  clues: Clue[];
}

export interface Board {
  /** YYYY-MM-DD the board was generated for. */
  date: string;
  /** dailyDouble tile, as [categoryIndex, clueIndex]. */
  dailyDouble: [number, number];
  categories: Category[];
  /** True when the live category is real AI/news output (vs. a fallback). */
  liveOk: boolean;
}

export interface Judgement {
  correct: boolean;
  /** 0–1 confidence in the verdict. */
  confidence: number;
  /** One short sentence explaining the ruling. */
  reason: string;
  /** In-character host quip reacting to the player's response. */
  quip: string;
}
