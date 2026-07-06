const sliders = [
  { key: "sleep", label: "Сон", icon: "😴", hint: "чем выше, тем лучше" },
  { key: "energy", label: "Энергия", icon: "⚡", hint: "сколько сил сейчас" },
  { key: "stress", label: "Стресс", icon: "😰", hint: "чем выше, тем хуже" },
  { key: "pain", label: "Боль/дискомфорт", icon: "🤕", hint: "чем выше, тем хуже" },
];

export default function CheckinSliders({ checkin, onChange }) {
  return (
    <div className="space-y-4">
      {sliders.map((slider) => (
        <label key={slider.key} className="block rounded-3xl bg-[#1a1a24] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-base font-bold text-[#f1f1f5]">
                <span className="mr-2">{slider.icon}</span>
                {slider.label}
              </p>
              <p className="text-xs text-[#888899]">{slider.hint}</p>
            </div>
            <span className="rounded-2xl bg-white/10 px-3 py-1 text-lg font-bold text-white">{checkin[slider.key]}</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={checkin[slider.key]}
            onChange={(event) => onChange(slider.key, Number(event.target.value))}
            className="h-3 w-full accent-indigo-500"
          />
        </label>
      ))}
    </div>
  );
}
