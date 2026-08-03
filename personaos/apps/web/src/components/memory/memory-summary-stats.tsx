import React from "react";
import type { MemorySummary } from "./memory-types";

export function MemorySummaryStats({ summary }: { summary?: MemorySummary }) {
  return (
    <div>
      <p className="text-lg font-semibold">{summary?.count ?? 0}</p>
      <p className="text-sm text-muted-foreground">Элементы памяти</p>
    </div>
  );
}
