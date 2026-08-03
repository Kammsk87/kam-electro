"use client";

import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";

type Readiness = {
  workspace: string;
  checks: Record<string, string | number>;
  counters: Record<string, number>;
};

type Feedback = {
  id: string;
  title: string;
  message: string;
  status: string;
};

type FeatureFlag = {
  id: string;
  key: string;
  enabled: boolean;
  description: string | null;
};

export function BetaPanel() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const readiness = useQuery({
    queryKey: ["beta-readiness"],
    queryFn: () => apiFetch<Readiness>("/api/beta/readiness"),
    retry: false
  });
  const flags = useQuery({
    queryKey: ["beta-flags"],
    queryFn: () => apiFetch<FeatureFlag[]>("/api/beta/feature-flags"),
    retry: false
  });
  const feedback = useQuery({
    queryKey: ["beta-feedback"],
    queryFn: () => apiFetch<Feedback[]>("/api/beta/feedback"),
    retry: false
  });
  const submitFeedback = useMutation({
    mutationFn: () =>
      apiFetch("/api/beta/feedback", {
        method: "POST",
        body: JSON.stringify({ title, message })
      }),
    onSuccess: () => {
      setTitle("");
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["beta-feedback"] });
      queryClient.invalidateQueries({ queryKey: ["beta-readiness"] });
    }
  });
  const createExport = useMutation({
    mutationFn: () => apiFetch("/api/beta/exports", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["beta-readiness"] })
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim() && message.trim()) submitFeedback.mutate();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Этап 24</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Бета-центр</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Готовность, обратная связь, feature flags, экспорт и release discipline для закрытой beta.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {Object.entries(readiness.data?.counters ?? {}).map(([key, value]) => (
          <Card key={key}>
            <CardHeader className="pb-2">
              <CardDescription>{key}</CardDescription>
              <CardTitle>{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Проверки готовности</CardTitle>
          <CardDescription>{readiness.data?.workspace ?? "Workspace"}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {Object.entries(readiness.data?.checks ?? {}).map(([key, value]) => (
            <div key={key} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{key}</p>
              <p className="text-muted-foreground">{String(value)}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Обратная связь</CardTitle>
            <CardDescription>Сигналы beta-пользователей без внешнего сервиса.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={onSubmit} className="space-y-2">
              <input
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Короткий заголовок"
              />
              <textarea
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Что случилось или чего не хватает?"
              />
              <Button type="submit">Отправить отзыв</Button>
            </form>
            {(feedback.data ?? []).map((item) => (
              <div key={item.id} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{item.title}</p>
                <p className="text-muted-foreground">{item.message}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Feature flags и экспорт</CardTitle>
            <CardDescription>Beta-переключатели и подготовка data portability.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={() => createExport.mutate()}>Создать задачу экспорта</Button>
            <div className="space-y-2">
              {(flags.data ?? []).map((flag) => (
                <div
                  key={flag.id}
                  className="flex items-center justify-between rounded-md border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{flag.key}</p>
                    <p className="text-muted-foreground">{flag.description}</p>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-1 text-xs">
                    {flag.enabled ? "вкл" : "выкл"}
                  </span>
                </div>
              ))}
              {!flags.data?.length ? (
                <p className="text-sm text-muted-foreground">Feature flags пока не созданы.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
