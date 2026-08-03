export type PublicationPlatform = "TELEGRAM" | "INSTAGRAM" | "THREADS" | "VK";
export type PublicationStatus = "PLANNED" | "READY" | "PUBLISHED" | "CANCELLED" | "FAILED";

export type Publication = {
  id: string;
  workspaceId: string;
  draftId: string;
  platform: PublicationPlatform;
  status: PublicationStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  draft?: {
    id: string;
    title: string | null;
    content: string;
    platform: string;
  };
};

export const publicationPlatforms: PublicationPlatform[] = [
  "TELEGRAM",
  "INSTAGRAM",
  "THREADS",
  "VK"
];
export const publicationStatuses: PublicationStatus[] = [
  "PLANNED",
  "READY",
  "PUBLISHED",
  "CANCELLED",
  "FAILED"
];

export function toLocalDateTimeInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function fromLocalDateTimeInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}
