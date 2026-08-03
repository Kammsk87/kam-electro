"use client";

import Link from "next/link";
import type { Route } from "next";
import { Archive, FileText } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";
import type { Story } from "./story-types";

export function StoryList() {
  const queryClient = useQueryClient();
  const stories = useQuery({
    queryKey: ["stories"],
    queryFn: () => apiFetch<Story[]>("/api/stories"),
    retry: false
  });

  const archiveStory = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/stories/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ARCHIVED" })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["stories"] })
  });

  if (stories.isLoading) {
    return <p className="text-muted-foreground">Собираю истории из Reflection...</p>;
  }

  const data = stories.data ?? [];
  const visibleStories = data.filter((story) => story.status !== "ARCHIVED");

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Story Engine</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Истории из Reflection</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Здесь нет AI и генерации текста. PersonaOS только раскладывает реальные ответы автора на
            структуру: зацепка, контекст, конфликт, инсайт, вывод.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={"/dashboard" as Route}>Назад в Dashboard</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibleStories.map((story) => (
          <Card key={story.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="line-clamp-2">{story.title || "Новая история"}</CardTitle>
              <CardDescription>
                {label(story.status)} ·{" "}
                {label(story.reflection?.capture?.sourceType ?? "REFLECTION")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between gap-4">
              <p className="line-clamp-4 text-sm text-muted-foreground">
                {story.hook || story.context || "Story Draft пока пустой."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link href={`/story/${story.id}` as Route}>
                    <FileText className="h-4 w-4" />
                    Открыть
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => archiveStory.mutate(story.id)}>
                  <Archive className="h-4 w-4" />В архив
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!visibleStories.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Пока нет Story Draft</CardTitle>
            <CardDescription>
              Заверши Reflection и нажми “Перейти к Story Engine”, чтобы собрать первую историю.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
