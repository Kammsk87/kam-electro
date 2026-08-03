import React from "react";

export type PersonaDnaStatsData = {
  completeness: number;
  signalCount: number;
  lastVersion: number | null;
};

export function PersonaDnaStats({ summary }: { summary?: PersonaDnaStatsData }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-sm">
      <div>
        <p className="text-lg font-semibold">{summary?.completeness ?? 0}%</p>
        <p className="text-muted-foreground">профиль</p>
      </div>
      <div>
        <p className="text-lg font-semibold">{summary?.signalCount ?? 0}</p>
        <p className="text-muted-foreground">сигналы</p>
      </div>
      <div>
        <p className="text-lg font-semibold">{summary?.lastVersion ?? "—"}</p>
        <p className="text-muted-foreground">версия</p>
      </div>
    </div>
  );
}
