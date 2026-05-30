import { NextRequest, NextResponse } from "next/server";
import { assembleBoard } from "@/lib/board";
import { generateClassicPool, generateThemedPool } from "@/lib/generate";
import { generateLiveCategory } from "@/lib/news";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daily pool (AI categories + headlines) — generated at most once per UTC day
// per warm instance. Production would back this with a shared KV store.
let cache: { date: string; pool: Category[] } | null = null;
let inflight: Promise<Category[]> | null = null;

// Themed pools requested via the "steer the board" input, keyed by theme.
const themed = new Map<string, Promise<Category[]>>();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function buildDailyPool(date: string): Promise<Category[]> {
  const [classics, live] = await Promise.all([
    generateClassicPool(date),
    generateLiveCategory(),
  ]);
  return live ? [live, ...classics] : classics;
}

export async function GET(req: NextRequest) {
  const date = today();
  const level = clamp01(Number(req.nextUrl.searchParams.get("level") ?? "0.3"));
  const theme = (req.nextUrl.searchParams.get("theme") ?? "").trim().slice(0, 80);
  const seed = req.nextUrl.searchParams.get("seed") ?? "";

  let pool: Category[];
  if (theme) {
    const k = theme.toLowerCase();
    if (!themed.has(k)) {
      if (themed.size > 24) themed.clear(); // bounded for the demo
      themed.set(k, generateThemedPool(theme));
    }
    try {
      pool = await themed.get(k)!;
    } catch {
      themed.delete(k);
      pool = await generateThemedPool(theme);
    }
  } else {
    if (!cache || cache.date !== date) {
      if (!inflight) inflight = buildDailyPool(date);
      try {
        cache = { date, pool: await inflight };
      } finally {
        inflight = null;
      }
    }
    pool = cache.pool;
  }

  const board = assembleBoard(date, level, pool, seed);
  return NextResponse.json(
    { ...board, theme: theme || undefined },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.3;
  return Math.max(0, Math.min(1, n));
}
