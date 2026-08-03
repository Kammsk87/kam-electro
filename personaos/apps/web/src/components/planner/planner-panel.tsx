"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Plus, SkipForward } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";
import { plannerCategories, type PlannerTaskCategory, type TodayPlan } from "./planner-types";

export function PlannerPanel() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<PlannerTaskCategory>("CAPTURE");
  const plan = useQuery({
    queryKey: ["planner-today"],
    queryFn: () => apiFetch<TodayPlan>("/api/planner/today"),
    retry: false
  });

  const complete = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/planner/tasks/${id}/complete`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planner-today"] })
  });
  const skip = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/planner/tasks/${id}/skip`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["planner-today"] })
  });
  const createTask = useMutation({
    mutationFn: () =>
      apiFetch("/api/planner/tasks", {
        method: "POST",
        body: JSON.stringify({ title, category })
      }),
    onSuccess: async () => {
      setTitle("");
      await queryClient.invalidateQueries({ queryKey: ["planner-today"] });
    }
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;
    createTask.mutate();
  }

  const data = plan.data;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Планер</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Сегодня</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Рабочий ежедневный план без AI. PersonaOS поднимает базовые задачи по текущему состоянию
          продукта.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <main className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Задачи на день</CardTitle>
              <CardDescription>
                Напоминания для Capture, рефлексий, историй и публикаций.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.tasks ?? []).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-4"
                >
                  <div>
                    <p className="font-medium">{task.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {label(task.category)} · {label(task.priority)} · {label(task.status)}
                    </p>
                    {task.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => complete.mutate(task.id)}
                      disabled={task.status === "DONE"}
                      title="Отметить выполненной"
                      aria-label="Отметить выполненной"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => skip.mutate(task.id)}
                      disabled={task.status !== "TODO"}
                      title="Пропустить"
                      aria-label="Пропустить"
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Добавить задачу</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-3 md:flex-row" onSubmit={submit}>
                <input
                  className="h-10 flex-1 rounded-md border bg-background px-3"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Название задачи"
                />
                <select
                  className="h-10 rounded-md border bg-background px-3"
                  value={category}
                  onChange={(event) => setCategory(event.target.value as PlannerTaskCategory)}
                >
                  {plannerCategories.map((item) => (
                    <option key={item} value={item}>
                      {label(item)}
                    </option>
                  ))}
                </select>
                <Button type="submit">
                  <Plus className="h-4 w-4" />
                  Добавить
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Серия</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Текущая" value={data?.streak.current ?? 0} />
              <Metric label="Лучшая" value={data?.streak.longest ?? 0} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Цели недели</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.weeklyGoals ?? []).map((goal) => (
                <div key={goal.id} className="rounded-md border p-3 text-sm">
                  <p className="font-medium">{goal.title}</p>
                  <p className="text-muted-foreground">
                    {goal.completedCount}/{goal.targetCount} выполнено
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>История выполнения</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.completionHistory ?? []).map((item) => (
                <div key={item.id} className="rounded-md border p-2 text-sm">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-muted-foreground">
                    {new Date(item.completedAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}
