"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  Archive,
  Camera,
  FileVideo,
  LinkIcon,
  MapPin,
  Mic,
  PenLine,
  RotateCcw,
  Search,
  Star,
  Trash2
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";

type Capture = {
  id: string;
  createdAt: string;
  sourceType: string;
  title: string | null;
  description: string | null;
  transcript: string | null;
  media: { dataUrl?: string; type?: string; url?: string } | null;
  tags: string[];
  status: string;
  emotion: string;
  importance: string;
  isFavorite: boolean;
};

type CaptureResponse = {
  items: Capture[];
  total: number;
  hasMore: boolean;
};

const iconMap = {
  PHOTO: Camera,
  VIDEO: FileVideo,
  VOICE: Mic,
  TEXT: PenLine,
  LINK: LinkIcon,
  LOCATION: MapPin,
  MIXED: PenLine
};

export function CaptureInbox({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(compact ? "NEW" : "");
  const [favorite, setFavorite] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: "1", pageSize: compact ? "5" : "30" });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (favorite) params.set("favorite", "true");
    return params.toString();
  }, [compact, favorite, search, status]);

  const captures = useQuery({
    queryKey: ["captures", queryString],
    queryFn: () => apiFetch<CaptureResponse>(`/api/captures?${queryString}`),
    retry: false
  });

  const mutate = useMutation({
    mutationFn: ({
      id,
      action
    }: {
      id: string;
      action: "favorite" | "archive" | "restore" | "delete";
    }) => {
      if (action === "delete") {
        return apiFetch(`/api/captures/${id}`, { method: "DELETE" });
      }
      return apiFetch(`/api/captures/${id}/${action}`, { method: "PATCH" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["captures"] })
  });

  const items = captures.data?.items ?? [];

  return (
    <div className="space-y-4">
      {!compact ? (
        <div className="flex flex-col gap-3 md:flex-row">
          <label className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <input
              className="h-11 w-full rounded-md border bg-background pl-9 pr-3 outline-none focus:ring-2 focus:ring-ring"
              placeholder="Поиск по Capture..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            className="h-11 rounded-md border bg-background px-3"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Все, кроме удаленных</option>
            <option value="NEW">Новые</option>
            <option value="REVIEWED">Просмотренные</option>
            <option value="ARCHIVED">Архив</option>
            <option value="DELETED">Удаленные</option>
          </select>
          <Button
            variant={favorite ? "default" : "outline"}
            onClick={() => setFavorite((value) => !value)}
          >
            <Star className="h-4 w-4" />
            Избранное
          </Button>
        </div>
      ) : null}

      {captures.isLoading ? <p className="text-muted-foreground">Загружаю Capture...</p> : null}
      {captures.error ? (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          Не удалось загрузить входящие Capture.
        </p>
      ) : null}
      {!captures.isLoading && items.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Пока тихо. Первый Capture появится здесь сразу после сохранения.
          </CardContent>
        </Card>
      ) : null}

      <div className={compact ? "grid gap-3" : "grid gap-4 md:grid-cols-2 xl:grid-cols-3"}>
        {items.map((capture) => {
          const Icon = iconMap[capture.sourceType as keyof typeof iconMap] ?? PenLine;
          const preview = capture.media?.dataUrl;
          const text =
            capture.description ||
            capture.transcript ||
            capture.media?.url ||
            "Сырой материал без описания";
          return (
            <Card key={capture.id} className="overflow-hidden">
              {preview && capture.media?.type?.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="h-44 w-full object-cover" src={preview} />
              ) : null}
              {preview && capture.media?.type?.startsWith("video/") ? (
                <video className="h-44 w-full object-cover" src={preview} controls />
              ) : null}
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-secondary p-2">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <Link
                        className="font-medium underline-offset-4 hover:underline"
                        href={`/capture/${capture.id}` as Route}
                      >
                        {capture.title || label(capture.sourceType)}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {new Date(capture.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <button
                    className="p-1"
                    onClick={() => mutate.mutate({ id: capture.id, action: "favorite" })}
                  >
                    <Star className={`h-4 w-4 ${capture.isFavorite ? "fill-current" : ""}`} />
                  </button>
                </div>
                <p className="line-clamp-3 text-sm text-muted-foreground">{text}</p>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-secondary px-2 py-1">
                    {label(capture.status)}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-1">
                    {label(capture.emotion)}
                  </span>
                  <span className="rounded-full bg-secondary px-2 py-1">
                    {label(capture.importance)}
                  </span>
                </div>
                {capture.tags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {capture.tags.map((tag) => (
                      <span key={tag} className="text-xs text-muted-foreground">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {!compact ? (
                  <div className="flex gap-2">
                    {capture.status === "ARCHIVED" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => mutate.mutate({ id: capture.id, action: "restore" })}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Вернуть
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => mutate.mutate({ id: capture.id, action: "archive" })}
                      >
                        <Archive className="h-4 w-4" />В архив
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => mutate.mutate({ id: capture.id, action: "delete" })}
                    >
                      <Trash2 className="h-4 w-4" />
                      Удалить
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
