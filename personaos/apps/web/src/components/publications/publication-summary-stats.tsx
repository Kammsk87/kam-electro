import React from "react";

export type PublicationSummary = {
  planned: number;
  ready: number;
  publishedThisWeek: number;
};

export function PublicationSummaryStats({ summary }: { summary?: PublicationSummary }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-sm">
      <Metric label="Запланировано" value={summary?.planned ?? 0} />
      <Metric label="Готово" value={summary?.ready ?? 0} />
      <Metric label="За неделю" value={summary?.publishedThisWeek ?? 0} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}
