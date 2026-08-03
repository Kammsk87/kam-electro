"use client";

import Link from "next/link";
import type { Route } from "next";
import { FormEvent, useState } from "react";
import { ArrowLeft, Link2, Save, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";
import {
  memoryImportanceValues,
  memoryRelationValues,
  type MemoryImportance,
  type MemoryItem,
  type MemoryRelation
} from "./memory-types";

export function MemoryDetail({ memoryId }: { memoryId: string }) {
  const queryClient = useQueryClient();
  const memory = useQuery({
    queryKey: ["memory-item", memoryId],
    queryFn: () => apiFetch<MemoryItem>(`/api/memory/${memoryId}`),
    retry: false
  });
  const allMemories = useQuery({
    queryKey: ["memory", "all"],
    queryFn: () => apiFetch<MemoryItem[]>("/api/memory"),
    retry: false
  });

  if (memory.isLoading) return <p className="text-muted-foreground">Открываю память...</p>;
  if (!memory.data)
    return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Memory не найдена.</p>;

  return (
    <MemoryDetailForm
      key={memory.data.updatedAt}
      initialMemory={memory.data}
      allMemories={(allMemories.data ?? []).filter((item) => item.id !== memoryId)}
      onSaved={() => queryClient.invalidateQueries({ queryKey: ["memory-item", memoryId] })}
    />
  );
}

function MemoryDetailForm({
  initialMemory,
  allMemories,
  onSaved
}: {
  initialMemory: MemoryItem;
  allMemories: MemoryItem[];
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initialMemory);
  const [linkTarget, setLinkTarget] = useState(allMemories[0]?.id ?? "");
  const [relation, setRelation] = useState<MemoryRelation>("RELATED");

  const updateMemory = useMutation({
    mutationFn: () =>
      apiFetch<MemoryItem>(`/api/memory/${initialMemory.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          summary: form.summary,
          tags: form.tags,
          importance: form.importance
        })
      }),
    onSuccess: onSaved
  });

  const createLink = useMutation({
    mutationFn: () =>
      apiFetch("/api/memory/link", {
        method: "POST",
        body: JSON.stringify({
          fromMemoryId: initialMemory.id,
          toMemoryId: linkTarget,
          relation
        })
      }),
    onSuccess: onSaved
  });

  const deleteLink = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/memory/link/${id}`, { method: "DELETE" }),
    onSuccess: onSaved
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateMemory.mutate();
  }

  const links = [
    ...(form.linksFrom ?? []).map((link) => ({
      id: link.id,
      relation: link.relation,
      item: link.toMemory
    })),
    ...(form.linksTo ?? []).map((link) => ({
      id: link.id,
      relation: link.relation,
      item: link.fromMemory
    }))
  ];

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href={"/memory" as Route}>
              <ArrowLeft className="h-4 w-4" />
              Назад к памяти
            </Link>
          </Button>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            {label(form.sourceType)} · {form.sourceId}
          </p>
          <input
            className="mt-2 w-full border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight outline-none"
            value={form.title ?? ""}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          />
        </div>
        <Button type="submit" disabled={updateMemory.isPending}>
          <Save className="h-4 w-4" />
          Сохранить
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <main className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Описание</CardTitle>
              <CardDescription>Только сохранённый опыт. Никаких AI-догадок.</CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                className="min-h-[420px] w-full rounded-md border bg-background p-4 leading-7"
                value={form.summary ?? ""}
                onChange={(event) =>
                  setForm((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Свойства</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={form.importance}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    importance: event.target.value as MemoryImportance
                  }))
                }
              >
                {memoryImportanceValues.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
              <textarea
                className="min-h-24 w-full rounded-md border bg-background p-3"
                value={form.tags.join(", ")}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    tags: event.target.value
                      .split(",")
                      .map((tag) => tag.trim())
                      .filter(Boolean)
                  }))
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Связанные воспоминания</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{link.item.title || "Воспоминание без названия"}</p>
                    <p className="text-muted-foreground">{label(link.relation)}</p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteLink.mutate(link.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {allMemories.length ? (
                <div className="space-y-2 border-t pt-3">
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={linkTarget}
                    onChange={(event) => setLinkTarget(event.target.value)}
                  >
                    {allMemories.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title || item.id}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-10 w-full rounded-md border bg-background px-3"
                    value={relation}
                    onChange={(event) => setRelation(event.target.value as MemoryRelation)}
                  >
                    {memoryRelationValues.map((item) => (
                      <option key={item} value={item}>
                        {label(item)}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => createLink.mutate()}
                    disabled={!linkTarget}
                  >
                    <Link2 className="h-4 w-4" />
                    Создать связь
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Таймлайн</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Создано: {new Date(form.createdAt).toLocaleString()}</p>
              <p>Обновлено: {new Date(form.updatedAt).toLocaleString()}</p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </form>
  );
}
