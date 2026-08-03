CREATE TYPE "InterviewStatus" AS ENUM ('NEW', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "InterviewMessageRole" AS ENUM ('ASSISTANT', 'USER', 'SYSTEM');

CREATE TABLE "InterviewSession" (
  "id" TEXT NOT NULL,
  "captureId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "status" "InterviewStatus" NOT NULL DEFAULT 'NEW',
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "currentStep" INTEGER NOT NULL DEFAULT 0,
  "summary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterviewMessage" (
  "id" TEXT NOT NULL,
  "interviewId" TEXT NOT NULL,
  "role" "InterviewMessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "InterviewMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InterviewSession_workspaceId_status_updatedAt_idx" ON "InterviewSession"("workspaceId", "status", "updatedAt");
CREATE INDEX "InterviewSession_captureId_idx" ON "InterviewSession"("captureId");
CREATE INDEX "InterviewMessage_interviewId_createdAt_idx" ON "InterviewMessage"("interviewId", "createdAt");

ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "Capture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InterviewMessage" ADD CONSTRAINT "InterviewMessage_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
