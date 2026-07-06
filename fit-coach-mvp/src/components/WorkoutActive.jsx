import { useEffect, useMemo, useState } from "react";
import ExerciseLogger from "./ExerciseLogger.jsx";
import RestTimer from "./RestTimer.jsx";

export default function WorkoutActive({ workout, profile, previousWorkouts, onCancel, onFinish }) {
  const [startedAt] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [logs, setLogs] = useState(workout.exercises.map((exercise) => ({ name: exercise.name, sets: [] })));
  const [restEndAt, setRestEndAt] = useState(null);
  const current = workout.exercises[exerciseIndex];
  const currentLog = logs[exerciseIndex];
  const setNumber = Math.min((currentLog?.sets.length || 0) + 1, current?.plannedSets || 1);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  const completedSets = useMemo(() => logs.reduce((sum, exercise) => sum + exercise.sets.length, 0), [logs]);
  const allDone = exerciseIndex >= workout.exercises.length;

  const logSet = (set) => {
    const nextLogs = logs.map((exercise, index) => (index === exerciseIndex ? { ...exercise, sets: [...exercise.sets, set] } : exercise));
    setLogs(nextLogs);
    const plannedSets = current.plannedSets || 1;
    const currentDone = nextLogs[exerciseIndex].sets.length >= plannedSets;
    if (currentDone) {
      setRestEndAt(null);
      setExerciseIndex((index) => index + 1);
    } else {
      setRestEndAt(Date.now() + profile.restTimerDefault * 1000);
    }
  };

  const finish = () => {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    if (window.confirm(`Записано ${completedSets} подходов. Завершить?`)) {
      onFinish({
        workout,
        durationMinutes: minutes,
        exercises: logs.filter((exercise) => exercise.sets.length),
      });
    }
  };

  return (
    <main className="min-h-screen bg-[#09090d] px-5 py-5 text-[#f1f1f5]">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-center gap-3 rounded-[2rem] bg-[#1a1a24] p-4">
          <button type="button" onClick={() => window.confirm("Закончить без сохранения?") && onCancel()} className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-xl font-bold">
            ✕
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{workout.name}</p>
            <p className="text-sm text-[#888899]">Таймер: {formatTime(elapsed)}</p>
          </div>
          <div className="rounded-2xl bg-indigo-500/20 px-3 py-2 text-sm font-bold text-indigo-200">{completedSets} записано</div>
        </header>

        {allDone ? (
          <section className="rounded-[2rem] bg-[#1a1a24] p-6 text-center">
            <p className="text-6xl">🎉</p>
            <h1 className="mt-4 text-3xl font-bold">Основная работа готова</h1>
            <p className="mt-2 text-[#888899]">Проверь ощущения и заверши тренировку.</p>
            <button type="button" onClick={finish} className="mt-6 min-h-16 w-full rounded-3xl bg-emerald-500 text-lg font-bold text-white">
              Завершить тренировку
            </button>
          </section>
        ) : restEndAt ? (
          <RestTimer restEndAt={restEndAt} duration={profile.restTimerDefault} vibrationEnabled={profile.vibrationEnabled} onSkip={() => setRestEndAt(null)} />
        ) : (
          <ExerciseLogger exercise={current} setNumber={setNumber} previous={previousWorkouts} onLog={logSet} />
        )}

        <details className="rounded-[2rem] bg-[#1a1a24] p-4">
          <summary className="min-h-12 cursor-pointer list-none font-bold">Список упражнений</summary>
          <div className="mt-3 space-y-2">
            {workout.exercises.map((exercise, index) => {
              const done = logs[index]?.sets.length >= (exercise.plannedSets || 1);
              return (
                <div key={exercise.name} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 text-sm">
                  <span>{done ? "✓" : index === exerciseIndex ? "▶" : "○"}</span>
                  <span className="flex-1">{exercise.name}</span>
                  <span className="text-[#888899]">{logs[index]?.sets.length || 0}/{exercise.plannedSets || 1}</span>
                </div>
              );
            })}
          </div>
        </details>

        <button type="button" onClick={finish} className="min-h-14 w-full rounded-3xl border border-white/10 text-[#888899]">
          Завершить тренировку
        </button>
      </div>
    </main>
  );
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
