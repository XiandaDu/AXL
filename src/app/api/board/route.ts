import { NextRequest, NextResponse } from "next/server";
import { assembleBoard } from "@/lib/board";
import { generateClassicPool } from "@/lib/generate";
import { generateLiveCategory } from "@/lib/news";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generate the day's pool (AI-written categories + the headlines category) at
// most once per UTC day per warm instance. Production would back this with a
// shared KV store; in-memory keeps the demo dependency-free.
let cache: { date: string; pool: Category[] } | null = null;
let inflight: Promise<Category[]> | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function buildPool(date: string): Promise<Category[]> {
  const [classics, live] = await Promise.all([
    generateClassicPool(date),
    generateLiveCategory(),
  ]);
  return live ? [live, ...classics] : classics;
}

export async function GET(req: NextRequest) {
  const date = today();
  const level = clamp01(Number(req.nextUrl.searchParams.get("level") ?? "0.3"));

  if (!cache || cache.date !== date) {
    // Coalesce concurrent first-load requests onto a single generation.
    if (!inflight) inflight = buildPool(date);
    try {
      const pool = await inflight;
      cache = { date, pool };
    } finally {
      inflight = null;
    }
  }

  const seed = req.nextUrl.searchParams.get("seed") ?? "";
  const board = assembleBoard(date, level, cache.pool, seed);
  return NextResponse.json(board, {
    headers: { "Cache-Control": "no-store" },
  });
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.3;
  return Math.max(0, Math.min(1, n));
}
