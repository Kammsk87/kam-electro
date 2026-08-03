export type WorkspaceRole = "OWNER" | "ADMIN" | "EDITOR" | "ANALYST" | "VIEWER";
export type UserRole = "USER" | "ADMIN";
export type SocialPlatform = "TELEGRAM" | "INSTAGRAM" | "THREADS" | "VK";
export type PlatformPriority = "PRIMARY" | "SECONDARY" | "LOW";
export type PreferredPostLength = "SHORT" | "MEDIUM" | "LONG" | "MIXED";
export type CaptureSourceType = "PHOTO" | "VIDEO" | "VOICE" | "TEXT" | "LINK" | "LOCATION" | "MIXED";
export type CaptureStatus = "NEW" | "REVIEWED" | "ARCHIVED" | "DELETED";
export type CaptureEmotion =
  | "UNKNOWN"
  | "HAPPY"
  | "SAD"
  | "SURPRISED"
  | "EXCITED"
  | "ANGRY"
  | "THOUGHTFUL";
export type CaptureImportance = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type InterviewStatus = "NEW" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
export type InterviewMessageRole = "ASSISTANT" | "USER" | "SYSTEM";

export type FoundationModule =
  | "identity"
  | "workspace"
  | "media"
  | "ai"
  | "content"
  | "publishing"
  | "analytics"
  | "planner"
  | "memory"
  | "research"
  | "notifications"
  | "settings";

export type ServiceStatus = "idle" | "starting" | "ready" | "degraded" | "offline";

export type AuthorProfileDto = {
  id: string;
  displayName: string;
  bio: string | null;
  positioning: string | null;
  mainTopics: string[];
  forbiddenTopics: string[];
  toneOfVoice: string[];
  sarcasmLevel: number;
  depthLevel: number;
  personalLevel: number;
  expertiseLevel: number;
  preferredPostLength: PreferredPostLength;
  contentGoals: string[];
};

export type SocialAccountDto = {
  id: string;
  platform: SocialPlatform;
  accountName: string | null;
  accountUrl: string | null;
  priority: PlatformPriority;
  isActive: boolean;
  publishingEnabled: boolean;
  analyticsEnabled: boolean;
  notes: string | null;
};

export type CaptureDto = {
  id: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  sourceType: CaptureSourceType;
  title: string | null;
  description: string | null;
  transcript: string | null;
  media: unknown;
  location: unknown;
  tags: string[];
  status: CaptureStatus;
  emotion: CaptureEmotion;
  importance: CaptureImportance;
  context: unknown;
  isFavorite: boolean;
};

export type InterviewMessageDto = {
  id: string;
  interviewId: string;
  role: InterviewMessageRole;
  content: string;
  createdAt: string;
  metadata: unknown;
};

export type InterviewSessionDto = {
  id: string;
  captureId: string;
  workspaceId: string;
  status: InterviewStatus;
  startedAt: string | null;
  finishedAt: string | null;
  currentStep: number;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  messages: InterviewMessageDto[];
};
