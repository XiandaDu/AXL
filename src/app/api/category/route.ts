import { NextRequest, NextResponse } from "next/server";
import { generateOneCategory } from "@/lib/generate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// On-demand single category for regenerating one board column with the LLM.
export async function POST(req: NextRequest) {
  let body: { topic?: string; difficulty?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const topic = (body.topic ?? "").trim().slice(0, 80);
  if (!topic) {
    return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  }
  const difficulty = body.difficulty === "hard" ? "hard" : "standard";

  const category = await generateOneCategory(topic, difficulty);
  if (!category) {
    return NextResponse.json(
      { error: "Generation failed" },
      { status: 502 }
    );
  }
  return NextResponse.json(category, {
    headers: { "Cache-Control": "no-store" },
  });
}
