export type DraftPlatform = "TELEGRAM" | "INSTAGRAM" | "THREADS" | "VK";
export type DraftStatus = "DRAFT" | "READY" | "PUBLISHED" | "ARCHIVED";

export type DraftVersion = {
  id: string;
  title: string | null;
  content: string;
  reason: string | null;
  createdAt: string;
};

export type Draft = {
  id: string;
  workspaceId: string;
  storyId: string;
  platform: DraftPlatform;
  title: string | null;
  content: string;
  status: DraftStatus;
  createdAt: string;
  updatedAt: string;
  versions?: DraftVersion[];
  story?: {
    id: string;
    title: string | null;
    hook: string | null;
  };
};

export const draftPlatforms: DraftPlatform[] = ["TELEGRAM", "INSTAGRAM", "THREADS", "VK"];

export function getDraftMetrics(content: string) {
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const characters = content.length;
  const estimatedReadTime = Math.max(1, Math.ceil(words / 180));
  return { words, characters, estimatedReadTime };
}
