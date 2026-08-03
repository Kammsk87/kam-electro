import { useEffect, useState } from "react";

export default function RestTimer({ restEndAt, duration, onSkip, vibrationEnabled }) {
  const [left, setLeft] = useState(Math.max(0, Math.ceil((restEndAt - Date.now()) / 1000)));

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = Math.max(0, Math.ceil((restEndAt - Date.now()) / 1000));
      setLeft(next);
      if (next === 0) {
        if (vibrationEnabled && navigator.vibrate) navigator.vibrate(120);
        window.clearInterval(timer);
      }
    }, 300);
    return () => window.clearInterval(timer);
  }, [restEndAt, vibrationEnabled]);

  const progress = duration ? Math.max(0, Math.min(1, left / duration)) : 0;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="rounded-[2rem] bg-indigo-500/15 p-5 text-center">
      <div className="mx-auto grid h-32 w-32 place-items-center">
        <svg viewBox="0 0 120 120" className="absolute h-32 w-32 -rotate-90">
          <circle cx="60" cy="60" r={radius} stroke="rgba(255,255,255,.12)" strokeWidth="10" fill="none" />
          <circle
            cx="60"
            cy="60"
            r={radius}
            stroke="#6366f1"
            strokeWidth="10"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
          />
        </svg>
        <div className="relative">
          <p className="text-sm text-[#888899]">Отдых</p>
          <p className="text-3xl font-bold text-white">{formatTime(left)}</p>
        </div>
      </div>
      <button type="button" onClick={onSkip} className="mt-4 min-h-12 rounded-2xl bg-white/10 px-5 font-bold text-white">
        Пропустить отдых
      </button>
    </div>
  );
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
