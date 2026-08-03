"use client";

import Link from "next/link";
import type { Route } from "next";
import { BookOpen } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type StoriesSummary = {
  draft: number;
  ready: number;
};

export function StoriesWidget() {
  const summary = useQuery({
    queryKey: ["stories-summary"],
    queryFn: () => apiFetch<StoriesSummary>("/api/stories/summary"),
    retry: false
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Истории
        </CardTitle>
        <CardDescription>
          Черновики историй собраны из рефлексии без генерации текста.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-lg font-semibold">{summary.data?.ready ?? 0}</p>
            <p className="text-muted-foreground">Готовые истории</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{summary.data?.draft ?? 0}</p>
            <p className="text-muted-foreground">Черновики историй</p>
          </div>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href={"/stories" as Route}>Открыть истории</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
