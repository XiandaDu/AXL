"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Board, Judgement } from "@/lib/types";
import { ding, buzz } from "@/lib/sound";

type Phase = "loading" | "play" | "wager" | "ask" | "judging" | "result";
const fmt = (n: number) => (n < 0 ? `-$${Math.abs(n)}` : `$${n}`);
const key = (c: number, r: number) => `${c}-${r}`;

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

export default function Home() {
  const [board, setBoard] = useState<Board | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<{ c: number; r: number } | null>(null);
  const [response, setResponse] = useState("");
  const [wager, setWager] = useState(0);
  const [judgement, setJudgement] = useState<Judgement | null>(null);
  const [stats, setStats] = useState<Stats>({ correct: 0, total: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

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
    setActive(null);
    setJudgement(null);
    setResponse("");
    setPhase("play");
  }, []);

  useEffect(() => {
    setStats(loadStats());
  }, []);
  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);
  useEffect(() => {
    if (phase === "ask" || phase === "wager") inputRef.current?.focus();
  }, [phase]);

  const isDD = (c: number, r: number) =>
    board?.dailyDouble[0] === c && board?.dailyDouble[1] === r;

  const openClue = (c: number, r: number) => {
    if (phase !== "play" || answered.has(key(c, r))) return;
    setActive({ c, r });
    setResponse("");
    setJudgement(null);
    if (isDD(c, r)) {
      setWager(Math.max(score, 1000));
      setPhase("wager");
    } else {
      setPhase("ask");
    }
  };

  const clue =
    active && board ? board.categories[active.c].clues[active.r] : null;
  const stake = active && isDD(active.c, active.r) ? wager : clue?.value ?? 0;

  const submit = async () => {
    if (!clue || !active) return;
    setPhase("judging");
    let j: Judgement;
    try {
      const r = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clue: clue.clue,
          correctAnswer: clue.answer,
          response,
        }),
      });
      j = await r.json();
    } catch {
      j = {
        correct: false,
        confidence: 0,
        reason: `The answer was "${clue.answer}".`,
        quip: "Connection trouble — we'll call that a no.",
      };
    }
    setJudgement(j);
    const delta = j.correct ? stake : -stake;
    setScore((s) => s + delta);
    if (j.correct) ding();
    else buzz();
    const next = new Set(answered);
    next.add(key(active.c, active.r));
    setAnswered(next);
    const ns = {
      correct: stats.correct + (j.correct ? 1 : 0),
      total: stats.total + 1,
    };
    setStats(ns);
    try {
      localStorage.setItem("te-stats", JSON.stringify(ns));
    } catch {}
    setPhase("result");
  };

  const close = () => {
    setActive(null);
    setPhase("play");
  };

  const totalTiles = board ? board.categories.length * 5 : 30;
  const done = answered.size >= totalTiles && totalTiles > 0;

  return (
    <main className="mx-auto max-w-6xl px-3 py-5 sm:px-6">
      <Header score={score} level={level} liveOk={board?.liveOk} />

      {phase === "loading" && <Loading />}

      {board && phase !== "loading" && (
        <>
          {done ? (
            <GameOver
              score={score}
              stats={stats}
              onReplay={() =>
                fetchBoard(String((answered.size * 2654435761) % 1000000))
              }
            />
          ) : (
            <BoardGrid
              board={board}
              answered={answered}
              onPick={openClue}
            />
          )}
        </>
      )}

      {active && clue && phase !== "play" && phase !== "loading" && (
        <ClueModal
          category={board!.categories[active.c]}
          clue={clue}
          phase={phase}
          response={response}
          setResponse={setResponse}
          wager={wager}
          setWager={setWager}
          maxWager={Math.max(score, 1000)}
          stake={stake}
          isDD={isDD(active.c, active.r)}
          judgement={judgement}
          inputRef={inputRef}
          onWagerLock={() => setPhase("ask")}
          onSubmit={submit}
          onClose={close}
        />
      )}

      <footer className="mt-10 text-center text-xs text-slate-500">
        Classic categories distilled from a <b>538,000-clue</b> Jeopardy! archive
        · the <span className="text-jeop-gold">LIVE</span> category is written by
        AI from today&apos;s headlines · answers judged by an AI host.
      </footer>
    </main>
  );
}

function Header({
  score,
  level,
  liveOk,
}: {
  score: number;
  level: number;
  liveOk?: boolean;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="display text-3xl font-bold tracking-wide text-jeop-gold sm:text-5xl">
          TONIGHT&apos;S EDITION
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          A new AI-written Jeopardy every day.{" "}
          {liveOk === false && (
            <span className="text-amber-400">
              (Live category offline — add an API key.)
            </span>
          )}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-slate-500">
            Mix tuned to
          </div>
          <div className="display text-lg text-slate-300">
            {Math.round(level * 100)}% skill
          </div>
        </div>
        <div className="rounded-lg bg-jeop-blue-deep px-4 py-2 text-right tile-shadow">
          <div className="text-[10px] uppercase tracking-widest text-slate-400">
            Your score
          </div>
          <div
            className={`display text-2xl font-bold ${
              score < 0 ? "text-red-400" : "text-white"
            }`}
          >
            {fmt(score)}
          </div>
        </div>
      </div>
    </header>
  );
}

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
      className="grid gap-1.5 sm:gap-2"
      style={{
        gridTemplateColumns: `repeat(${board.categories.length}, minmax(0,1fr))`,
      }}
    >
      {board.categories.map((cat, c) => (
        <div
          key={c}
          className="flex min-h-[58px] items-center justify-center rounded-md bg-jeop-blue px-1 py-2 text-center tile-shadow sm:min-h-[72px]"
        >
          <span className="display text-[11px] font-semibold uppercase leading-tight text-white sm:text-sm">
            {cat.live && (
              <span className="mb-0.5 block text-[9px] font-bold tracking-widest text-jeop-gold">
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
              className={`min-h-[58px] rounded-md tile-shadow transition sm:min-h-[80px] ${
                used
                  ? "cursor-default bg-jeop-blue-deep/40"
                  : "bg-jeop-blue-deep hover:bg-jeop-blue active:scale-[0.98]"
              }`}
            >
              {!used && (
                <span className="display text-xl font-bold text-jeop-value sm:text-3xl">
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

function ClueModal({
  category,
  clue,
  phase,
  response,
  setResponse,
  wager,
  setWager,
  maxWager,
  stake,
  isDD,
  judgement,
  inputRef,
  onWagerLock,
  onSubmit,
  onClose,
}: {
  category: { category: string; live?: boolean; source?: string };
  clue: { value: number; clue: string; answer: string };
  phase: Phase;
  response: string;
  setResponse: (s: string) => void;
  wager: number;
  setWager: (n: number) => void;
  maxWager: number;
  stake: number;
  isDD: boolean;
  judgement: Judgement | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onWagerLock: () => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="animate-pop w-full max-w-2xl rounded-xl bg-jeop-blue p-6 tile-shadow sm:p-10">
        <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-widest text-blue-200">
          <span className="display">
            {category.category} · {fmt(clue.value)}
            {isDD && <span className="ml-2 text-jeop-gold">★ Daily Double</span>}
          </span>
          {category.live && category.source && (
            <span className="text-jeop-gold">{category.source}</span>
          )}
        </div>

        {phase === "wager" ? (
          <div className="text-center">
            <p className="display text-2xl text-jeop-gold">Daily Double!</p>
            <p className="mt-2 text-blue-100">
              Wager up to <b>{fmt(maxWager)}</b> before you see the clue.
            </p>
            <input
              ref={inputRef}
              type="number"
              min={5}
              max={maxWager}
              value={wager}
              onChange={(e) =>
                setWager(Math.min(maxWager, Math.max(5, +e.target.value)))
              }
              onKeyDown={(e) => e.key === "Enter" && onWagerLock()}
              className="mt-4 w-40 rounded-md bg-white/95 px-4 py-3 text-center text-2xl font-bold text-jeop-blue-deep outline-none"
            />
            <div>
              <button
                onClick={onWagerLock}
                className="mt-5 rounded-md bg-jeop-gold px-8 py-3 display font-bold text-jeop-blue-deep hover:brightness-110"
              >
                Lock it in
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="display text-center text-xl leading-snug text-white sm:text-3xl">
              {clue.clue}
            </p>

            {phase === "result" && judgement ? (
              <Result
                judgement={judgement}
                answer={clue.answer}
                stake={stake}
                onClose={onClose}
              />
            ) : (
              <div className="mt-7">
                <input
                  ref={inputRef}
                  value={response}
                  disabled={phase === "judging"}
                  onChange={(e) => setResponse(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && phase === "ask" && onSubmit()
                  }
                  placeholder="What is… ?"
                  className="w-full rounded-md bg-white/95 px-4 py-3 text-lg text-jeop-blue-deep outline-none disabled:opacity-60"
                />
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-blue-200">
                    Worth {fmt(stake)} · phrasing as a question optional
                  </span>
                  <button
                    onClick={onSubmit}
                    disabled={phase === "judging"}
                    className="rounded-md bg-jeop-gold px-7 py-2.5 display font-bold text-jeop-blue-deep hover:brightness-110 disabled:opacity-60"
                  >
                    {phase === "judging" ? "Judging…" : "Answer"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Result({
  judgement,
  answer,
  stake,
  onClose,
}: {
  judgement: Judgement;
  answer: string;
  stake: number;
  onClose: () => void;
}) {
  return (
    <div className="mt-7 text-center">
      <div
        className={`display text-3xl font-bold ${
          judgement.correct ? "text-emerald-300" : "text-red-300"
        }`}
      >
        {judgement.correct ? `Correct  +${fmt(stake)}` : `No  −${fmt(stake)}`}
      </div>
      {!judgement.correct && (
        <p className="mt-2 text-blue-100">
          Correct response: <b className="text-white">{answer}</b>
        </p>
      )}
      {judgement.quip && (
        <p className="mt-3 italic text-jeop-gold">“{judgement.quip}”</p>
      )}
      {judgement.reason && (
        <p className="mt-1 text-xs text-blue-200">{judgement.reason}</p>
      )}
      <button
        onClick={onClose}
        className="mt-6 rounded-md bg-white/90 px-8 py-2.5 display font-bold text-jeop-blue-deep hover:bg-white"
      >
        Back to board
      </button>
    </div>
  );
}

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
    )} on Tonight's Edition — the daily AI Jeopardy. Lifetime accuracy ${acc}%. Can you beat it?`;
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
    <div className="animate-pop mx-auto max-w-xl rounded-xl bg-jeop-blue p-8 text-center tile-shadow">
      <h2 className="display text-2xl text-jeop-gold">That&apos;s our show!</h2>
      <div
        className={`display mt-3 text-6xl font-bold ${
          score < 0 ? "text-red-300" : "text-white"
        }`}
      >
        {fmt(score)}
      </div>
      <p className="mt-3 text-blue-100">{verdict}</p>
      <p className="mt-2 text-sm text-blue-200">
        Lifetime accuracy: <b>{acc}%</b> over {stats.total} clues —
        tomorrow&apos;s board adapts to this.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={share}
          className="rounded-md bg-jeop-gold px-6 py-2.5 display font-bold text-jeop-blue-deep hover:brightness-110"
        >
          {copied ? "Copied!" : "Share score"}
        </button>
        <button
          onClick={onReplay}
          className="rounded-md bg-white/90 px-6 py-2.5 display font-bold text-jeop-blue-deep hover:bg-white"
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
      <div className="display animate-pulse text-2xl text-jeop-gold">
        Writing tonight&apos;s board…
      </div>
      <p className="mt-2 text-sm text-slate-400">
        Sampling the archive and reading today&apos;s headlines.
      </p>
    </div>
  );
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
