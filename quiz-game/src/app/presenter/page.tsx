"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ControlMessage } from "@/lib/types";

const TYPE_LABEL: Record<string, string> = {
  text: "",
  image: "🖼 Покажите изображение",
  audio: "🔊 Включите аудиофрагмент",
  video: "🎬 Включите видеофрагмент",
};

function TimerBar({
  startedAt,
  durationSeconds,
}: {
  startedAt: number;
  durationSeconds: number;
}) {
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const elapsed = (now - startedAt) / 1000;
  const remaining = Math.max(0, durationSeconds - elapsed);
  const pct = Math.max(0, Math.min(100, (remaining / durationSeconds) * 100));

  return (
    <div className="h-3 w-full max-w-2xl overflow-hidden rounded-full bg-zinc-800">
      <div
        className="h-full bg-emerald-400 transition-[width] duration-100 ease-linear"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function PresenterPage() {
  const [screen, setScreen] = useState<ControlMessage>({ type: "idle" });
  const [screenKey, setScreenKey] = useState(0);
  const [timer, setTimer] = useState<
    { startedAt: number; durationSeconds: number } | null
  >(null);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (event: MessageEvent<string>) => {
      const message = JSON.parse(event.data) as ControlMessage;
      if (message.type === "timer-start") {
        setTimer({
          startedAt: message.startedAt,
          durationSeconds: message.durationSeconds,
        });
        return;
      }
      if (message.type === "timer-stop") {
        setTimer(null);
        return;
      }
      if (message.type === "question" || message.type === "reveal") {
        setTimer(null);
      }
      setScreen(message);
      setScreenKey((key) => key + 1);
    };
    return () => es.close();
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-12 text-center text-white">
      <AnimatePresence mode="wait">
        <motion.div
          key={screenKey}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex w-full max-w-4xl flex-col items-center gap-8"
        >
          {screen.type === "idle" && (
            <>
              <motion.h1
                className="text-7xl font-black tracking-tight"
                animate={{ scale: [1, 1.03, 1] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                Квиз 1723
              </motion.h1>
              <p className="text-xl text-zinc-400">Скоро начнём…</p>
            </>
          )}

          {screen.type === "round" && (
            <>
              <p className="text-2xl text-emerald-400">
                Раунд {screen.roundIndex} из {screen.totalRounds}
              </p>
              <h1 className="text-6xl font-black">{screen.round}</h1>
            </>
          )}

          {screen.type === "question" && (
            <>
              <p className="text-lg text-zinc-400">
                Вопрос {screen.index} из {screen.total} · {screen.question.round}
              </p>
              {screen.question.mediaUrl ? (
                <>
                  {screen.question.type === "image" && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={screen.question.mediaUrl}
                      alt=""
                      className="max-h-[50vh] max-w-full rounded-lg object-contain"
                    />
                  )}
                  {screen.question.type === "video" && (
                    <video
                      src={screen.question.mediaUrl}
                      controls
                      autoPlay
                      className="max-h-[50vh] max-w-full rounded-lg"
                    />
                  )}
                  {screen.question.type === "audio" && (
                    <audio src={screen.question.mediaUrl} controls autoPlay />
                  )}
                </>
              ) : (
                TYPE_LABEL[screen.question.type] && (
                  <p className="text-xl text-amber-400">
                    {TYPE_LABEL[screen.question.type]}
                    {screen.question.mediaHint
                      ? ` — ${screen.question.mediaHint}`
                      : ""}
                  </p>
                )
              )}
              <h1 className="text-5xl leading-tight font-bold">
                {screen.question.question}
              </h1>
              {timer && (
                <TimerBar
                  startedAt={timer.startedAt}
                  durationSeconds={timer.durationSeconds}
                />
              )}
            </>
          )}

          {screen.type === "reveal" && (
            <>
              <p className="text-xl text-zinc-400">Правильный ответ:</p>
              <h1 className="text-6xl font-black text-emerald-400">
                {screen.answer}
              </h1>
            </>
          )}

          {(screen.type === "leaderboard" || screen.type === "final") && (
            <>
              <h1 className="text-4xl font-black">
                {screen.type === "final" ? "Финальный счёт" : "Таблица лидеров"}
              </h1>
              <div className="w-full max-w-xl space-y-3">
                {[...screen.teams]
                  .sort((a, b) => b.score - a.score)
                  .map((team, index) => (
                    <motion.div
                      key={team.name}
                      initial={{ opacity: 0, x: -40 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.15, duration: 0.4 }}
                      className="flex items-center justify-between rounded-lg bg-zinc-900 px-6 py-3 text-2xl"
                    >
                      <span>
                        {index === 0 ? "🏆 " : `${index + 1}. `}
                        {team.name}
                      </span>
                      <span className="font-bold text-emerald-400">
                        {team.score}
                      </span>
                    </motion.div>
                  ))}
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
