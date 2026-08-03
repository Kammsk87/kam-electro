"use client";

import Link from "next/link";
import type { Route } from "next";
import { Brain } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";
import { MemorySummaryStats } from "./memory-summary-stats";
import type { MemorySummary } from "./memory-types";

export function MemoryWidget() {
  const summary = useQuery({
    queryKey: ["memory-summary"],
    queryFn: () => apiFetch<MemorySummary>("/api/memory/summary"),
    retry: false
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          Память
        </CardTitle>
        <CardDescription>Первая память опыта без AI и embeddings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <MemorySummaryStats summary={summary.data} />
        <div className="space-y-2">
          {(summary.data?.recent ?? []).slice(0, 3).map((item) => (
            <Link
              key={item.id}
              href={`/memory/${item.id}` as Route}
              className="block rounded-md border p-2 text-sm"
            >
              <p className="font-medium">{item.title || "Воспоминание без названия"}</p>
              <p className="text-muted-foreground">{label(item.importance)}</p>
            </Link>
          ))}
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href={"/memory" as Route}>Открыть память</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
