"use client";

import { apiFetch } from "@/lib/api";

const queueKey = "personaos.capture.queue.v1";
const draftKey = "personaos.capture.draft.v1";

export type CaptureDraft = {
  sourceType: "PHOTO" | "VIDEO" | "VOICE" | "TEXT" | "LINK" | "LOCATION" | "MIXED";
  title?: string;
  description?: string;
  transcript?: string;
  media?: unknown;
  location?: unknown;
  tags?: string[];
  emotion?: string;
  importance?: string;
  context?: unknown;
};

type QueueItem = CaptureDraft & {
  localId: string;
  queuedAt: string;
};

function readQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(queueKey);
  return raw ? (JSON.parse(raw) as QueueItem[]) : [];
}

function writeQueue(items: QueueItem[]) {
  window.localStorage.setItem(queueKey, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("personaos:capture-queue-changed"));
}

export function saveDraft(draft: CaptureDraft) {
  window.localStorage.setItem(draftKey, JSON.stringify(draft));
}

export function readDraft(): CaptureDraft | null {
  const raw = window.localStorage.getItem(draftKey);
  return raw ? (JSON.parse(raw) as CaptureDraft) : null;
}

export function clearDraft() {
  window.localStorage.removeItem(draftKey);
}

export function getQueuedCaptureCount() {
  return readQueue().length;
}

export async function createCaptureOfflineFirst(draft: CaptureDraft) {
  if (navigator.onLine) {
    try {
      const capture = await apiFetch("/api/captures", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      clearDraft();
      return { capture, queued: false };
    } catch {
      // Fall through to local queue. Capture should never be lost because an API call failed.
    }
  }

  const item: QueueItem = {
    ...draft,
    localId: crypto.randomUUID(),
    queuedAt: new Date().toISOString()
  };
  writeQueue([item, ...readQueue()]);
  clearDraft();
  return { capture: item, queued: true };
}

export async function syncQueuedCaptures() {
  if (!navigator.onLine) return { synced: 0, remaining: getQueuedCaptureCount() };

  const queue = readQueue();
  const remaining: QueueItem[] = [];
  let synced = 0;

  for (const item of queue) {
    const payload = {
      sourceType: item.sourceType,
      title: item.title,
      description: item.description,
      transcript: item.transcript,
      media: item.media,
      location: item.location,
      tags: item.tags,
      emotion: item.emotion,
      importance: item.importance,
      context: item.context
    };
    try {
      await apiFetch("/api/captures", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      synced += 1;
    } catch {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  return { synced, remaining: remaining.length };
}

export async function fileToMediaPayload(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  return {
    name: file.name,
    type: file.type,
    size: file.size,
    dataUrl
  };
}
