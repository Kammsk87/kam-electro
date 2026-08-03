"use client";

import Link from "next/link";
import type { Route } from "next";
import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, History, RotateCcw, RotateCw, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";
import {
  draftPlatforms,
  getDraftMetrics,
  type Draft,
  type DraftPlatform,
  type DraftStatus
} from "./draft-types";

const rewriteActions = [
  { mode: "rewrite", label: "Переписать" },
  { mode: "shorter", label: "Короче" },
  { mode: "longer", label: "Длиннее" },
  { mode: "more-personal", label: "Личнее" },
  { mode: "more-practical", label: "Практичнее" },
  { mode: "more-sarcastic", label: "Саркастичнее" },
  { mode: "simplify", label: "Проще" }
] as const;

export function DraftEditor({ draftId }: { draftId: string }) {
  const queryClient = useQueryClient();
  const draft = useQuery({
    queryKey: ["draft", draftId],
    queryFn: () => apiFetch<Draft>(`/api/drafts/${draftId}`),
    retry: false
  });

  if (draft.isLoading) {
    return <p className="text-muted-foreground">Открываю draft...</p>;
  }

  if (!draft.data) {
    return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Draft не найден.</p>;
  }

  return (
    <DraftEditorForm
      key={draft.data.updatedAt}
      initialDraft={draft.data}
      onSaved={() => queryClient.invalidateQueries({ queryKey: ["draft", draftId] })}
    />
  );
}

function DraftEditorForm({ initialDraft, onSaved }: { initialDraft: Draft; onSaved: () => void }) {
  const [form, setForm] = useState(initialDraft);
  const [past, setPast] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const metrics = useMemo(() => getDraftMetrics(form.content), [form.content]);

  const updateDraft = useMutation({
    mutationFn: () =>
      apiFetch<Draft>(`/api/drafts/${initialDraft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          content: form.content,
          platform: form.platform,
          status: form.status
        })
      }),
    onSuccess: onSaved
  });

  const rewriteDraft = useMutation({
    mutationFn: (mode: string) =>
      apiFetch<Draft>(`/api/drafts/${initialDraft.id}/rewrite`, {
        method: "POST",
        body: JSON.stringify({ mode })
      }),
    onSuccess: (draft) => {
      setPast((current) => [...current, form.content]);
      setFuture([]);
      setForm((current) => ({ ...current, content: draft.content, updatedAt: draft.updatedAt }));
      onSaved();
    }
  });

  const createPublication = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>(`/api/publications/from-draft/${initialDraft.id}`, {
        method: "POST",
        body: JSON.stringify({ platform: form.platform })
      }),
    onSuccess: (publication) => window.location.assign(`/publication/${publication.id}`)
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateDraft.mutate();
  }

  function setContent(content: string) {
    setPast((current) => [...current, form.content]);
    setFuture([]);
    setForm((current) => ({ ...current, content }));
  }

  function undo() {
    const previous = past.at(-1);
    if (!previous) return;
    setPast((current) => current.slice(0, -1));
    setFuture((current) => [form.content, ...current]);
    setForm((current) => ({ ...current, content: previous }));
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((current) => current.slice(1));
    setPast((current) => [...current, form.content]);
    setForm((current) => ({ ...current, content: next }));
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href={"/drafts" as Route}>
              <ArrowLeft className="h-4 w-4" />
              Назад к черновикам
            </Link>
          </Button>
          <p className="mt-3 text-sm font-medium text-muted-foreground">Writing Engine</p>
          <input
            className="mt-2 w-full border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight outline-none"
            value={form.title ?? ""}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Название черновика"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={form.platform}
            onChange={(event) =>
              setForm((current) => ({ ...current, platform: event.target.value as DraftPlatform }))
            }
          >
            {draftPlatforms.map((platform) => (
              <option key={platform} value={platform}>
                {label(platform)}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({ ...current, status: event.target.value as DraftStatus }))
            }
          >
            <option value="DRAFT">Черновик</option>
            <option value="READY">Готово</option>
            <option value="PUBLISHED">Опубликовано</option>
            <option value="ARCHIVED">В архиве</option>
          </select>
          <Button type="submit" disabled={updateDraft.isPending}>
            <Save className="h-4 w-4" />
            Сохранить
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <main className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Текст</CardTitle>
              <CardDescription>
                AI может улучшать форму, но не смысл. Редактор остается за автором.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <textarea
                className="min-h-[520px] w-full rounded-md border bg-background p-4 text-base leading-7 outline-none focus:ring-2 focus:ring-ring"
                value={form.content}
                onChange={(event) => setContent(event.target.value)}
              />
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Метрики</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-3 text-sm lg:grid-cols-1">
              <Metric label="Слова" value={metrics.words} />
              <Metric label="Символы" value={metrics.characters} />
              <Metric label="Время чтения" value={`${metrics.estimatedReadTime} мин`} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Переписать</CardTitle>
              <CardDescription>Все режимы обязаны сохранять факты Story.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {rewriteActions.map((action) => (
                <Button
                  key={action.mode}
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => rewriteDraft.mutate(action.mode)}
                  disabled={rewriteDraft.isPending}
                >
                  {action.label}
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Локальная история</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={!past.length}
              >
                <RotateCcw className="h-4 w-4" />
                Назад
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={redo}
                disabled={!future.length}
              >
                <RotateCw className="h-4 w-4" />
                Вперед
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowHistory((value) => !value)}
              >
                <History className="h-4 w-4" />
                История версий
              </Button>
            </CardContent>
          </Card>

          {showHistory ? (
            <Card>
              <CardHeader>
                <CardTitle>История версий</CardTitle>
                <CardDescription>Сохраненные версии черновика.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {(initialDraft.versions ?? []).map((version) => (
                  <button
                    key={version.id}
                    type="button"
                    className="w-full rounded-md border p-3 text-left text-sm"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        title: version.title,
                        content: version.content
                      }))
                    }
                  >
                    <p className="font-medium">{version.reason || "Версия"}</p>
                    <p className="text-muted-foreground">
                      {new Date(version.createdAt).toLocaleString()}
                    </p>
                  </button>
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Создать публикацию</CardTitle>
              <CardDescription>
                Создать ручную карточку публикации без отправки в соцсети.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                type="button"
                className="w-full"
                onClick={() => createPublication.mutate()}
                disabled={createPublication.isPending}
              >
                Создать публикацию
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </form>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  );
}
