import { NextRequest, NextResponse } from "next/server";
import { assembleBoard } from "@/lib/board";
import { generateLiveCategory } from "@/lib/news";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Generate the AI headlines category at most once per UTC day per warm
// instance. (Production would back this with a shared KV store; in-memory
// keeps the demo dependency-free and is correct for a single region.)
let cache: { date: string; live: Category | null } | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const date = today();
  const level = clamp01(Number(req.nextUrl.searchParams.get("level") ?? "0.3"));

  if (!cache || cache.date !== date) {
    const live = await generateLiveCategory();
    cache = { date, live };
  }

  const seed = req.nextUrl.searchParams.get("seed") ?? "";
  const board = assembleBoard(date, level, cache.live, seed);
  return NextResponse.json(board, {
    headers: { "Cache-Control": "no-store" },
  });
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.3;
  return Math.max(0, Math.min(1, n));
}
