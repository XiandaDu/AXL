# Tonight's Edition — Write-up

**Live URL:** _<add after deploying to Vercel>_ · **Repo:** _<this repository>_

## What it is

A web game show in the spirit of **Jeopardy!**, reimagined as a *daily,
self-writing* game whose questions are composed by an LLM rather than pulled from
a fixed script. Each board has six categories of five **plain-English,
multiple-choice** questions. Most categories are grounded in a real
538,000-clue Jeopardy! archive and rewritten by the model into clear questions;
one — the **LIVE** round — is written on the spot from today's actual headlines.
You pick a tile, choose an answer (tap or press `1–4`), and score instantly,
with a one-line explainer, a Daily Double with wagering, and 🔥 streaks.

**Audience:** trivia fans and casual players who want a quick, fresh daily game —
the "same board today, come back tomorrow" loop that made Wordle sticky — without
the friction of classic Jeopardy's cryptic phrasing and typed answers.

## How AI is used (meaningfully — it *is* the content engine)

1. **AI as writer.** Real Jeopardy! category *topics* are handed to Claude
   (`sonnet-4-6`), which writes five fresh, difficulty-ascending multiple-choice
   questions per category — four options, one correct, plus an explainer. This
   turns the archive's cryptic "answer-in-the-form-of-a-question" style into
   something anyone can instantly understand. There is no game without it.
2. **AI as theme engine.** Type a theme (e.g. "space") and the model first
   expands it into six distinct sub-topics, then writes a full category for each —
   one word becomes a coherent, varied board. Any single column can also be
   regenerated on demand.
3. **AI as daily author.** The LIVE category is generated from real headlines,
   making the game current and different every day.

A no-key fallback (a curated offline question set) keeps the app playable and
demoable without credentials.

## How data is used (at scale)

The [538k-clue dataset](https://github.com/jwolle1/jeopardy_clue_dataset) is
streamed through `scripts/build-clues.mjs`, which **reconstructs intact
categories** by grouping clues by air-date + round + category, keeps only those
with a clean five-rung value ladder, strips media-dependent ("seen here") clues
and markup, dedupes by name, and **deterministically samples ~600 topically
diverse category topics** committed to the repo. So the data isn't a flat trivia
bank — it grounds the model in *authentic subject matter* instead of letting it
invent topics from nothing. Live data comes from two free, no-auth sources — the
Hacker News (Algolia) front page and the Wikipedia featured feed — merged into
the prompt that writes the headlines category.

## Dynamic behavior

- **Daily freshness:** a date-seeded pool plus a fresh headlines category means
  the board differs every day (cached per day so it's stable and cheap).
- **Per-player adaptation:** the client tracks lifetime accuracy in
  `localStorage`; the board API uses that skill level to **shift the
  standard/hard category mix**, so stronger players get harder boards over time.
- **On-demand:** players steer the whole board to a theme, or regenerate a single
  column, with the model producing new content live.
- **Replayability:** boards are seeded by `(date, skill, seed)`, so they're
  reproducible yet "Restart" gives a fresh layout.

## Key design & architectural decisions

- **Multiple choice over free text** — removes Jeopardy's two friction points
  (cryptic phrasing, typed answers) for a general audience, while keeping the
  board, money values, Daily Double, wagering, and streaks that make it feel like
  the show. (This replaced an earlier free-text + AI-judge prototype.)
- **Next.js 16 / React 19 on Vercel** — one repo for UI + serverless API, an
  instant public URL, zero infra. Tailwind v4 for a fast, polished board UI.
- **Precompute the corpus at build time, not request time** — the large source
  is distilled offline into a small committed JSON, so gameplay needs no DB.
- **Graceful degradation & robust parsing** — every AI path has a deterministic
  fallback; model output is defensively type-coerced (every field stringified,
  the answer index parsed and clamped to 0–3) and read by a balanced-JSON
  extractor that tolerates extra prose.
- **Cost/latency** — per-day and per-theme pools are cached in memory and
  concurrent first-load requests are coalesced onto a single generation.
- **Scope tradeoffs (≈3 hrs):** shipped the core loop, the real corpus pipeline,
  AI question authoring, theme steering, single-column regeneration, the live
  headlines round, Daily Double, adaptivity, help, and share. Deliberately
  deferred: a shared-KV daily board + global leaderboard, host TTS voice, and
  multiplayer — noted as next steps rather than half-built.

## Tools used

Next.js 16, React 19, TypeScript, Tailwind CSS v4, the Anthropic SDK (Claude
`sonnet-4-6`), the public Jeopardy! clue dataset, the Hacker News + Wikipedia
APIs, and Vercel for hosting. Built with the Claude Code agent.
