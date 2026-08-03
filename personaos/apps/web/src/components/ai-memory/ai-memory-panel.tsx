"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type AiMemorySummary = {
  memories: number;
  embeddings: number;
  coverage: number;
  provider: string;
};

type SearchResult = {
  memory: {
    id: string;
    title: string | null;
    summary: string | null;
    tags: string[];
  };
  score: number;
};

export function AiMemoryPanel() {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const queryClient = useQueryClient();
  const summary = useQuery({
    queryKey: ["ai-memory-summary"],
    queryFn: () => apiFetch<AiMemorySummary>("/api/ai-memory/summary"),
    retry: false
  });
  const results = useQuery({
    queryKey: ["ai-memory-search", activeQuery],
    queryFn: () =>
      apiFetch<SearchResult[]>(`/api/ai-memory/search?query=${encodeURIComponent(activeQuery)}`),
    enabled: activeQuery.length > 0,
    retry: false
  });
  const reindex = useMutation({
    mutationFn: () => apiFetch<{ indexed: number }>("/api/ai-memory/reindex", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-memory-summary"] })
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveQuery(query.trim());
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Этап 20</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">AI-память</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Embeddings, semantic search, similar memories и context retrieval. Сейчас используется
          локальный deterministic embedding provider.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Stat label="Воспоминания" value={summary.data?.memories ?? 0} />
        <Stat label="Embeddings" value={summary.data?.embeddings ?? 0} />
        <Stat label="Покрытие" value={`${summary.data?.coverage ?? 0}%`} />
        <Stat label="Провайдер" value={summary.data?.provider ?? "LOCAL"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Семантический поиск</CardTitle>
          <CardDescription>
            Ищи не только по словам, а по смысловой близости материала.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={onSubmit} className="flex gap-2">
            <input
              className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Например: риск, переговоры, отношения, ошибка"
            />
            <Button type="submit">Искать</Button>
            <Button type="button" variant="secondary" onClick={() => reindex.mutate()}>
              Переиндексировать
            </Button>
          </form>

          <div className="space-y-2">
            {(results.data ?? []).map((item) => (
              <div key={item.memory.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-medium">{item.memory.title ?? "Воспоминание без названия"}</p>
                  <span className="text-xs text-muted-foreground">{item.score.toFixed(3)}</span>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {item.memory.summary}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
