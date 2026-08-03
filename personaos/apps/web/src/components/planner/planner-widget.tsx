"use client";

import Link from "next/link";
import type { Route } from "next";
import { CalendarDays } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { PlannerSummaryStats } from "./planner-summary-stats";
import type { PlannerSummary } from "./planner-types";

export function PlannerWidget() {
  const summary = useQuery({
    queryKey: ["planner-summary"],
    queryFn: () => apiFetch<PlannerSummary>("/api/planner/summary"),
    retry: false
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Планер
        </CardTitle>
        <CardDescription>
          Ежедневный план без AI: capture, reflection, story, writing, publishing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PlannerSummaryStats summary={summary.data} />
        <Button asChild variant="outline" className="w-full">
          <Link href={"/planner" as Route}>Открыть планер</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
