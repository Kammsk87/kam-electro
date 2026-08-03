"use client";

import Link from "next/link";
import type { Route } from "next";
import { FormEvent, useState } from "react";
import { ArrowLeft, CheckCircle2, Save, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";
import {
  fromLocalDateTimeInput,
  publicationPlatforms,
  publicationStatuses,
  toLocalDateTimeInput,
  type Publication,
  type PublicationPlatform,
  type PublicationStatus
} from "./publication-types";

export function PublicationEditor({ publicationId }: { publicationId: string }) {
  const queryClient = useQueryClient();
  const publication = useQuery({
    queryKey: ["publication", publicationId],
    queryFn: () => apiFetch<Publication>(`/api/publications/${publicationId}`),
    retry: false
  });

  if (publication.isLoading) {
    return <p className="text-muted-foreground">Открываю публикацию...</p>;
  }

  if (!publication.data) {
    return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Публикация не найдена.</p>;
  }

  return (
    <PublicationEditorForm
      key={publication.data.updatedAt}
      initialPublication={publication.data}
      onSaved={() => queryClient.invalidateQueries({ queryKey: ["publication", publicationId] })}
    />
  );
}

function PublicationEditorForm({
  initialPublication,
  onSaved
}: {
  initialPublication: Publication;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(initialPublication);
  const [scheduledAt, setScheduledAt] = useState(
    toLocalDateTimeInput(initialPublication.scheduledAt)
  );

  const updatePublication = useMutation({
    mutationFn: () =>
      apiFetch<Publication>(`/api/publications/${initialPublication.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          platform: form.platform,
          status: form.status,
          scheduledAt: fromLocalDateTimeInput(scheduledAt),
          externalUrl: form.externalUrl,
          notes: form.notes
        })
      }),
    onSuccess: onSaved
  });

  const action = useMutation({
    mutationFn: ({ endpoint, body }: { endpoint: string; body?: object }) =>
      apiFetch<Publication>(`/api/publications/${initialPublication.id}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(body ?? {})
      }),
    onSuccess: (publication) => {
      setForm(publication);
      setScheduledAt(toLocalDateTimeInput(publication.scheduledAt));
      onSaved();
    }
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updatePublication.mutate();
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href={"/publishing" as Route}>
              <ArrowLeft className="h-4 w-4" />
              Назад к публикациям
            </Link>
          </Button>
          <p className="mt-3 text-sm font-medium text-muted-foreground">Публикация</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {form.draft?.title || "Публикация без названия"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={updatePublication.isPending}>
            <Save className="h-4 w-4" />
            Сохранить
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => action.mutate({ endpoint: "ready" })}
          >
            Готово
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              action.mutate({
                endpoint: "published",
                body: { externalUrl: form.externalUrl, notes: form.notes }
              })
            }
          >
            <CheckCircle2 className="h-4 w-4" />
            Отметить опубликованной
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => action.mutate({ endpoint: "cancel" })}
          >
            <XCircle className="h-4 w-4" />
            Отменить
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <main className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Текст черновика</CardTitle>
              <CardDescription>
                Текст для ручной публикации. PersonaOS ничего не отправляет автоматически.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap rounded-md border bg-secondary/40 p-4 text-sm leading-6">
                {form.draft?.content}
              </pre>
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Настройки</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={form.platform}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    platform: event.target.value as PublicationPlatform
                  }))
                }
              >
                {publicationPlatforms.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={form.status}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as PublicationStatus
                  }))
                }
              >
                {publicationStatuses.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
              />
              <input
                className="h-10 w-full rounded-md border bg-background px-3"
                placeholder="Ссылка после ручной публикации"
                value={form.externalUrl ?? ""}
                onChange={(event) =>
                  setForm((current) => ({ ...current, externalUrl: event.target.value }))
                }
              />
              <textarea
                className="min-h-32 w-full rounded-md border bg-background p-3"
                placeholder="Заметки"
                value={form.notes ?? ""}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Статус</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Текущий статус: {label(form.status)}</p>
              <p>
                Опубликовано:{" "}
                {form.publishedAt ? new Date(form.publishedAt).toLocaleString() : "пока нет"}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </form>
  );
}
