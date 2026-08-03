import { readinessLabel } from "../utils/readiness.js";

export default function ReadinessIndicator({ score }) {
  const info = readinessLabel(score);
  return (
    <div className={`rounded-3xl p-4 ${info.bg}`}>
      <p className="text-sm text-[#888899]">Готовность</p>
      <p className="mt-1 text-lg font-bold text-[#f1f1f5]">
        <span className={info.tone}>{info.level}</span> — {info.text}
      </p>
    </div>
  );
}
