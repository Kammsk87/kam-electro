export default function WorkoutCard({ workout, onStart, onChangeWorkout }) {
  return (
    <section className="rounded-[2rem] bg-[#1a1a24] p-5 shadow-2xl shadow-black/20">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#888899]">Тренировка дня</p>
      <div className="mt-4 flex gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-indigo-500/20 text-3xl">{workout.icon}</div>
        <div className="min-w-0">
          <h2 className="text-2xl font-bold text-[#f1f1f5]">{workout.name}</h2>
          <p className="mt-1 text-sm text-[#888899]">
            ~{workout.duration} мин · {workout.exercises.length} упражнения
          </p>
          <p className="mt-2 text-sm text-[#f1f1f5]/80">{workout.reason}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onStart}
        className="mt-6 min-h-16 w-full rounded-3xl bg-indigo-500 px-6 text-lg font-bold text-white shadow-lg shadow-indigo-500/25 transition active:scale-95"
      >
        Начать тренировку →
      </button>
      <button type="button" onClick={onChangeWorkout} className="mt-3 min-h-12 w-full text-sm font-bold text-indigo-300">
        Изменить тренировку
      </button>
    </section>
  );
}
