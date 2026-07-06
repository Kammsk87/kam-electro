import { useState } from "react";

export default function WorkoutSummary({ session, onSave }) {
  const [feedback, setFeedback] = useState("right");
  const [notes, setNotes] = useState("");
  const sets = session.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  const volume = session.exercises.reduce((sum, exercise) => sum + exercise.sets.reduce((setSum, set) => setSum + (Number(set.weight) || 0) * (Number(set.reps) || 0), 0), 0);
  const best = session.exercises.flatMap((exercise) => exercise.sets).sort((a, b) => (b.weight || 0) * (b.reps || 0) - (a.weight || 0) * (a.reps || 0))[0];

  return (
    <main className="min-h-screen bg-[#0f0f14] px-5 py-8 text-[#f1f1f5]">
      <div className="mx-auto max-w-2xl space-y-5">
        <section className="rounded-[2rem] bg-[#1a1a24] p-6 text-center">
          <p className="text-6xl">💪</p>
          <h1 className="mt-4 text-3xl font-bold">Тренировка завершена!</h1>
          <p className="mt-2 text-[#888899]">{session.durationMinutes} минуты</p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <Stat label="Подходов" value={sets} />
          <Stat label="Упражнений" value={session.exercises.length} />
          <Stat label="Объём нагрузки" value={`${volume} кг`} />
          <Stat label="Лучший подход" value={best ? `${best.weight || 0} кг × ${best.reps || 0}` : "—"} />
        </section>

        <section className="rounded-[2rem] bg-[#1a1a24] p-5">
          <h2 className="text-2xl font-bold">Как прошло?</h2>
          <div className="mt-4 space-y-3">
            {[
              ["easy", "😅 Слишком легко"],
              ["right", "💪 В самый раз"],
              ["hard", "🥵 Слишком тяжело"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFeedback(value)}
                className={`min-h-14 w-full rounded-2xl border text-left font-bold ${feedback === value ? "border-indigo-400 bg-indigo-500/20" : "border-white/10 bg-white/5"}`}
              >
                <span className="px-4">{label}</span>
              </button>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Болело плечо, стоит снизить вес..."
            className="mt-4 min-h-28 w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-white outline-none focus:border-indigo-400"
          />
          <button type="button" onClick={() => onSave({ feedback, notes })} className="mt-4 min-h-16 w-full rounded-3xl bg-indigo-500 text-lg font-bold text-white">
            Сохранить и выйти →
          </button>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-3xl bg-[#1a1a24] p-4">
      <p className="text-sm text-[#888899]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
