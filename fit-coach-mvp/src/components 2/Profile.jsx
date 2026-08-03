import { useRef } from "react";
import { clearAllData, downloadJson, exportAllData, importAllData } from "../utils/storage.js";

const levelOptions = [
  ["beginner", "Начинающий"],
  ["intermediate", "Средний"],
  ["advanced", "Продвинутый"],
];

const goalOptions = [
  ["strength", "Набор силы и массы"],
  ["weight_loss", "Похудение и рельеф"],
  ["health", "Здоровье и тонус"],
];

const cycleOptions = [
  [null, "Не указывать"],
  ["follicular", "Фолликулярная"],
  ["ovulation", "Овуляция"],
  ["luteal", "Лютеиновая"],
  ["menstrual", "Менструальная"],
];

export default function Profile({ profile, setProfile, onImported, onCleared }) {
  const inputRef = useRef(null);

  const update = (key, value) => setProfile({ ...profile, [key]: value });
  const importFile = async (file) => {
    if (!file) return;
    const data = JSON.parse(await file.text());
    importAllData(data);
    onImported();
  };

  const clear = () => {
    if (window.confirm("Точно очистить все данные?") && window.confirm("Это удалит профиль и историю. Продолжить?")) {
      clearAllData();
      onCleared();
    }
  };

  return (
    <main className="min-h-screen bg-[#0f0f14] px-5 pb-28 pt-6 text-[#f1f1f5]">
      <div className="mx-auto max-w-3xl space-y-5">
        <h1 className="text-3xl font-bold">Профиль</h1>

        <section className="rounded-[2rem] bg-[#1a1a24] p-5">
          <h2 className="text-2xl font-bold">Данные профиля</h2>
          <label className="mt-4 block text-sm font-bold text-[#888899]">
            Имя
            <input value={profile.name} onChange={(event) => update("name", event.target.value)} className="mt-2 min-h-14 w-full rounded-2xl bg-white/5 px-4 text-white outline-none" />
          </label>
          <Select label="Уровень" value={profile.level} options={levelOptions} onChange={(value) => update("level", value)} />
          <Select label="Цель" value={profile.goal} options={goalOptions} onChange={(value) => update("goal", value)} />
          <Select label="Время" value={String(profile.availableTime)} options={[["30", "30 мин"], ["45", "45 мин"], ["60", "60+ мин"]]} onChange={(value) => update("availableTime", Number(value))} />
        </section>

        <section className="rounded-[2rem] bg-[#1a1a24] p-5">
          <h2 className="text-2xl font-bold">Настройки тренировки</h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[60, 90, 120].map((seconds) => (
              <button
                key={seconds}
                type="button"
                onClick={() => update("restTimerDefault", seconds)}
                className={`min-h-14 rounded-2xl font-bold ${profile.restTimerDefault === seconds ? "bg-indigo-500" : "bg-white/5"}`}
              >
                {seconds} сек
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => update("vibrationEnabled", !profile.vibrationEnabled)}
            className={`mt-4 min-h-14 w-full rounded-2xl text-left font-bold ${profile.vibrationEnabled ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-[#888899]"}`}
          >
            <span className="px-4">Вибрация: {profile.vibrationEnabled ? "включена" : "выключена"}</span>
          </button>
          <Select label="Фаза цикла" value={profile.cyclePhase || ""} options={cycleOptions.map(([value, label]) => [value || "", label])} onChange={(value) => update("cyclePhase", value || null)} />
        </section>

        <section className="rounded-[2rem] bg-[#1a1a24] p-5">
          <h2 className="text-2xl font-bold">Данные и приватность</h2>
          <div className="mt-4 space-y-3">
            <button type="button" onClick={() => downloadJson(exportAllData())} className="min-h-14 w-full rounded-2xl bg-white/10 font-bold">
              ⬇ Экспортировать все данные
            </button>
            <button type="button" onClick={() => inputRef.current?.click()} className="min-h-14 w-full rounded-2xl bg-white/10 font-bold">
              ⬆ Импортировать данные
            </button>
            <button type="button" onClick={clear} className="min-h-14 w-full rounded-2xl bg-red-500/20 font-bold text-red-200">
              🗑 Очистить все данные
            </button>
            <input ref={inputRef} type="file" accept="application/json" hidden onChange={(event) => importFile(event.target.files?.[0])} />
          </div>
        </section>
      </div>
    </main>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="mt-4 block text-sm font-bold text-[#888899]">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-14 w-full rounded-2xl bg-white/5 px-4 text-white outline-none">
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue} className="bg-[#1a1a24]">
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
