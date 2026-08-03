CREATE TYPE "PublicationStatus" AS ENUM ('PLANNED', 'READY', 'PUBLISHED', 'CANCELLED', 'FAILED');
CREATE TYPE "PublicationPlatform" AS ENUM ('TELEGRAM', 'INSTAGRAM', 'THREADS', 'VK');

CREATE TABLE "Publication" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "platform" "PublicationPlatform" NOT NULL,
  "status" "PublicationStatus" NOT NULL DEFAULT 'PLANNED',
  "scheduledAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "externalUrl" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Publication_workspaceId_status_scheduledAt_idx" ON "Publication"("workspaceId", "status", "scheduledAt");
CREATE INDEX "Publication_workspaceId_platform_idx" ON "Publication"("workspaceId", "platform");
CREATE INDEX "Publication_draftId_idx" ON "Publication"("draftId");

ALTER TABLE "Publication" ADD CONSTRAINT "Publication_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
