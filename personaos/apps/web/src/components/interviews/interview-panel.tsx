"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Pause, Play, Save, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import {
  getQueuedInterviewCount,
  readInterviewDraft,
  saveInterviewDraft,
  sendInterviewAnswerOfflineFirst,
  syncQueuedInterviewAnswers
} from "@/lib/interview-offline";
import { label } from "@/lib/labels";

type InterviewMessage = {
  id: string;
  role: "ASSISTANT" | "USER" | "SYSTEM";
  content: string;
  createdAt: string;
};

type Capture = {
  id: string;
  sourceType: string;
  title: string | null;
  description: string | null;
  transcript: string | null;
  media: { dataUrl?: string; type?: string; url?: string } | null;
  emotion: string;
  importance: string;
};

type Interview = {
  id: string;
  status: "NEW" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  currentStep: number;
  summary: string | null;
  capture: Capture;
  messages: InterviewMessage[];
};

export function InterviewPanel({ interviewId }: { interviewId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState(() =>
    typeof window === "undefined" ? "" : readInterviewDraft(interviewId)
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [queuedCount, setQueuedCount] = useState(() =>
    typeof window === "undefined" ? 0 : getQueuedInterviewCount(interviewId)
  );

  const interview = useQuery({
    queryKey: ["interview", interviewId],
    queryFn: () => apiFetch<Interview>(`/api/interviews/${interviewId}`),
    retry: false
  });

  const data = interview.data;
  const latestAssistantQuestion = useMemo(
    () => [...(data?.messages ?? [])].reverse().find((message) => message.role === "ASSISTANT"),
    [data?.messages]
  );

  useEffect(() => {
    saveInterviewDraft(interviewId, answer);
  }, [answer, interviewId]);

  useEffect(() => {
    async function sync() {
      const result = await syncQueuedInterviewAnswers(interviewId);
      setQueuedCount(result.remaining);
      if (result.synced > 0) {
        setNotice(`Синхронизировано ответов: ${result.synced}`);
        await queryClient.invalidateQueries({ queryKey: ["interview", interviewId] });
      }
    }
    const updateQueue = () => setQueuedCount(getQueuedInterviewCount(interviewId));
    window.addEventListener("online", sync);
    window.addEventListener("personaos:interview-queue-changed", updateQueue);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("personaos:interview-queue-changed", updateQueue);
    };
  }, [interviewId, queryClient]);

  const action = useMutation({
    mutationFn: ({ endpoint, method = "POST" }: { endpoint: string; method?: string }) =>
      apiFetch(`/api/interviews/${interviewId}/${endpoint}`, { method }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interview", interviewId] })
  });

  const editMessage = useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      apiFetch(`/api/interviews/${interviewId}/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ content })
      }),
    onSuccess: () => {
      setEditingMessageId(null);
      setEditValue("");
      return queryClient.invalidateQueries({ queryKey: ["interview", interviewId] });
    }
  });

  const deleteMessage = useMutation({
    mutationFn: (messageId: string) =>
      apiFetch(`/api/interviews/${interviewId}/messages/${messageId}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["interview", interviewId] })
  });

  const createStory = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string }>(`/api/stories/from-reflection/${interviewId}`, {
        method: "POST"
      }),
    onSuccess: (story) => router.push(`/story/${story.id}` as Route)
  });

  async function submitAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!answer.trim()) return;
    const result = await sendInterviewAnswerOfflineFirst(interviewId, answer.trim());
    setAnswer("");
    setQueuedCount(getQueuedInterviewCount(interviewId));
    setNotice(
      result.queued ? "Ответ сохранен offline. Продолжим синхронизацию позже." : "Ответ сохранен."
    );
    if (!result.queued) {
      await queryClient.invalidateQueries({ queryKey: ["interview", interviewId] });
    }
  }

  if (interview.isLoading) {
    return <p className="text-muted-foreground">Открываю интервью...</p>;
  }

  if (!data) {
    return <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Интервью не найдено.</p>;
  }

  const userMessages = data.messages.filter((message) => message.role === "USER");
  const completed = data.status === "COMPLETED";

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <aside className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/capture/${data.capture.id}` as Route}>
            <ArrowLeft className="h-4 w-4" />
            Назад к Capture
          </Link>
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>{data.capture.title || label(data.capture.sourceType)}</CardTitle>
            <CardDescription>Контекст Capture</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.capture.media?.dataUrl && data.capture.media.type?.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt=""
                className="max-h-64 w-full rounded-md object-cover"
                src={data.capture.media.dataUrl}
              />
            ) : null}
            {data.capture.media?.dataUrl && data.capture.media.type?.startsWith("video/") ? (
              <video
                className="max-h-64 w-full rounded-md object-cover"
                src={data.capture.media.dataUrl}
                controls
              />
            ) : null}
            <p className="text-muted-foreground">
              {data.capture.description || data.capture.transcript || "Описание пока пустое."}
            </p>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-secondary px-2 py-1">
                {label(data.capture.emotion)}
              </span>
              <span className="rounded-full bg-secondary px-2 py-1">
                {label(data.capture.importance)}
              </span>
              <span className="rounded-full bg-secondary px-2 py-1">{label(data.status)}</span>
            </div>
          </CardContent>
        </Card>
      </aside>

      <main className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Интервью</CardTitle>
            <CardDescription>
              Один вопрос за раз. Это разговор с редактором, а не анкета.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {completed ? (
              <div className="rounded-lg border bg-secondary/60 p-5">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-5 w-5" />
                  История готова к следующему этапу
                </div>
                <pre className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">
                  {data.summary}
                </pre>
                <Button
                  className="mt-4"
                  onClick={() => createStory.mutate()}
                  disabled={createStory.isPending}
                >
                  Перейти к Story Engine
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-xl border bg-background p-5">
                  <p className="text-sm font-medium text-muted-foreground">PersonaOS спрашивает</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    {latestAssistantQuestion?.content}
                  </h2>
                </div>

                <form className="space-y-3" onSubmit={submitAnswer}>
                  <textarea
                    className="min-h-36 w-full rounded-xl border bg-background p-4 text-base outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Ответь как думаешь. Можно коротко. Можно подробно."
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">
                      Черновик ответа сохраняется автоматически. Offline-очередь: {queuedCount}.
                    </p>
                    <Button type="submit">
                      <Save className="h-4 w-4" />
                      Сохранить ответ
                    </Button>
                  </div>
                </form>
              </>
            )}

            {notice ? <p className="rounded-md bg-secondary p-3 text-sm">{notice}</p> : null}

            <div className="flex flex-wrap gap-2">
              {data.status === "PAUSED" ? (
                <Button variant="secondary" onClick={() => action.mutate({ endpoint: "resume" })}>
                  <Play className="h-4 w-4" />
                  Продолжить
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => action.mutate({ endpoint: "pause" })}
                  disabled={completed}
                >
                  <Pause className="h-4 w-4" />
                  Пауза
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => action.mutate({ endpoint: "complete" })}
                disabled={completed}
              >
                Завершить интервью
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>История сообщений</CardTitle>
            <CardDescription>
              Ответы можно редактировать или удалить. Вопросы остаются как структура разговора.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.messages.map((message) => (
              <div key={message.id} className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label(message.role)}
                  </p>
                  {message.role === "USER" ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingMessageId(message.id);
                          setEditValue(message.content);
                        }}
                      >
                        Редактировать
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteMessage.mutate(message.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                {editingMessageId === message.id ? (
                  <div className="space-y-2">
                    <textarea
                      className="min-h-24 w-full rounded-md border bg-background p-3"
                      value={editValue}
                      onChange={(event) => setEditValue(event.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        editMessage.mutate({ messageId: message.id, content: editValue })
                      }
                    >
                      Сохранить
                    </Button>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                )}
              </div>
            ))}
            {!userMessages.length ? (
              <p className="text-sm text-muted-foreground">Ответов пока нет.</p>
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
