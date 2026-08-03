"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { label } from "@/lib/labels";

type Capture = {
  id: string;
  sourceType: string;
  title: string | null;
  description: string | null;
  transcript: string | null;
  media: { dataUrl?: string; type?: string; url?: string } | null;
  tags: string[];
  emotion: string;
  importance: string;
  createdAt: string;
};

type Interview = {
  id: string;
};

export function CaptureDetail({ captureId }: { captureId: string }) {
  const router = useRouter();
  const capture = useQuery({
    queryKey: ["capture", captureId],
    queryFn: () => apiFetch<Capture>(`/api/captures/${captureId}`),
    retry: false
  });

  const startInterview = useMutation({
    mutationFn: () =>
      apiFetch<Interview>("/api/interviews", {
        method: "POST",
        body: JSON.stringify({ captureId })
      }),
    onSuccess: (interview) => router.push(`/interviews/${interview.id}` as Route)
  });

  if (capture.isLoading) {
    return <p className="text-muted-foreground">Открываю Capture...</p>;
  }

  if (!capture.data) {
    return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Capture не найден.</p>;
  }

  const item = capture.data;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card>
        {item.media?.dataUrl && item.media.type?.startsWith("image/") ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="max-h-[520px] w-full object-cover" src={item.media.dataUrl} />
        ) : null}
        {item.media?.dataUrl && item.media.type?.startsWith("video/") ? (
          <video className="max-h-[520px] w-full object-cover" src={item.media.dataUrl} controls />
        ) : null}
        <CardHeader>
          <CardTitle>{item.title || label(item.sourceType)}</CardTitle>
          <CardDescription>{new Date(item.createdAt).toLocaleString()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap text-muted-foreground">
            {item.description ||
              item.transcript ||
              item.media?.url ||
              "Сырой Capture без описания."}
          </p>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="rounded-full bg-secondary px-3 py-1">{label(item.sourceType)}</span>
            <span className="rounded-full bg-secondary px-3 py-1">{label(item.emotion)}</span>
            <span className="rounded-full bg-secondary px-3 py-1">{label(item.importance)}</span>
            {item.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-secondary px-3 py-1">
                #{tag}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <aside>
        <Card>
          <CardHeader>
            <CardTitle>Следующий шаг</CardTitle>
            <CardDescription>
              Интервью превращает факт в смысл. Пока без AI и без постов.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => startInterview.mutate()}
              disabled={startInterview.isPending}
            >
              <MessageCircle className="h-4 w-4" />
              {startInterview.isPending ? "Открываю..." : "Исследовать эту мысль"}
            </Button>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
