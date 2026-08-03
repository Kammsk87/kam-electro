CREATE TYPE "StoryStatus" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

CREATE TABLE "Story" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "reflectionId" TEXT NOT NULL,
  "title" TEXT,
  "hook" TEXT,
  "context" TEXT,
  "conflict" TEXT,
  "insight" TEXT,
  "takeaway" TEXT,
  "status" "StoryStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Story_reflectionId_key" ON "Story"("reflectionId");
CREATE INDEX "Story_workspaceId_status_updatedAt_idx" ON "Story"("workspaceId", "status", "updatedAt");

ALTER TABLE "Story" ADD CONSTRAINT "Story_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Story" ADD CONSTRAINT "Story_reflectionId_fkey" FOREIGN KEY ("reflectionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
