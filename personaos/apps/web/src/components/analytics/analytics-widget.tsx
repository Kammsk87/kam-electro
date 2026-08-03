"use client";

import Link from "next/link";
import type { Route } from "next";
import { BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import type { AnalyticsSummary } from "./analytics-types";

export function AnalyticsWidget() {
  const summary = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: () => apiFetch<AnalyticsSummary>("/api/analytics/summary"),
    retry: false
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Аналитика
        </CardTitle>
        <CardDescription>Локальная аналитика активности без соцсетевых API.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-sm">
          <Metric label="Capture" value={summary.data?.captures ?? 0} />
          <Metric label="Черновики" value={summary.data?.drafts ?? 0} />
          <Metric label="Серия" value={summary.data?.streak ?? 0} />
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href={"/analytics" as Route}>Открыть аналитику</Link>
        </Button>
      </CardContent>
    </Card>
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
