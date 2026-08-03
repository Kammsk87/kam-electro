"use client";

import Link from "next/link";
import type { Route } from "next";
import { Search } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";
import type { MemoryItem } from "./memory-types";

export function MemoryList() {
  const [search, setSearch] = useState("");
  const memories = useQuery({
    queryKey: ["memory", search],
    queryFn: () =>
      apiFetch<MemoryItem[]>(`/api/memory${search ? `?search=${encodeURIComponent(search)}` : ""}`),
    retry: false
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Memory Engine Lite</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Память</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Первая рабочая память PersonaOS: без AI, vector DB и embeddings. Только реальные Capture,
          Reflection и Story.
        </p>
      </div>

      <Card>
        <CardContent className="flex gap-3 pt-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-10 w-full rounded-md border bg-background pl-9 pr-3"
              placeholder="Поиск по названию, описанию или тегам"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(memories.data ?? []).map((memory) => (
          <Card key={memory.id}>
            <CardHeader>
              <CardTitle className="line-clamp-2">
                {memory.title || "Воспоминание без названия"}
              </CardTitle>
              <CardDescription>
                {label(memory.sourceType)} · {label(memory.importance)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="line-clamp-4 text-sm text-muted-foreground">
                {memory.summary || "Описание пустое."}
              </p>
              <div className="flex flex-wrap gap-2">
                {memory.tags.slice(0, 5).map((tag) => (
                  <span key={tag} className="rounded-full bg-secondary px-2 py-1 text-xs">
                    {tag}
                  </span>
                ))}
              </div>
              <Button asChild size="sm">
                <Link href={`/memory/${memory.id}` as Route}>Открыть память</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!memories.isLoading && !(memories.data ?? []).length ? (
        <Card>
          <CardHeader>
            <CardTitle>Память пока пустая</CardTitle>
            <CardDescription>
              Создай Capture, и PersonaOS автоматически сохранит первый MemoryItem.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
