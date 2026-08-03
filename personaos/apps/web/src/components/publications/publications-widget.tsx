"use client";

import Link from "next/link";
import type { Route } from "next";
import { Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { PublicationSummaryStats, type PublicationSummary } from "./publication-summary-stats";

export function PublicationsWidget() {
  const summary = useQuery({
    queryKey: ["publications-summary"],
    queryFn: () => apiFetch<PublicationSummary>("/api/publications/summary"),
    retry: false
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="h-5 w-5" />
          Публикации
        </CardTitle>
        <CardDescription>Ручной слой публикаций без отправки в соцсети.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PublicationSummaryStats summary={summary.data} />
        <Button asChild variant="outline" className="w-full">
          <Link href={"/publishing" as Route}>Открыть публикации</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
