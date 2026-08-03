"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type ResearchItem = {
  id: string;
  source: string;
  type: string;
  title: string;
  summary: string | null;
  relevance: number;
  tags: string[];
};

export function ResearchPanel() {
  const queryClient = useQueryClient();
  const research = useQuery({
    queryKey: ["research-items"],
    queryFn: () => apiFetch<ResearchItem[]>("/api/research"),
    retry: false
  });
  const scan = useMutation({
    mutationFn: () => apiFetch<ResearchItem[]>("/api/research/scan", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["research-items"] })
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Этап 22</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">AI-исследования</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Поиск трендов, анализ конкурентов, подсказки тем и форматов. Внешние источники
            подключаются через социальные интеграции; локальное сканирование использует Memory и
            Persona DNA.
          </p>
        </div>
        <Button onClick={() => scan.mutate()}>Запустить локальный анализ</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {(research.data ?? []).map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardDescription>
                {item.source} · {item.type} · релевантность {item.relevance.toFixed(2)}
              </CardDescription>
              <CardTitle>{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{item.summary}</p>
              <div className="flex flex-wrap gap-2">
                {item.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-secondary px-2 py-1 text-xs">
                    {tag}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!research.data?.length ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Исследований пока нет. Запусти локальный анализ, чтобы получить первые подсказки из
            памяти.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
