export type Difficulty = "standard" | "hard";

export interface Clue {
  value: number;
  /** Plain-language question the player reads. */
  question: string;
  /** Exactly four answer options; one is correct. */
  options: string[];
  /** Index (0–3) of the correct option in `options`. */
  answer: number;
  /** One short sentence revealed after answering. */
  explainer?: string;
}

export interface Category {
  category: string;
  difficulty: Difficulty;
  /** Marks the AI-generated "Today's Headlines" category. */
  live?: boolean;
  /** One-line provenance shown in the UI. */
  source?: string;
  clues: Clue[];
}

export interface Board {
  /** YYYY-MM-DD the board was generated for. */
  date: string;
  /** dailyDouble tile, as [categoryIndex, clueIndex]. */
  dailyDouble: [number, number];
  categories: Category[];
  /** True when the board contains real AI output (vs. the offline fallback). */
  liveOk: boolean;
  /** True when the AI headlines category is present. */
  headlinesOk: boolean;
  /** User-supplied theme the board was steered toward, if any. */
  theme?: string;
}
