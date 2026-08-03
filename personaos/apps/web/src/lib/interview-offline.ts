"use client";

import { apiFetch } from "@/lib/api";

const queueKey = "personaos.interview.queue.v1";
const draftPrefix = "personaos.interview.draft.";

type QueuedInterviewAnswer = {
  localId: string;
  interviewId: string;
  content: string;
  queuedAt: string;
};

function readQueue(): QueuedInterviewAnswer[] {
  const raw = window.localStorage.getItem(queueKey);
  return raw ? (JSON.parse(raw) as QueuedInterviewAnswer[]) : [];
}

function writeQueue(items: QueuedInterviewAnswer[]) {
  window.localStorage.setItem(queueKey, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent("personaos:interview-queue-changed"));
}

export function saveInterviewDraft(interviewId: string, content: string) {
  window.localStorage.setItem(`${draftPrefix}${interviewId}`, content);
}

export function readInterviewDraft(interviewId: string) {
  return window.localStorage.getItem(`${draftPrefix}${interviewId}`) ?? "";
}

export function clearInterviewDraft(interviewId: string) {
  window.localStorage.removeItem(`${draftPrefix}${interviewId}`);
}

export function getQueuedInterviewCount(interviewId?: string) {
  const queue = readQueue();
  return interviewId
    ? queue.filter((item) => item.interviewId === interviewId).length
    : queue.length;
}

export async function sendInterviewAnswerOfflineFirst(interviewId: string, content: string) {
  if (navigator.onLine) {
    try {
      const interview = await apiFetch(`/api/interviews/${interviewId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content })
      });
      clearInterviewDraft(interviewId);
      return { interview, queued: false };
    } catch {
      // Keep the answer. Interview should never lose a thought because the network failed.
    }
  }

  writeQueue([
    {
      localId: crypto.randomUUID(),
      interviewId,
      content,
      queuedAt: new Date().toISOString()
    },
    ...readQueue()
  ]);
  clearInterviewDraft(interviewId);
  return { interview: null, queued: true };
}

export async function syncQueuedInterviewAnswers(interviewId?: string) {
  if (!navigator.onLine) return { synced: 0, remaining: getQueuedInterviewCount(interviewId) };

  const queue = readQueue();
  const remaining: QueuedInterviewAnswer[] = [];
  let synced = 0;

  for (const item of queue) {
    if (interviewId && item.interviewId !== interviewId) {
      remaining.push(item);
      continue;
    }

    try {
      await apiFetch(`/api/interviews/${item.interviewId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: item.content })
      });
      synced += 1;
    } catch {
      remaining.push(item);
    }
  }

  writeQueue(remaining);
  return {
    synced,
    remaining: interviewId
      ? remaining.filter((item) => item.interviewId === interviewId).length
      : remaining.length
  };
}
