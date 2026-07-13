"use client";

import { useEffect, useMemo, useState } from "react";
import type { ControlMessage, Pack, PackDetail, TeamScore } from "@/lib/types";

type Step =
  | { kind: "setup" }
  | { kind: "round-intro"; questionIndex: number }
  | { kind: "question"; questionIndex: number }
  | { kind: "reveal"; questionIndex: number }
  | { kind: "final" };

function roundsInOrder(pack: PackDetail): string[] {
  return Array.from(new Set(pack.questions.map((q) => q.round)));
}

export default function ControlPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState("");
  const [pack, setPack] = useState<PackDetail | null>(null);
  const [teams, setTeams] = useState<TeamScore[]>([]);
  const [newTeamName, setNewTeamName] = useState("");
  const [step, setStep] = useState<Step>({ kind: "setup" });
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    async function loadPacks() {
      const res = await fetch("/api/packs");
      setPacks(await res.json());
    }
    void loadPacks();
  }, []);

  async function selectPack(id: string) {
    setSelectedPackId(id);
    if (!id) {
      setPack(null);
      return;
    }
    const res = await fetch(`/api/packs/${id}`);
    setPack(await res.json());
  }

  function send(message: ControlMessage) {
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  }

  function addTeam() {
    const name = newTeamName.trim();
    if (!name || teams.some((t) => t.name === name)) return;
    setTeams([...teams, { name, score: 0 }]);
    setNewTeamName("");
  }

  function removeTeam(name: string) {
    setTeams(teams.filter((t) => t.name !== name));
  }

  function adjustScore(name: string, delta: number) {
    setTeams((current) =>
      current.map((t) => (t.name === name ? { ...t, score: t.score + delta } : t))
    );
  }

  function startGame() {
    if (!pack || pack.questions.length === 0 || teams.length === 0) {
      alert("Выберите пак и добавьте хотя бы одну команду");
      return;
    }
    const rounds = roundsInOrder(pack);
    const firstRound = pack.questions[0].round;
    send({
      type: "round",
      round: firstRound,
      roundIndex: rounds.indexOf(firstRound) + 1,
      totalRounds: rounds.length,
    });
    setStep({ kind: "round-intro", questionIndex: 0 });
  }

  function startTimer(durationSeconds: number) {
    send({ type: "timer-start", durationSeconds, startedAt: Date.now() });
    setTimerRunning(true);
  }

  function stopTimer() {
    send({ type: "timer-stop" });
    setTimerRunning(false);
  }

  async function finishGame() {
    if (!pack) return;
    send({ type: "final", teams });
    setStep({ kind: "final" });
    await fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId: pack.id, packName: pack.name, teams }),
    });
  }

  function advance() {
    if (!pack) return;
    setTimerRunning(false);

    if (step.kind === "round-intro") {
      const q = pack.questions[step.questionIndex];
      send({
        type: "question",
        question: q,
        index: step.questionIndex + 1,
        total: pack.questions.length,
      });
      setStep({ kind: "question", questionIndex: step.questionIndex });
      return;
    }

    if (step.kind === "question") {
      const q = pack.questions[step.questionIndex];
      send({ type: "reveal", answer: q.answer });
      setStep({ kind: "reveal", questionIndex: step.questionIndex });
      return;
    }

    if (step.kind === "reveal") {
      const nextIndex = step.questionIndex + 1;
      if (nextIndex >= pack.questions.length) {
        void finishGame();
        return;
      }
      const rounds = roundsInOrder(pack);
      const currentRound = pack.questions[step.questionIndex].round;
      const nextRound = pack.questions[nextIndex].round;
      if (nextRound !== currentRound) {
        send({
          type: "round",
          round: nextRound,
          roundIndex: rounds.indexOf(nextRound) + 1,
          totalRounds: rounds.length,
        });
        setStep({ kind: "round-intro", questionIndex: nextIndex });
      } else {
        const q = pack.questions[nextIndex];
        send({
          type: "question",
          question: q,
          index: nextIndex + 1,
          total: pack.questions.length,
        });
        setStep({ kind: "question", questionIndex: nextIndex });
      }
    }
  }

  function resetGame() {
    setStep({ kind: "setup" });
    setTeams([]);
    send({ type: "idle" });
  }

  const currentQuestion = useMemo(() => {
    if (!pack) return null;
    if (step.kind === "question" || step.kind === "reveal" || step.kind === "round-intro") {
      return pack.questions[step.questionIndex];
    }
    return null;
  }, [pack, step]);

  const advanceLabel: Record<Step["kind"], string> = {
    setup: "",
    "round-intro": "Показать вопрос",
    question: "Показать ответ",
    reveal: "Дальше",
    final: "",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-bold">Квиз 1723 — Панель ведущего</h1>
        <p className="text-sm text-zinc-500">
          Откройте{" "}
          <a className="underline" href="/presenter" target="_blank" rel="noreferrer">
            /presenter
          </a>{" "}
          на проекторе/втором экране — он синхронизируется автоматически.
        </p>
      </header>

      {step.kind === "setup" && (
        <section className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Игровой пак</label>
            <select
              className="w-full rounded border px-2 py-1.5"
              value={selectedPackId}
              onChange={(e) => void selectPack(e.target.value)}
            >
              <option value="">— выберите пак —</option>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.questionCount} вопросов)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Команды</label>
            <div className="flex gap-2">
              <input
                className="flex-1 rounded border px-2 py-1.5"
                placeholder="Название команды"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTeam()}
              />
              <button
                onClick={addTeam}
                className="rounded bg-black px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
              >
                Добавить
              </button>
            </div>
            <div className="mt-2 space-y-1">
              {teams.map((t) => (
                <div
                  key={t.name}
                  className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
                >
                  <span>{t.name}</span>
                  <button
                    onClick={() => removeTeam(t.name)}
                    className="text-red-500 hover:text-red-700"
                  >
                    убрать
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={startGame}
            className="w-full rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
          >
            Начать игру
          </button>
        </section>
      )}

      {step.kind !== "setup" && pack && (
        <section className="space-y-6">
          <div className="rounded border border-zinc-200 p-4">
            {currentQuestion ? (
              <>
                <p className="text-sm text-zinc-500">
                  {currentQuestion.round} · тип: {currentQuestion.type}
                </p>
                <p className="mt-1 font-medium">{currentQuestion.question}</p>
                <p className="mt-1 text-sm text-emerald-700">
                  Ответ: {currentQuestion.answer}
                </p>
                {currentQuestion.mediaHint && (
                  <p className="mt-1 text-xs text-zinc-400">
                    Медиа: {currentQuestion.mediaHint}
                  </p>
                )}
              </>
            ) : (
              <p className="text-zinc-500">Игра завершена</p>
            )}
          </div>

          {step.kind === "question" && (
            <div className="flex gap-2">
              {!timerRunning ? (
                <button
                  onClick={() => startTimer(20)}
                  className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-100"
                >
                  Запустить таймер (20с)
                </button>
              ) : (
                <button
                  onClick={stopTimer}
                  className="rounded border px-3 py-1.5 text-sm hover:bg-zinc-100"
                >
                  Остановить таймер
                </button>
              )}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Очки команд</p>
            {teams.map((t) => (
              <div
                key={t.name}
                className="flex items-center justify-between rounded border px-3 py-2 text-sm"
              >
                <span>{t.name}</span>
                <div className="flex items-center gap-3">
                  <span className="w-10 text-right font-bold">{t.score}</span>
                  <button
                    onClick={() => adjustScore(t.name, -1)}
                    className="rounded border px-2 hover:bg-zinc-100"
                  >
                    −1
                  </button>
                  <button
                    onClick={() => adjustScore(t.name, 1)}
                    className="rounded border px-2 hover:bg-zinc-100"
                  >
                    +1
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            {step.kind !== "final" && (
              <button
                onClick={advance}
                className="rounded bg-black px-4 py-2 font-medium text-white hover:bg-zinc-800"
              >
                {advanceLabel[step.kind]}
              </button>
            )}
            <button
              onClick={() => send({ type: "leaderboard", teams })}
              className="rounded border px-4 py-2 text-sm hover:bg-zinc-100"
            >
              Показать лидерборд
            </button>
            {step.kind === "final" && (
              <button
                onClick={resetGame}
                className="rounded border px-4 py-2 text-sm hover:bg-zinc-100"
              >
                Новая игра
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
