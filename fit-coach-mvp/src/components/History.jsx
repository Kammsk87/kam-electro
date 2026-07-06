import { useState } from "react";
import { downloadJson, exportAllData } from "../utils/storage.js";

export default function History({ workouts, onStart }) {
  const [openId, setOpenId] = useState(null);
  const stats = workouts.reduce(
    (acc, workout) => {
      acc[workout.type] = (acc[workout.type] || 0) + 1;
      return acc;
    },
    { strength: 0, cardio: 0, recovery: 0 },
  );

  return (
    <main className="min-h-screen bg-[#0f0f14] px-5 pb-28 pt-6 text-[#f1f1f5]">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold">История тренировок</h1>
          <button type="button" onClick={() => downloadJson(exportAllData())} className="min-h-12 rounded-2xl bg-white/10 px-4 text-sm font-bold">
            ⬇ Экспорт JSON
          </button>
        </header>

        {workouts.length === 0 ? (
          <section className="rounded-[2rem] bg-[#1a1a24] p-8 text-center">
            <p className="text-6xl">🏋️</p>
            <h2 className="mt-4 text-2xl font-bold">Первая тренировка ждёт тебя сегодня</h2>
            <button type="button" onClick={onStart} className="mt-6 min-h-16 w-full rounded-3xl bg-indigo-500 text-lg font-bold text-white">
              Начать сейчас →
            </button>
          </section>
        ) : (
          <>
            <section className="rounded-[2rem] bg-[#1a1a24] p-4 text-sm font-bold text-[#f1f1f5]">
              Силовых: {stats.strength || 0} | Кардио: {stats.cardio || 0} | Восстановление: {stats.recovery || 0}
            </section>
            <StreakCalendar workouts={workouts} />
            <section className="space-y-3">
              {workouts.map((workout) => (
                <article key={workout.id} className="rounded-[2rem] bg-[#1a1a24] p-4">
                  <button type="button" onClick={() => setOpenId(openId === workout.id ? null : workout.id)} className="flex min-h-14 w-full items-center gap-3 text-left">
                    <span className="text-2xl">{workout.type === "strength" ? "💪" : workout.type === "cardio" ? "⚡" : "🧘"}</span>
                    <span className="flex-1">
                      <strong className="block">{workout.name}</strong>
                      <span className="text-sm text-[#888899]">
                        {formatDate(workout.date)} · {workout.durationMinutes} мин · {countSets(workout)} подходов · {volume(workout)} кг
                      </span>
                    </span>
                  </button>
                  {openId === workout.id && (
                    <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                      {workout.exercises.map((exercise) => (
                        <div key={exercise.name} className="rounded-2xl bg-white/5 p-3 text-sm">
                          <strong>{exercise.name}</strong>
                          <p className="mt-1 text-[#888899]">{exercise.sets.map((set) => `${set.weight || 0} кг × ${set.reps || set.minutes || 0}`).join(" | ")}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function StreakCalendar({ workouts }) {
  const trained = new Set(workouts.map((workout) => workout.date.slice(0, 10)));
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - offset));
    return date;
  });
  return (
    <section className="rounded-[2rem] bg-[#1a1a24] p-4">
      <div className="grid grid-cols-7 gap-2 text-center text-xs text-[#888899]">
        {days.map((day) => (
          <div key={day.toISOString()}>
            <p>{new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(day)}</p>
            <div className={`mx-auto mt-2 h-7 w-7 rounded-full transition ${trained.has(day.toISOString().slice(0, 10)) ? "bg-emerald-500" : "bg-white/10"}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

function countSets(workout) {
  return workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
}

function volume(workout) {
  return workout.exercises.reduce((sum, exercise) => sum + exercise.sets.reduce((setSum, set) => setSum + (set.weight || 0) * (set.reps || 0), 0), 0);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(value));
}
