# Tonight's Edition — the daily, self-writing Jeopardy!

A web Jeopardy! board where **every game is freshly generated and never repeats.**
Most categories are remixed from a real **538,000-clue** Jeopardy! archive; one
category — **TODAY'S HEADLINES** — is written live by an LLM from the day's actual
news. Every free-text answer is graded by an AI host that rules like a real judge.

> Built for the AXL take-home. Concept, data pipeline, and architecture notes are in
> [`WRITEUP.md`](./WRITEUP.md).

## Why this is more than a trivia clone

| Requirement | How it's met |
| --- | --- |
| **Meaningful AI** | The LLM *is the referee* (semantic, lenient free-text grading) **and** *the writer* (it composes the live news category). Neither is doable with string matching. |
| **Data at scale** | A 538k-clue corpus is distilled into 600 intact, hand-quality categories with authentic $200–$1000 value ladders. |
| **Dynamic behavior** | The headlines category is regenerated daily from live sources; the board mix also adapts to the player's running accuracy. |
| **Design / product** | Authentic board feel, keyboard-first play, Daily Double wagering, sound, a shareable daily score. |

## Quick start

```bash
npm install
cp .env.example .env.local       # then paste your key (optional, see below)
npm run dev                      # http://localhost:3000
```

### API key (optional but recommended)

The game is **fully playable without a key** — it falls back to local string-based
grading and ships 6 archive categories. Add an Anthropic key to unlock the two AI
features (LLM judge + live headlines category):

```
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

Get one at <https://console.anthropic.com>. Cost is a few cents per game
(Haiku for judging, Sonnet for the once-a-day category) — well within the $50 cap.

## Rebuilding the clue pool

`src/data/clues.json` (the curated 600 categories) is committed, so you don't need
to. To regenerate from the source corpus:

```bash
curl -sL https://raw.githubusercontent.com/jwolle1/jeopardy_clue_dataset/master/combined_season1-41.tsv \
  | node scripts/build-clues.mjs
```

The script streams the 77 MB TSV, keeps only intact 5-clue categories with clean
value ladders, strips media-dependent clues, dedupes, and samples 600 diverse
categories. The raw file is never committed.

## Architecture

```
src/
  data/clues.json            # 600 curated categories (built from 538k corpus)
  lib/
    board.ts                 # deterministic, date+skill-seeded board assembly
    news.ts                  # fetch headlines (HN + Wikipedia) -> LLM category
    anthropic.ts             # Claude client, model choices, JSON extraction
    sound.ts                 # Web Audio cues (no assets)
    types.ts
  app/
    api/board/route.ts       # GET today's board (live category cached per day)
    api/judge/route.ts       # POST a free-text answer -> {correct, reason, quip}
    page.tsx                 # the board, clue modal, wager, end screen
scripts/build-clues.mjs      # corpus -> curated pool
```

- **Framework:** Next.js 16 (App Router) + React 19, Tailwind v4.
- **AI:** Anthropic Claude — `claude-haiku-4-5` (judge), `claude-sonnet-4-6` (writer),
  with prompt caching on the judge system prompt.
- **Data sources:** [538k Jeopardy! clue dataset](https://github.com/jwolle1/jeopardy_clue_dataset);
  live news from the Hacker News (Algolia) and Wikipedia featured-feed APIs (both free, no auth).

## Deploy (Vercel)

```bash
npm i -g vercel
vercel            # link + deploy a preview
vercel --prod     # production URL
```

Set `ANTHROPIC_API_KEY` in the Vercel project's Environment Variables. No other
config needed; the routes run on the Node.js serverless runtime.

> Note: the live-category cache is in-memory per warm instance. For multi-region
> consistency in production, back it with a shared KV store (e.g. Vercel KV /
> Upstash) — see `src/app/api/board/route.ts`.
