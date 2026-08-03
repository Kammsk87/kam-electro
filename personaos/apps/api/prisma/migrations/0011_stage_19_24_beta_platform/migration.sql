CREATE TYPE "SocialConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR');
CREATE TYPE "SocialIntegrationJobType" AS ENUM ('PUBLISH', 'SCHEDULE', 'DRAFT_SYNC', 'STATUS_SYNC');
CREATE TYPE "IntegrationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AiProviderKind" AS ENUM ('OPENAI', 'ANTHROPIC', 'LOCAL');
CREATE TYPE "AiPlannerRecommendationType" AS ENUM ('DAILY_TASK', 'WEEKLY_THEME', 'IDEA_OF_DAY', 'FOLLOW_UP');
CREATE TYPE "ResearchSource" AS ENUM ('TELEGRAM', 'INSTAGRAM', 'THREADS', 'VK', 'MANUAL');
CREATE TYPE "ResearchItemType" AS ENUM ('TREND', 'COMPETITOR', 'TOPIC', 'FORMAT');
CREATE TYPE "AiJobType" AS ENUM ('MEMORY_EMBED', 'MEMORY_SEARCH', 'PLANNER_RECOMMEND', 'RESEARCH_SCAN', 'WRITING_REWRITE', 'PUBLISHING_SYNC');
CREATE TYPE "AiJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AiJobPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWED', 'PLANNED', 'RESOLVED');
CREATE TYPE "ExportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "SocialConnection" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "status" "SocialConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "accountName" TEXT,
  "externalUserId" TEXT,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMP(3),
  "lastSyncAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SocialIntegrationJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "publicationId" TEXT,
  "platform" "SocialPlatform" NOT NULL,
  "type" "SocialIntegrationJobType" NOT NULL,
  "status" "IntegrationJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "scheduledFor" TIMESTAMP(3),
  "payload" JSONB,
  "result" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SocialIntegrationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryEmbedding" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "memoryItemId" TEXT NOT NULL,
  "provider" "AiProviderKind" NOT NULL DEFAULT 'LOCAL',
  "model" TEXT NOT NULL DEFAULT 'local-hash-v1',
  "vector" DOUBLE PRECISION[] DEFAULT ARRAY[]::DOUBLE PRECISION[],
  "textHash" TEXT NOT NULL,
  "dimensions" INTEGER NOT NULL DEFAULT 64,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemoryEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiPlannerRecommendation" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "type" "AiPlannerRecommendationType" NOT NULL,
  "title" TEXT NOT NULL,
  "reason" TEXT,
  "source" JSONB,
  "status" "PlannerTaskStatus" NOT NULL DEFAULT 'TODO',
  "dueDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiPlannerRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResearchItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "source" "ResearchSource" NOT NULL,
  "type" "ResearchItemType" NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "url" TEXT,
  "relevance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ResearchItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "type" "AiJobType" NOT NULL,
  "status" "AiJobStatus" NOT NULL DEFAULT 'QUEUED',
  "priority" "AiJobPriority" NOT NULL DEFAULT 'NORMAL',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "payload" JSONB,
  "result" JSONB,
  "error" TEXT,
  "runAfter" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FeatureFlag" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserFeedback" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserFeedback_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExportJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "ExportJobStatus" NOT NULL DEFAULT 'QUEUED',
  "format" TEXT NOT NULL DEFAULT 'json',
  "downloadUrl" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialConnection_workspaceId_platform_key" ON "SocialConnection"("workspaceId", "platform");
CREATE INDEX "SocialConnection_workspaceId_status_idx" ON "SocialConnection"("workspaceId", "status");
CREATE INDEX "SocialIntegrationJob_workspaceId_status_scheduledFor_idx" ON "SocialIntegrationJob"("workspaceId", "status", "scheduledFor");
CREATE INDEX "SocialIntegrationJob_publicationId_idx" ON "SocialIntegrationJob"("publicationId");
CREATE UNIQUE INDEX "MemoryEmbedding_memoryItemId_key" ON "MemoryEmbedding"("memoryItemId");
CREATE INDEX "MemoryEmbedding_workspaceId_provider_idx" ON "MemoryEmbedding"("workspaceId", "provider");
CREATE INDEX "AiPlannerRecommendation_workspaceId_status_dueDate_idx" ON "AiPlannerRecommendation"("workspaceId", "status", "dueDate");
CREATE INDEX "ResearchItem_workspaceId_type_relevance_idx" ON "ResearchItem"("workspaceId", "type", "relevance");
CREATE INDEX "ResearchItem_workspaceId_source_idx" ON "ResearchItem"("workspaceId", "source");
CREATE INDEX "AiJob_workspaceId_status_priority_idx" ON "AiJob"("workspaceId", "status", "priority");
CREATE INDEX "AiJob_runAfter_idx" ON "AiJob"("runAfter");
CREATE UNIQUE INDEX "FeatureFlag_workspaceId_key_key" ON "FeatureFlag"("workspaceId", "key");
CREATE INDEX "FeatureFlag_key_idx" ON "FeatureFlag"("key");
CREATE INDEX "UserFeedback_workspaceId_status_idx" ON "UserFeedback"("workspaceId", "status");
CREATE INDEX "UserFeedback_userId_idx" ON "UserFeedback"("userId");
CREATE INDEX "ExportJob_workspaceId_status_idx" ON "ExportJob"("workspaceId", "status");
CREATE INDEX "ExportJob_userId_idx" ON "ExportJob"("userId");

ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialIntegrationJob" ADD CONSTRAINT "SocialIntegrationJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryEmbedding" ADD CONSTRAINT "MemoryEmbedding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryEmbedding" ADD CONSTRAINT "MemoryEmbedding_memoryItemId_fkey" FOREIGN KEY ("memoryItemId") REFERENCES "MemoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiPlannerRecommendation" ADD CONSTRAINT "AiPlannerRecommendation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResearchItem" ADD CONSTRAINT "ResearchItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserFeedback" ADD CONSTRAINT "UserFeedback_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
