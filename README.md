# Tonight's Edition — a daily, AI-written quiz show

A web game show in the spirit of **Jeopardy!**, reimagined so the questions are
written **live by an LLM** instead of pulled from a fixed script. Every visitor
gets a 6-category × 5-question board of clear, multiple-choice questions. The
board changes **every day**, can be **steered toward any theme** you type, and
**adapts in difficulty** to how well you're playing.

> **Live demo:** https://tonights-edition.vercel.app  <!-- replace with your deployed URL -->

![board](public/screenshot.png) <!-- optional -->

---

## Highlights

- **AI is the content engine.** Real Jeopardy! category *topics* are handed to
  Claude, which writes 5 fresh, plain-English multiple-choice questions per
  category (easy → hard), each with four options and a one-line explainer.
- **Steer the whole board.** Type a theme (e.g. `space`, `90s movies`,
  `world history`) → the model expands it into 6 sub-topics and writes a brand
  new board about it.
- **Regenerate one column.** The `↻` on any category header rewrites just that
  column on a topic you choose.
- **Today's headlines round.** A `LIVE` category is generated each day from real
  current events (Hacker News + Wikipedia), so the game is never the same twice.
- **Grounded in data at scale.** Classic categories are distilled from a
  **538,000-clue** Jeopardy! archive into a ~600-topic pool.
- **Adapts to you.** Lifetime accuracy (saved locally) nudges future boards
  harder or easier. Plus Daily Double wagering, score, and 🔥 streaks.
- **Always playable.** With no API key, a curated offline question set is served
  so the board is never empty.

---

## Quick start

```bash
cd tonights-edition
npm install

# Optional but recommended — enables AI question writing + the headlines round.
# Without it, the app serves a curated offline question set.
cp .env.example .env.local
#   then edit .env.local:  ANTHROPIC_API_KEY=sk-ant-...

npm run dev
# open http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

### Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | optional | Enables live AI question generation and the daily headlines category. Omit to run on the offline fallback set. |

---

## How it works

```
538k-clue Jeopardy! archive ──(build-clues.mjs, offline)──▶ ~600-topic pool (clues.json)
                                                                  │
HN + Wikipedia headlines ──▶ Claude (headlines category) ──┐      │
                                                           ▼      ▼
                                       /api/board ── assembleBoard() ──▶ daily / themed board
                                                           ▲
player theme / single-column request ──▶ /api/category ────┘   (Claude writes the questions)
```

1. **Data prep (offline).** `scripts/build-clues.mjs` streams the 538k-clue
   corpus, keeps only intact, text-playable 5-clue categories with a clean
   `$200–$1000` ladder, dedupes by name, and writes a diverse ~600-topic pool to
   `src/data/clues.json`. The large source dataset never ships with the repo.
2. **Board assembly.** `/api/board` samples real topics from the pool, asks
   Claude to rewrite each as clear multiple-choice questions, prepends the daily
   **headlines** category, and `assembleBoard()` lays out a difficulty-mixed
   board (seeded so a given day/skill level is reproducible).
3. **Theme & regenerate.** Typing a theme requests a themed pool; the `↻` button
   calls `/api/category` to rewrite a single column on demand.
4. **Play.** Answers are multiple choice (tap or press `1–4`), scored instantly
   with money values, a Daily Double, and streaks. Accuracy is stored in
   `localStorage` and feeds the adaptive difficulty.

---

## Project structure

```
tonights-edition/
├─ scripts/build-clues.mjs        # offline: 538k clues → ~600-topic pool
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                 # the entire game UI (board, modals, help)
│  │  ├─ globals.css              # theme + animations
│  │  └─ api/
│  │     ├─ board/route.ts        # daily / themed board
│  │     └─ category/route.ts     # regenerate one column
│  ├─ lib/
│  │  ├─ anthropic.ts             # SDK client + balanced-JSON extractor
│  │  ├─ generate.ts              # AI question authoring + theme decomposition
│  │  ├─ news.ts                  # headlines → AI "LIVE" category
│  │  ├─ board.ts                 # seeded, adaptive board assembly
│  │  ├─ sound.ts                 # Web Audio cues (no assets)
│  │  └─ types.ts
│  └─ data/
│     ├─ clues.json               # distilled ~600-topic pool (from the archive)
│     └─ fallback.json            # curated offline question set (no-key mode)
└─ method.txt                     # one-page approach write-up
```

---

## Tech

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
`@anthropic-ai/sdk` (Claude `sonnet-4-6`) · deployed on Vercel.

See **[`method.txt`](method.txt)** for the one-page approach write-up.

---

## Deploy

Push to GitHub and import the `tonights-edition/` directory into
[Vercel](https://vercel.com/new). Set the `ANTHROPIC_API_KEY` environment
variable in the project settings, then deploy.
