"use client";

import Link from "next/link";
import type { Route } from "next";
import { FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";
import type { Draft } from "./draft-types";

export function DraftList() {
  const drafts = useQuery({
    queryKey: ["drafts"],
    queryFn: () => apiFetch<Draft[]>("/api/drafts"),
    retry: false
  });

  if (drafts.isLoading) {
    return <p className="text-muted-foreground">Собираю черновики...</p>;
  }

  const visibleDrafts = (drafts.data ?? []).filter((draft) => draft.status !== "ARCHIVED");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Writing Engine</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Черновики</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Первый AI-слой PersonaOS. Draft появляется только из Story и не должен менять смысл
          автора.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleDrafts.map((draft) => (
          <Card key={draft.id}>
            <CardHeader>
              <CardTitle className="line-clamp-2">
                {draft.title || "Черновик без названия"}
              </CardTitle>
              <CardDescription>
                {label(draft.platform)} · {label(draft.status)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="line-clamp-4 text-sm text-muted-foreground">{draft.content}</p>
              <Button asChild size="sm">
                <Link href={`/draft/${draft.id}` as Route}>
                  <FileText className="h-4 w-4" />
                  Открыть черновик
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!visibleDrafts.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Черновиков пока нет</CardTitle>
            <CardDescription>
              Открой Story и создай первый draft для Telegram, Instagram, Threads или VK.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
