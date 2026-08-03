"use client";

import Link from "next/link";
import type { Route } from "next";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileVideo, LinkIcon, MapPin, Mic, PenLine, Plus, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CaptureDraft,
  createCaptureOfflineFirst,
  fileToMediaPayload,
  getQueuedCaptureCount,
  readDraft,
  saveDraft,
  syncQueuedCaptures
} from "@/lib/capture-offline";

const sourceOptions = [
  { value: "TEXT", label: "Текст", icon: PenLine },
  { value: "PHOTO", label: "Фото", icon: Camera },
  { value: "VOICE", label: "Голос", icon: Mic },
  { value: "VIDEO", label: "Видео", icon: FileVideo },
  { value: "LINK", label: "Ссылка", icon: LinkIcon },
  { value: "LOCATION", label: "Локация", icon: MapPin }
] as const;

type SourceType = (typeof sourceOptions)[number]["value"];

export function QuickCapture() {
  const initialDraft = typeof window === "undefined" ? null : readDraft();
  const [sourceType, setSourceType] = useState<SourceType>(
    (initialDraft?.sourceType as SourceType) ?? "TEXT"
  );
  const [text, setText] = useState(initialDraft?.description ?? initialDraft?.transcript ?? "");
  const [title, setTitle] = useState(initialDraft?.title ?? "");
  const [link, setLink] = useState("");
  const [tags, setTags] = useState(initialDraft?.tags?.join(", ") ?? "");
  const [emotion, setEmotion] = useState(initialDraft?.emotion ?? "UNKNOWN");
  const [importance, setImportance] = useState(initialDraft?.importance ?? "MEDIUM");
  const [media, setMedia] = useState<unknown>(initialDraft?.media ?? null);
  const [location, setLocation] = useState<unknown>(initialDraft?.location ?? null);
  const [queuedCount, setQueuedCount] = useState(() =>
    typeof window === "undefined" ? 0 : getQueuedCaptureCount()
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const draft: CaptureDraft = useMemo(
    () => ({
      sourceType,
      title: title || undefined,
      description:
        sourceType === "TEXT" || sourceType === "LINK" || sourceType === "LOCATION"
          ? text
          : undefined,
      transcript: sourceType === "VOICE" ? text : undefined,
      media: media || (sourceType === "LINK" && link ? { url: link } : undefined),
      location: location || undefined,
      tags: tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      emotion,
      importance,
      context: {
        capturedFrom: "quick-capture",
        savedAt: new Date().toISOString()
      }
    }),
    [emotion, importance, link, location, media, sourceType, tags, text, title]
  );

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  useEffect(() => {
    const updateQueue = () => setQueuedCount(getQueuedCaptureCount());
    window.addEventListener("online", syncAndNotify);
    window.addEventListener("personaos:capture-queue-changed", updateQueue);
    return () => {
      window.removeEventListener("online", syncAndNotify);
      window.removeEventListener("personaos:capture-queue-changed", updateQueue);
    };
  });

  async function syncAndNotify() {
    const result = await syncQueuedCaptures();
    setQueuedCount(result.remaining);
    if (result.synced > 0) {
      setNotice(`Синхронизировано: ${result.synced}`);
    }
  }

  async function save() {
    setIsSaving(true);
    setNotice(null);
    const result = await createCaptureOfflineFirst(draft);
    setQueuedCount(getQueuedCaptureCount());
    setNotice(result.queued ? "Сохранено offline. Синхронизируем позже." : "Сохранено.");
    setText("");
    setTitle("");
    setLink("");
    setTags("");
    setMedia(null);
    setLocation(null);
    setIsSaving(false);
    textAreaRef.current?.focus();
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMedia(await fileToMediaPayload(file));
    setTitle(file.name);
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setNotice("Геолокация недоступна в этом браузере.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setNotice("Локация добавлена.");
      },
      () => setNotice("Не удалось получить локацию.")
    );
  }

  const activeOption = sourceOptions.find((option) => option.value === sourceType);
  const ActiveIcon = activeOption?.icon ?? Plus;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ActiveIcon className="h-5 w-5" />
            Быстрый Capture
          </CardTitle>
          <CardDescription>
            Открыл, сохранил, пошел дальше. Без постов, без AI, без лишнего.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {sourceOptions.map((option) => {
              const Icon = option.icon;
              const active = sourceType === option.value;
              return (
                <button
                  key={option.value}
                  className={`rounded-lg border p-3 text-sm transition ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-secondary"
                  }`}
                  onClick={() => setSourceType(option.value)}
                  type="button"
                >
                  <Icon className="mx-auto mb-1 h-5 w-5" />
                  {option.label}
                </button>
              );
            })}
          </div>

          <input
            className="h-11 w-full rounded-md border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
            placeholder="Короткий заголовок, если нужен"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />

          {sourceType === "LINK" ? (
            <input
              className="h-11 w-full rounded-md border bg-background px-3 outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://..."
              value={link}
              onChange={(event) => setLink(event.target.value)}
            />
          ) : null}

          {sourceType === "PHOTO" || sourceType === "VIDEO" || sourceType === "VOICE" ? (
            <div className="rounded-lg border border-dashed p-5 text-center">
              <input
                className="mx-auto max-w-full text-sm"
                type="file"
                accept={
                  sourceType === "PHOTO"
                    ? "image/*"
                    : sourceType === "VIDEO"
                      ? "video/*"
                      : "audio/*"
                }
                capture={sourceType === "PHOTO" ? "environment" : undefined}
                onChange={onFileChange}
              />
              <p className="mt-2 text-sm text-muted-foreground">
                {media ? "Файл готов к сохранению." : "Файл сохранится как сырой Capture."}
              </p>
              {sourceType === "VOICE" ? (
                <div className="mx-auto mt-4 flex h-10 max-w-xs items-end justify-center gap-1">
                  {Array.from({ length: 28 }).map((_, index) => (
                    <span
                      key={index}
                      className="w-1 rounded-full bg-accent"
                      style={{ height: `${10 + ((index * 7) % 28)}px` }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {sourceType === "LOCATION" ? (
            <Button variant="secondary" onClick={captureLocation}>
              Добавить текущую локацию
            </Button>
          ) : null}

          <textarea
            ref={textAreaRef}
            className="min-h-40 w-full rounded-lg border bg-background p-4 text-base outline-none focus:ring-2 focus:ring-ring"
            placeholder={
              sourceType === "VOICE"
                ? "Можно добавить расшифровку или короткую мысль вручную..."
                : "Одна мысль. Один абзац. Что нельзя потерять?"
            }
            value={text}
            onChange={(event) => setText(event.target.value)}
          />

          <div className="grid gap-3 md:grid-cols-3">
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={emotion}
              onChange={(event) => setEmotion(event.target.value)}
            >
              <option value="UNKNOWN">Эмоция: не указана</option>
              <option value="HAPPY">Радость</option>
              <option value="SAD">Грусть</option>
              <option value="SURPRISED">Удивление</option>
              <option value="EXCITED">Воодушевление</option>
              <option value="ANGRY">Злость</option>
              <option value="THOUGHTFUL">Задумчивость</option>
            </select>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={importance}
              onChange={(event) => setImportance(event.target.value)}
            >
              <option value="LOW">Низкая важность</option>
              <option value="MEDIUM">Средняя важность</option>
              <option value="HIGH">Высокая важность</option>
              <option value="CRITICAL">Критично</option>
            </select>
            <input
              className="h-10 rounded-md border bg-background px-3"
              placeholder="Теги через запятую"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </div>

          {notice ? <p className="rounded-md bg-secondary p-3 text-sm">{notice}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Автосохранение включено.{" "}
              {queuedCount > 0
                ? `В очереди offline: ${queuedCount}.`
                : "Очередь синхронизации пуста."}
            </p>
            <Button size="lg" onClick={save} disabled={isSaving}>
              {isSaving ? "Сохраняю..." : "Сохранить Capture"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WifiOff className="h-4 w-4" />
              Работает offline
            </CardTitle>
            <CardDescription>
              Если сеть пропадет, Capture останется на устройстве и уйдет позже.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" onClick={syncAndNotify}>
              Синхронизировать очередь
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Входящие</CardTitle>
            <CardDescription>Все сырые материалы попадают сюда.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href={"/capture/inbox" as Route}>Открыть входящие Capture</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
