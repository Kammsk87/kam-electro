const items = [
  { key: "home", icon: "🏠", label: "Сегодня" },
  { key: "history", icon: "📊", label: "История" },
  { key: "profile", icon: "👤", label: "Профиль" },
];

export default function BottomNav({ appState, setAppState }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0f0f14]/95 px-4 py-3 backdrop-blur md:left-1/2 md:max-w-3xl md:-translate-x-1/2 md:rounded-t-3xl md:border-x">
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setAppState(item.key)}
            className={`min-h-14 rounded-2xl text-sm font-bold transition ${
              appState === item.key ? "bg-indigo-500 text-white" : "bg-white/5 text-[#888899]"
            }`}
          >
            <span className="mr-1">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
