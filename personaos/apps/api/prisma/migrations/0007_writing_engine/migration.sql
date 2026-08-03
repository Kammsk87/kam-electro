CREATE TYPE "DraftStatus" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "DraftPlatform" AS ENUM ('TELEGRAM', 'INSTAGRAM', 'THREADS', 'VK');

CREATE TABLE "Draft" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "storyId" TEXT NOT NULL,
  "platform" "DraftPlatform" NOT NULL,
  "title" TEXT,
  "content" TEXT NOT NULL,
  "status" "DraftStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftVersion" (
  "id" TEXT NOT NULL,
  "draftId" TEXT NOT NULL,
  "title" TEXT,
  "content" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DraftVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Draft_storyId_platform_key" ON "Draft"("storyId", "platform");
CREATE INDEX "Draft_workspaceId_status_updatedAt_idx" ON "Draft"("workspaceId", "status", "updatedAt");
CREATE INDEX "Draft_workspaceId_platform_idx" ON "Draft"("workspaceId", "platform");
CREATE INDEX "DraftVersion_draftId_createdAt_idx" ON "DraftVersion"("draftId", "createdAt");

ALTER TABLE "Draft" ADD CONSTRAINT "Draft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftVersion" ADD CONSTRAINT "DraftVersion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
