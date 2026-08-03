import React from "react";
import type { AnalyticsSummary } from "./analytics-types";

export function AnalyticsSummaryStats({ summary }: { summary?: AnalyticsSummary }) {
  const items = [
    ["Capture", summary?.captures ?? 0],
    ["Рефлексии", summary?.reflections ?? 0],
    ["Истории", summary?.stories ?? 0],
    ["Черновики", summary?.drafts ?? 0],
    ["Публикации", summary?.publications ?? 0],
    ["Серия", summary?.streak ?? 0]
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-md border p-3">
          <p className="text-lg font-semibold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}
