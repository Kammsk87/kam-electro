import React from "react";
import type { PlannerSummary } from "./planner-types";

export function PlannerSummaryStats({ summary }: { summary?: PlannerSummary }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-sm">
      <Metric label="Открыто сегодня" value={summary?.openToday ?? 0} />
      <Metric label="Готово сегодня" value={summary?.doneToday ?? 0} />
      <Metric label="Серия" value={summary?.streak ?? 0} />
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
