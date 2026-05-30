"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Board, Category, Clue } from "@/lib/types";
import { ding, buzz } from "@/lib/sound";

type Phase = "loading" | "play" | "wager" | "ask" | "result";
const fmt = (n: number) => (n < 0 ? `-$${Math.abs(n)}` : `$${n}`);
const key = (c: number, r: number) => `${c}-${r}`;
const LETTERS = ["A", "B", "C", "D"];

interface Stats {
  correct: number;
  total: number;
}
function loadStats(): Stats {
  if (typeof window === "undefined") return { correct: 0, total: 0 };
  try {
    return JSON.parse(localStorage.getItem("te-stats") || "") as Stats;
  } catch {
    return { correct: 0, total: 0 };
  }
}
function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export default function Home() {
  const [board, setBoard] = useState<Board | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<{ c: number; r: number } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [wager, setWager] = useState(0);
  const [stats, setStats] = useState<Stats>({ correct: 0, total: 0 });

  const level = useMemo(
    () => (stats.total >= 5 ? clamp01(stats.correct / stats.total) : 0.3),
    [stats]
  );

  const fetchBoard = useCallback(async (seed = "") => {
    setPhase("loading");
    const s = loadStats();
    const lvl = s.total >= 5 ? clamp01(s.correct / s.total) : 0.3;
    const r = await fetch(`/api/board?level=${lvl}&seed=${seed}`);
    const b: Board = await r.json();
    setBoard(b);
    setAnswered(new Set());
    setScore(0);
    setStreak(0);
    setActive(null);
    setPicked(null);
    setPhase("play");
  }, []);

  useEffect(() => {
    setStats(loadStats());
  }, []);
  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  const isDD = (c: number, r: number) =>
    board?.dailyDouble[0] === c && board?.dailyDouble[1] === r;

  const openClue = (c: number, r: number) => {
    if (phase !== "play" || answered.has(key(c, r))) return;
    setActive({ c, r });
    setPicked(null);
    if (isDD(c, r)) {
      setWager(Math.max(score, 1000));
      setPhase("wager");
    } else {
      setPhase("ask");
    }
  };

  const clue: Clue | null =
    active && board ? board.categories[active.c].clues[active.r] : null;
  const stake = active && isDD(active.c, active.r) ? wager : clue?.value ?? 0;

  const choose = (idx: number) => {
    if (!clue || !active || phase !== "ask") return;
    const correct = idx === clue.answer;
    setPicked(idx);
    setPhase("result");
    setScore((s) => s + (correct ? stake : -stake));
    setStreak((k) => (correct ? k + 1 : 0));
    if (correct) ding();
    else buzz();

    setAnswered((prev) => new Set(prev).add(key(active.c, active.r)));
    const ns = {
      correct: stats.correct + (correct ? 1 : 0),
      total: stats.total + 1,
    };
    setStats(ns);
    try {
      localStorage.setItem("te-stats", JSON.stringify(ns));
    } catch {}
  };

  const close = () => {
    setActive(null);
    setPicked(null);
    setPhase("play");
  };

  const totalTiles = board ? board.categories.length * 5 : 30;
  const done = answered.size >= totalTiles && totalTiles > 0;

  return (
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-7">
      <Header score={score} level={level} streak={streak} board={board} />

      {phase === "loading" && <Loading />}

      {board && phase !== "loading" && !done && (
        <BoardGrid board={board} answered={answered} onPick={openClue} />
      )}

      {board && done && (
        <GameOver
          score={score}
          stats={stats}
          onReplay={() =>
            fetchBoard(String((answered.size * 2654435761) % 1000000))
          }
        />
      )}

      {active &&
        clue &&
        (phase === "ask" || phase === "wager" || phase === "result") && (
          <ClueModal
            category={board!.categories[active.c]}
            clue={clue}
            phase={phase}
            picked={picked}
            wager={wager}
            setWager={setWager}
            maxWager={Math.max(score, 1000)}
            stake={stake}
            isDD={isDD(active.c, active.r)}
            onWagerLock={() => setPhase("ask")}
            onChoose={choose}
            onClose={close}
          />
        )}

      <footer className="mt-10 pb-6 text-center text-xs leading-relaxed text-muted">
        A fresh board every day · classic categories grounded in a{" "}
        <b className="text-slate-300">538,000-clue</b> Jeopardy! archive and
        rewritten in plain English by AI · the{" "}
        <span className="gold-text font-semibold">LIVE</span> category is written
        from today&apos;s headlines · difficulty adapts to how you play.
      </footer>
    </main>
  );
}

/* ----------------------------------------------------------------- header */

function Header({
  score,
  level,
  streak,
  board,
}: {
  score: number;
  level: number;
  streak: number;
  board: Board | null;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="display gold-text text-3xl leading-none sm:text-5xl">
          TONIGHT&apos;S EDITION
        </h1>
        <p className="mt-2 text-sm text-muted">
          The daily AI quiz show.{" "}
          {board && !board.headlinesOk && (
            <span className="text-amber-400">
              Add an API key to unlock today&apos;s headlines round.
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        {streak >= 2 && (
          <Pill label="Streak" value={`🔥 ${streak}`} tone="accent" />
        )}
        <Pill label="Skill mix" value={`${Math.round(level * 100)}%`} />
        <div className="glass card-shadow rounded-2xl px-4 py-2 text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted">
            Score
          </div>
          <div
            className={`display text-2xl ${
              score < 0 ? "text-bad" : "gold-text"
            }`}
          >
            {fmt(score)}
          </div>
        </div>
      </div>
    </header>
  );
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent";
}) {
  return (
    <div className="glass card-shadow hidden rounded-2xl px-3.5 py-2 text-right sm:block">
      <div className="text-[10px] uppercase tracking-widest text-muted">
        {label}
      </div>
      <div
        className={`display text-lg ${
          tone === "accent" ? "text-accent-2" : "text-slate-200"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ board */

function BoardGrid({
  board,
  answered,
  onPick,
}: {
  board: Board;
  answered: Set<string>;
  onPick: (c: number, r: number) => void;
}) {
  return (
    <div
      className="grid gap-1.5 sm:gap-2.5"
      style={{
        gridTemplateColumns: `repeat(${board.categories.length}, minmax(0,1fr))`,
      }}
    >
      {board.categories.map((cat, c) => (
        <div
          key={c}
          className="glass card-shadow flex min-h-[60px] items-center justify-center rounded-xl px-1.5 py-2 text-center sm:min-h-[76px]"
        >
          <span className="display text-[11px] uppercase leading-tight text-slate-100 sm:text-sm">
            {cat.live && (
              <span className="mb-1 block text-[9px] font-bold tracking-widest text-accent-2">
                ● LIVE
              </span>
            )}
            {cat.category}
          </span>
        </div>
      ))}

      {[0, 1, 2, 3, 4].map((r) =>
        board.categories.map((cat, c) => {
          const used = answered.has(key(c, r));
          return (
            <button
              key={key(c, r)}
              onClick={() => onPick(c, r)}
              disabled={used}
              className={`group min-h-[60px] rounded-xl border transition-all duration-150 sm:min-h-[84px] ${
                used
                  ? "cursor-default border-transparent bg-panel/40"
                  : "card-shadow border-edge bg-gradient-to-b from-panel-2 to-panel hover:border-gold/60 hover:from-edge active:scale-[0.97]"
              }`}
            >
              {used ? (
                <span className="text-xl text-edge">✓</span>
              ) : (
                <span className="display text-xl text-gold transition-transform group-hover:scale-110 sm:text-3xl">
                  {fmt(cat.clues[r].value)}
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

/* ------------------------------------------------------------- clue modal */

function ClueModal({
  category,
  clue,
  phase,
  picked,
  wager,
  setWager,
  maxWager,
  stake,
  isDD,
  onWagerLock,
  onChoose,
  onClose,
}: {
  category: Category;
  clue: Clue;
  phase: Phase;
  picked: number | null;
  wager: number;
  setWager: (n: number) => void;
  maxWager: number;
  stake: number;
  isDD: boolean;
  onWagerLock: () => void;
  onChoose: (idx: number) => void;
  onClose: () => void;
}) {
  // keyboard: 1–4 to answer
  useEffect(() => {
    if (phase !== "ask") return;
    const h = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= clue.options.length) onChoose(n - 1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [phase, clue.options.length, onChoose]);

  const revealed = phase === "result" && picked !== null;
  const correct = revealed && picked === clue.answer;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-4">
      <div className="animate-pop glass card-shadow w-full max-w-2xl rounded-3xl p-5 sm:p-8">
        <div className="mb-4 flex items-center justify-between gap-2 text-[11px] uppercase tracking-widest text-muted">
          <span className="display text-slate-200">
            {category.category} ·{" "}
            <span className="text-gold">{fmt(clue.value)}</span>
            {isDD && <span className="ml-2 text-accent-2">★ Daily Double</span>}
          </span>
          {category.live && category.source && (
            <span className="text-accent-2">{category.source}</span>
          )}
        </div>

        {phase === "wager" ? (
          <Wager
            wager={wager}
            setWager={setWager}
            maxWager={maxWager}
            onLock={onWagerLock}
          />
        ) : (
          <>
            <p className="display text-center text-xl leading-snug text-white sm:text-3xl">
              {clue.question}
            </p>

            <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
              {clue.options.map((opt, i) => {
                const isPick = picked === i;
                const isAnswer = i === clue.answer;
                let cls =
                  "border-edge bg-panel-2 hover:border-gold/70 hover:bg-edge";
                if (revealed) {
                  if (isAnswer)
                    cls = "border-good bg-good/15 text-white";
                  else if (isPick)
                    cls = "border-bad bg-bad/15 text-white animate-shake";
                  else cls = "border-transparent bg-panel/50 opacity-60";
                }
                return (
                  <button
                    key={i}
                    disabled={revealed}
                    onClick={() => onChoose(i)}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all duration-150 active:scale-[0.98] ${cls}`}
                  >
                    <span
                      className={`display flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${
                        revealed && isAnswer
                          ? "bg-good text-ink"
                          : revealed && isPick
                            ? "bg-bad text-ink"
                            : "bg-edge text-slate-200"
                      }`}
                    >
                      {revealed && isAnswer
                        ? "✓"
                        : revealed && isPick
                          ? "✕"
                          : LETTERS[i]}
                    </span>
                    <span className="text-sm text-slate-100 sm:text-base">
                      {opt}
                    </span>
                  </button>
                );
              })}
            </div>

            {revealed ? (
              <Result
                correct={correct}
                stake={stake}
                explainer={clue.explainer}
                onClose={onClose}
              />
            ) : (
              <p className="mt-5 text-center text-xs text-muted">
                Worth {fmt(stake)} · tap an answer (or press 1–4)
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Wager({
  wager,
  setWager,
  maxWager,
  onLock,
}: {
  wager: number;
  setWager: (n: number) => void;
  maxWager: number;
  onLock: () => void;
}) {
  return (
    <div className="py-2 text-center">
      <p className="display text-2xl text-accent-2">Daily Double!</p>
      <p className="mt-2 text-muted">
        Wager up to <b className="text-slate-100">{fmt(maxWager)}</b> before you
        see the question.
      </p>
      <input
        autoFocus
        type="number"
        min={5}
        max={maxWager}
        value={wager}
        onChange={(e) =>
          setWager(Math.min(maxWager, Math.max(5, +e.target.value)))
        }
        onKeyDown={(e) => e.key === "Enter" && onLock()}
        className="mt-5 w-44 rounded-xl bg-white/95 px-4 py-3 text-center text-2xl font-bold text-ink outline-none"
      />
      <div>
        <button
          onClick={onLock}
          className="display animate-glow mt-6 rounded-xl bg-gold px-8 py-3 font-bold text-ink transition hover:brightness-110"
        >
          Lock it in
        </button>
      </div>
    </div>
  );
}

function Result({
  correct,
  stake,
  explainer,
  onClose,
}: {
  correct: boolean;
  stake: number;
  explainer?: string;
  onClose: () => void;
}) {
  return (
    <div className="animate-fade-up mt-6 text-center">
      <div
        className={`display text-2xl sm:text-3xl ${
          correct ? "text-good" : "text-bad"
        }`}
      >
        {correct ? `Correct!  +${fmt(stake)}` : `Not quite  −${fmt(stake)}`}
      </div>
      {explainer && (
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">{explainer}</p>
      )}
      <button
        onClick={onClose}
        className="display mt-5 rounded-xl bg-white/90 px-8 py-2.5 font-bold text-ink transition hover:bg-white"
      >
        Back to board
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- end game */

function GameOver({
  score,
  stats,
  onReplay,
}: {
  score: number;
  stats: Stats;
  onReplay: () => void;
}) {
  const acc = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0;
  const [copied, setCopied] = useState(false);
  const share = () => {
    const text = `I scored ${fmt(
      score
    )} on Tonight's Edition — the daily AI quiz show. Lifetime accuracy ${acc}%. Can you beat it?`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };
  const verdict =
    score >= 8000
      ? "A commanding performance. Ken Jennings is nervous."
      : score >= 3000
        ? "Solid play — you'd survive to tomorrow's show."
        : score >= 0
          ? "You held the line. The board can be cruel."
          : "Rough night at the podium — but you'll be back.";
  return (
    <div className="animate-pop glass card-shadow mx-auto max-w-xl rounded-3xl p-8 text-center">
      <h2 className="display text-2xl text-accent-2">That&apos;s our show!</h2>
      <div
        className={`display mt-3 text-6xl ${
          score < 0 ? "text-bad" : "gold-text"
        }`}
      >
        {fmt(score)}
      </div>
      <p className="mt-3 text-slate-200">{verdict}</p>
      <p className="mt-2 text-sm text-muted">
        Lifetime accuracy: <b className="text-slate-200">{acc}%</b> over{" "}
        {stats.total} questions — tomorrow&apos;s board adapts to this.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={share}
          className="display rounded-xl bg-gold px-6 py-2.5 font-bold text-ink transition hover:brightness-110"
        >
          {copied ? "Copied!" : "Share score"}
        </button>
        <button
          onClick={onReplay}
          className="display rounded-xl bg-white/90 px-6 py-2.5 font-bold text-ink transition hover:bg-white"
        >
          New board
        </button>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-5 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-3 w-3 animate-bounce rounded-full bg-gold"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <div className="display animate-pulse text-2xl text-gold">
        Writing tonight&apos;s board…
      </div>
      <p className="mt-2 text-sm text-muted">
        Sampling the archive and reading today&apos;s headlines.
      </p>
    </div>
  );
}
