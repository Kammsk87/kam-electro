CREATE TYPE "CaptureSourceType" AS ENUM ('PHOTO', 'VIDEO', 'VOICE', 'TEXT', 'LINK', 'LOCATION', 'MIXED');
CREATE TYPE "CaptureStatus" AS ENUM ('NEW', 'REVIEWED', 'ARCHIVED', 'DELETED');
CREATE TYPE "CaptureEmotion" AS ENUM ('UNKNOWN', 'HAPPY', 'SAD', 'SURPRISED', 'EXCITED', 'ANGRY', 'THOUGHTFUL');
CREATE TYPE "CaptureImportance" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TABLE "Capture" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sourceType" "CaptureSourceType" NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "transcript" TEXT,
  "media" JSONB,
  "location" JSONB,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "CaptureStatus" NOT NULL DEFAULT 'NEW',
  "emotion" "CaptureEmotion" NOT NULL DEFAULT 'UNKNOWN',
  "importance" "CaptureImportance" NOT NULL DEFAULT 'MEDIUM',
  "context" JSONB,
  "isFavorite" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Capture_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Capture_workspaceId_status_createdAt_idx" ON "Capture"("workspaceId", "status", "createdAt");
CREATE INDEX "Capture_workspaceId_isFavorite_idx" ON "Capture"("workspaceId", "isFavorite");
CREATE INDEX "Capture_workspaceId_sourceType_idx" ON "Capture"("workspaceId", "sourceType");

ALTER TABLE "Capture" ADD CONSTRAINT "Capture_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
