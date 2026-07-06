import { useMemo, useState } from "react";

export default function ExerciseLogger({ exercise, setNumber, previous, onLog }) {
  const [weight, setWeight] = useState(exercise.suggestedWeight || 0);
  const [reps, setReps] = useState(exercise.plannedReps || 10);
  const [minutes, setMinutes] = useState(exercise.plannedMinutes || exercise.minutes || 20);
  const isStrength = exercise.type === "strength" || exercise.type === "time";
  const previousText = useMemo(() => {
    const match = previous?.flatMap((workout) => workout.exercises || []).find((item) => item.name === exercise.name);
    if (!match) return "Прошлый раз: пока нет данных";
    return `Прошлый раз: ${match.sets.map((set) => `${set.weight || 0} кг × ${set.reps || 0}`).join(" | ")}`;
  }, [exercise.name, previous]);

  if (!isStrength) {
    return (
      <div className="rounded-[2rem] bg-[#1a1a24] p-5">
        <h2 className="text-3xl font-bold text-white">{exercise.name}</h2>
        <p className="mt-2 text-[#888899]">Держи темп, при котором можно говорить короткую фразу.</p>
        <div className="mt-6 rounded-3xl bg-white/5 p-4">
          <label className="text-sm font-bold text-[#888899]">
            Минуты
            <input
              type="number"
              min="1"
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
              className="mt-2 min-h-14 w-full rounded-2xl bg-[#0f0f14] px-4 text-2xl font-bold text-white outline-none"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => onLog({ weight: 0, reps: minutes, completed: true, minutes })}
          className="mt-6 min-h-16 w-full rounded-3xl bg-emerald-500 text-lg font-bold text-white transition active:scale-95"
        >
          Записать шаг ✓
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] bg-[#1a1a24] p-5">
      <h2 className="text-3xl font-bold text-white">{exercise.name}</h2>
      <div className="mt-5 h-1 rounded-full bg-white/10" />
      <p className="mt-4 text-lg font-bold text-indigo-300">Подход {setNumber} из {exercise.plannedSets}</p>
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Stepper label="кг" value={weight} setValue={setWeight} step={2.5} />
        <Stepper label="повт" value={reps} setValue={setReps} step={1} />
      </div>
      <button
        type="button"
        onClick={() => onLog({ weight, reps, completed: true })}
        className="mt-6 min-h-16 w-full rounded-3xl bg-indigo-500 text-lg font-bold text-white transition active:scale-95 active:bg-emerald-500"
      >
        Записать подход ✓
      </button>
      <p className="mt-4 text-sm text-[#888899]">{previousText}</p>
    </div>
  );
}

function Stepper({ label, value, setValue, step }) {
  return (
    <div className="rounded-3xl bg-white/5 p-3 text-center">
      <label className="text-sm font-bold text-[#888899]">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        className="mt-2 min-h-14 w-full rounded-2xl bg-[#0f0f14] text-center text-2xl font-bold text-white outline-none"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setValue(Math.max(0, Number(value) - step))} className="min-h-11 rounded-2xl bg-white/10 text-xl font-bold text-white">−</button>
        <button type="button" onClick={() => setValue(Number(value) + step)} className="min-h-11 rounded-2xl bg-white/10 text-xl font-bold text-white">+</button>
      </div>
    </div>
  );
}
