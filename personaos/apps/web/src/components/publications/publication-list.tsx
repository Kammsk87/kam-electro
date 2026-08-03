"use client";

import Link from "next/link";
import type { Route } from "next";
import { CalendarCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";
import {
  publicationPlatforms,
  publicationStatuses,
  type Publication,
  type PublicationPlatform,
  type PublicationStatus
} from "./publication-types";

export function PublicationList() {
  const [platform, setPlatform] = useState<PublicationPlatform | "ALL">("ALL");
  const [status, setStatus] = useState<PublicationStatus | "ALL">("ALL");
  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (platform !== "ALL") params.set("platform", platform);
    if (status !== "ALL") params.set("status", status);
    return params.toString();
  }, [platform, status]);

  const publications = useQuery({
    queryKey: ["publications", query],
    queryFn: () => apiFetch<Publication[]>(`/api/publications${query ? `?${query}` : ""}`),
    retry: false
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Публикационный слой</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Публикации</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Здесь нет автопубликации и подключений к соцсетям. Это ручной слой подготовки,
          планирования и фиксации опубликованных материалов.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 pt-6">
          <select
            className="h-10 rounded-md border bg-background px-3"
            value={platform}
            onChange={(event) => setPlatform(event.target.value as PublicationPlatform | "ALL")}
          >
            <option value="ALL">Все площадки</option>
            {publicationPlatforms.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border bg-background px-3"
            value={status}
            onChange={(event) => setStatus(event.target.value as PublicationStatus | "ALL")}
          >
            <option value="ALL">Все статусы</option>
            {publicationStatuses.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(publications.data ?? []).map((publication) => (
          <Card key={publication.id}>
            <CardHeader>
              <CardTitle className="line-clamp-2">
                {publication.draft?.title || "Публикация без названия"}
              </CardTitle>
              <CardDescription>
                {label(publication.platform)} · {label(publication.status)}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {publication.notes || publication.draft?.content || "Заметки пустые."}
              </p>
              <div className="text-sm text-muted-foreground">
                {publication.scheduledAt
                  ? `Запланировано: ${new Date(publication.scheduledAt).toLocaleString()}`
                  : "Не запланировано"}
              </div>
              <Button asChild size="sm">
                <Link href={`/publication/${publication.id}` as Route}>
                  <CalendarCheck className="h-4 w-4" />
                  Открыть
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {!publications.isLoading && !(publications.data ?? []).length ? (
        <Card>
          <CardHeader>
            <CardTitle>Публикаций пока нет</CardTitle>
            <CardDescription>Открой Draft и создай публикацию для нужной площадки.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </div>
  );
}
