"use client";

import Link from "next/link";
import type { Route } from "next";
import { FormEvent, useMemo, useState } from "react";
import { ArrowLeft, GripVertical, Save, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { draftPlatforms, type DraftPlatform } from "@/components/drafts/draft-types";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";
import { storyBlocks, type Story, type StoryBlockKey, type StoryStatus } from "./story-types";

export function StoryEditor({ storyId }: { storyId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const story = useQuery({
    queryKey: ["story", storyId],
    queryFn: () => apiFetch<Story>(`/api/stories/${storyId}`),
    retry: false
  });

  if (story.isLoading) {
    return <p className="text-muted-foreground">Открываю Story Draft...</p>;
  }

  if (!story.data) {
    return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Story не найдена.</p>;
  }

  return (
    <StoryEditorForm
      key={story.data.updatedAt}
      initialStory={story.data}
      onSaved={() => queryClient.invalidateQueries({ queryKey: ["story", storyId] })}
      onDeleted={() => router.push("/stories" as Route)}
    />
  );
}

function StoryEditorForm({
  initialStory,
  onSaved,
  onDeleted
}: {
  initialStory: Story;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = useState(initialStory);
  const [order, setOrder] = useState<StoryBlockKey[]>(storyBlocks.map((block) => block.key));
  const [dragging, setDragging] = useState<StoryBlockKey | null>(null);

  const updateStory = useMutation({
    mutationFn: () =>
      apiFetch<Story>(`/api/stories/${initialStory.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: form.title,
          hook: form.hook,
          context: form.context,
          conflict: form.conflict,
          insight: form.insight,
          takeaway: form.takeaway,
          status: form.status
        })
      }),
    onSuccess: onSaved
  });

  const deleteStory = useMutation({
    mutationFn: () => apiFetch(`/api/stories/${initialStory.id}`, { method: "DELETE" }),
    onSuccess: onDeleted
  });

  const createDraft = useMutation({
    mutationFn: (platform: DraftPlatform) =>
      apiFetch<{ id: string }>(`/api/drafts/from-story/${initialStory.id}`, {
        method: "POST",
        body: JSON.stringify({ platform })
      }),
    onSuccess: (draft) => window.location.assign(`/draft/${draft.id}`)
  });

  const orderedBlocks = useMemo(
    () => order.map((key) => storyBlocks.find((block) => block.key === key)).filter(Boolean),
    [order]
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateStory.mutate();
  }

  function moveBlock(target: StoryBlockKey) {
    if (!dragging || dragging === target) return;
    setOrder((current) => {
      const next = current.filter((key) => key !== dragging);
      next.splice(next.indexOf(target), 0, dragging);
      return next;
    });
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href={"/stories" as Route}>
              <ArrowLeft className="h-4 w-4" />
              Назад к историям
            </Link>
          </Button>
          <p className="mt-3 text-sm font-medium text-muted-foreground">Story Draft</p>
          <input
            className="mt-2 w-full border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight outline-none"
            value={form.title ?? ""}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="Название истории"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({ ...current, status: event.target.value as StoryStatus }))
            }
          >
            <option value="DRAFT">Черновик</option>
            <option value="READY">Готово</option>
            <option value="ARCHIVED">В архиве</option>
          </select>
          <Button type="submit" disabled={updateStory.isPending}>
            <Save className="h-4 w-4" />
            Сохранить
          </Button>
          <Button type="button" variant="ghost" onClick={() => deleteStory.mutate()}>
            <Trash2 className="h-4 w-4" />
            Удалить
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {orderedBlocks.map((block) =>
            block ? (
              <Card
                key={block.key}
                draggable
                onDragStart={() => setDragging(block.key)}
                onDragOver={(event) => {
                  event.preventDefault();
                  moveBlock(block.key);
                }}
                onDragEnd={() => setDragging(null)}
                className={dragging === block.key ? "opacity-60" : undefined}
              >
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    {block.label}
                  </CardTitle>
                  <CardDescription>{block.helper}</CardDescription>
                </CardHeader>
                <CardContent>
                  <textarea
                    className="min-h-36 w-full rounded-md border bg-background p-4 outline-none focus:ring-2 focus:ring-ring"
                    value={form[block.key] ?? ""}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [block.key]: event.target.value }))
                    }
                  />
                </CardContent>
              </Card>
            ) : null
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Источник Reflection</CardTitle>
              <CardDescription>Story собрана из ответов, без LLM и генерации.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="font-medium">
                {initialStory.reflection?.capture?.title ||
                  initialStory.reflection?.capture?.sourceType}
              </p>
              <p className="text-muted-foreground">
                {initialStory.reflection?.capture?.description || "Описание Capture пустое."}
              </p>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/interviews/${initialStory.reflectionId}` as Route}>
                  Открыть Reflection
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Порядок блоков</CardTitle>
              <CardDescription>
                Перетаскивай блоки слева. Порядок помогает думать, но текст не переписывается
                системой.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.map((key, index) => (
                <div key={key} className="flex justify-between rounded-md bg-secondary px-3 py-2">
                  <span>{storyBlocks.find((block) => block.key === key)?.label}</span>
                  <span className="text-muted-foreground">{index + 1}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Создать Draft</CardTitle>
              <CardDescription>
                Writing Engine использует только Story-блоки и платформенный prompt.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {draftPlatforms.map((platform) => (
                <Button
                  key={platform}
                  type="button"
                  variant="secondary"
                  onClick={() => createDraft.mutate(platform)}
                  disabled={createDraft.isPending}
                >
                  Создать Draft для {label(platform)}
                </Button>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </form>
  );
}
