import CheckinSliders from "./CheckinSliders.jsx";
import ReadinessIndicator from "./ReadinessIndicator.jsx";
import WorkoutCard from "./WorkoutCard.jsx";

export default function Home({ profile, checkin, setCheckinValue, workout, streak, onStartWorkout, onProfile, onChangeWorkout }) {
  return (
    <main className="min-h-screen bg-[#0f0f14] px-5 pb-28 pt-6 text-[#f1f1f5]">
      <div className="mx-auto max-w-3xl space-y-5">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Привет, {profile.name} 👋</h1>
            <p className="mt-1 text-sm text-[#888899]">
              {formatDate(new Date())} · 🔥 {streak} дня подряд
            </p>
          </div>
          <button type="button" onClick={onProfile} className="grid h-12 w-12 place-items-center rounded-2xl bg-[#1a1a24] text-xl">
            👤
          </button>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Как ты сегодня?</h2>
          <CheckinSliders checkin={checkin} onChange={setCheckinValue} />
          <ReadinessIndicator score={checkin.readinessScore} />
        </section>

        <WorkoutCard workout={workout} onStart={onStartWorkout} onChangeWorkout={onChangeWorkout} />
      </div>
    </main>
  );
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(date);
}
