import { NextResponse } from "next/server";

export const runtime = "nodejs";

// The game moved from free-text answers (judged by an LLM) to clear
// multiple-choice questions, which are scored on the client. This endpoint is
// retained only so any stale client doesn't 404; it is no longer used.
export async function POST() {
  return NextResponse.json(
    { error: "Answers are now multiple-choice and scored client-side." },
    { status: 410 }
  );
}
