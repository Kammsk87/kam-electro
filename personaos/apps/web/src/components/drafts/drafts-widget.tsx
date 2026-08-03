"use client";

import Link from "next/link";
import type { Route } from "next";
import { PenLine } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type DraftSummary = {
  ready: number;
  inProgress: number;
};

export function DraftsWidget() {
  const summary = useQuery({
    queryKey: ["drafts-summary"],
    queryFn: () => apiFetch<DraftSummary>("/api/drafts/summary"),
    retry: false
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PenLine className="h-5 w-5" />
          Черновики
        </CardTitle>
        <CardDescription>
          Writing Engine превращает историю в черновик для площадки.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-lg font-semibold">{summary.data?.ready ?? 0}</p>
            <p className="text-muted-foreground">Готовые черновики</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{summary.data?.inProgress ?? 0}</p>
            <p className="text-muted-foreground">В работе</p>
          </div>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href={"/drafts" as Route}>Открыть черновики</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
