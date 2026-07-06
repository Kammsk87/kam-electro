import { useState } from "react";

const levels = [
  { value: "beginner", icon: "🌱", title: "Начинающий", text: "меньше 6 месяцев" },
  { value: "intermediate", icon: "💪", title: "Средний", text: "от 6 месяцев до 2 лет" },
  { value: "advanced", icon: "🔥", title: "Продвинутый", text: "больше 2 лет" },
];

const goals = [
  { value: "strength", icon: "🏋️", title: "Набор силы и массы" },
  { value: "weight_loss", icon: "⚡", title: "Похудение и рельеф" },
  { value: "health", icon: "🧘", title: "Здоровье и тонус" },
];

export default function Onboarding({ onComplete }) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState({
    name: "",
    level: "",
    goal: "",
    availableTime: 45,
  });

  const complete = () => {
    onComplete({
      ...draft,
      name: draft.name.trim() || "Атлет",
      restTimerDefault: 90,
      vibrationEnabled: true,
      cyclePhase: null,
      createdAt: new Date().toISOString(),
    });
  };

  return (
    <main className="min-h-screen bg-[#0f0f14] px-5 py-6 text-[#f1f1f5]">
      <div className="mx-auto flex min-h-[calc(100vh-48px)] max-w-xl flex-col">
        <div className="mb-8 flex items-center justify-center gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} className={`h-2 rounded-full transition-all ${index + 1 <= step ? "w-8 bg-indigo-500" : "w-2 bg-white/20"}`} />
          ))}
        </div>

        <section className="flex flex-1 flex-col justify-center rounded-[2rem] bg-[#1a1a24] p-6">
          {step === 1 && (
            <div className="space-y-5">
              <p className="text-5xl">💪</p>
              <h1 className="text-3xl font-bold">Привет! Я твой тренер.</h1>
              <p className="text-lg text-[#888899]">Пара вопросов — и начнём</p>
              <PrimaryButton onClick={() => setStep(2)}>Поехали →</PrimaryButton>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <h1 className="text-3xl font-bold">Как тебя зовут?</h1>
              <input
                autoFocus
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Введи имя"
                className="min-h-14 w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-lg outline-none focus:border-indigo-400"
              />
              <PrimaryButton onClick={() => setStep(3)} disabled={!draft.name.trim()}>
                Далее
              </PrimaryButton>
            </div>
          )}

          {step === 3 && (
            <ChoiceStep title="Твой уровень подготовки" items={levels} value={draft.level} onPick={(level) => setDraft({ ...draft, level })} onNext={() => setStep(4)} />
          )}

          {step === 4 && (
            <ChoiceStep title="Главная цель сейчас" items={goals} value={draft.goal} onPick={(goal) => setDraft({ ...draft, goal })} onNext={() => setStep(5)} />
          )}

          {step === 5 && (
            <div className="space-y-5">
              <h1 className="text-3xl font-bold">Сколько времени на тренировку?</h1>
              <div className="grid grid-cols-3 gap-3">
                {[30, 45, 60].map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setDraft({ ...draft, availableTime: time })}
                    className={`min-h-16 rounded-2xl text-lg font-bold ${draft.availableTime === time ? "bg-indigo-500 text-white" : "bg-white/5 text-[#f1f1f5]"}`}
                  >
                    {time === 60 ? "60+ мин" : `${time} мин`}
                  </button>
                ))}
              </div>
              <PrimaryButton onClick={() => setStep(6)}>Далее</PrimaryButton>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-5 text-center">
              <p className="text-6xl">✅</p>
              <h1 className="text-3xl font-bold">Отлично, {draft.name.trim() || "атлет"}!</h1>
              <p className="text-lg text-[#888899]">Твой первый план готов. Начнём?</p>
              <PrimaryButton onClick={complete}>Начать первую тренировку →</PrimaryButton>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function ChoiceStep({ title, items, value, onPick, onNext }) {
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">{title}</h1>
      <div className="space-y-3">
        {items.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => onPick(item.value)}
            className={`flex min-h-20 w-full items-center gap-4 rounded-3xl border p-4 text-left transition ${
              value === item.value ? "border-indigo-400 bg-indigo-500/20" : "border-white/10 bg-white/5"
            }`}
          >
            <span className="text-3xl">{item.icon}</span>
            <span>
              <strong className="block text-lg">{item.title}</strong>
              {item.text && <span className="text-sm text-[#888899]">{item.text}</span>}
            </span>
          </button>
        ))}
      </div>
      {value && <PrimaryButton onClick={onNext}>Далее</PrimaryButton>}
    </div>
  );
}

function PrimaryButton({ children, ...props }) {
  return (
    <button
      type="button"
      className="min-h-16 w-full rounded-3xl bg-indigo-500 px-6 text-lg font-bold text-white transition enabled:active:scale-95 disabled:opacity-40"
      {...props}
    >
      {children}
    </button>
  );
}
