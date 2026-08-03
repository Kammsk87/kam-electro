"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { AnalyticsSummaryStats } from "./analytics-summary-stats";
import type { ActivityReport, AnalyticsSummary, HeatmapDay } from "./analytics-types";

export function AnalyticsPanel() {
  const summary = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: () => apiFetch<AnalyticsSummary>("/api/analytics/summary"),
    retry: false
  });
  const heatmap = useQuery({
    queryKey: ["analytics-heatmap"],
    queryFn: () => apiFetch<HeatmapDay[]>("/api/analytics/heatmap?days=90"),
    retry: false
  });
  const weekly = useQuery({
    queryKey: ["analytics-weekly"],
    queryFn: () => apiFetch<ActivityReport>("/api/analytics/weekly-report"),
    retry: false
  });
  const monthly = useQuery({
    queryKey: ["analytics-monthly"],
    queryFn: () => apiFetch<ActivityReport>("/api/analytics/monthly-report"),
    retry: false
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Аналитика</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Локальная аналитика</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Внутренняя аналитика PersonaOS: Capture, рефлексии, истории, черновики, публикации, серии
          и карта активности. Без внешних API.
        </p>
      </div>

      <AnalyticsSummaryStats summary={summary.data} />

      <Card>
        <CardHeader>
          <CardTitle>Карта активности</CardTitle>
          <CardDescription>Последние 90 дней активности внутри PersonaOS.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-15 gap-1 sm:grid-cols-30">
            {(heatmap.data ?? []).map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.count}`}
                className={`h-4 rounded-sm ${heatClass(day.count)}`}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportCard report={weekly.data} title="Отчет за неделю" />
        <ReportCard report={monthly.data} title="Отчет за месяц" />
      </div>
    </div>
  );
}

function ReportCard({ report, title }: { report?: ActivityReport; title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {report
            ? `${report.activeDays} активных дней · ${report.totalActivity} событий`
            : "Загружаю..."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {Object.entries(report?.totals ?? {}).map(([key, value]) => (
            <div key={key} className="rounded-md border p-2">
              <p className="font-medium">{value}</p>
              <p className="text-muted-foreground">{key}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {(report?.highlights ?? []).map((item) => (
            <p key={item} className="rounded-md bg-secondary px-3 py-2 text-sm">
              {item}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function heatClass(count: number) {
  if (count >= 8) return "bg-foreground";
  if (count >= 4) return "bg-foreground/70";
  if (count >= 1) return "bg-foreground/35";
  return "bg-secondary";
}
