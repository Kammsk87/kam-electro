CREATE TYPE "PlannerTaskCategory" AS ENUM ('CAPTURE', 'REFLECTION', 'STORY', 'WRITING', 'PUBLISHING');
CREATE TYPE "PlannerTaskStatus" AS ENUM ('TODO', 'DONE', 'SKIPPED');
CREATE TYPE "PlannerTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "WeeklyGoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

CREATE TABLE "PlannerTask" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" "PlannerTaskCategory" NOT NULL,
  "status" "PlannerTaskStatus" NOT NULL DEFAULT 'TODO',
  "priority" "PlannerTaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "dueDate" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "sourceType" TEXT,
  "sourceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlannerTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WeeklyGoal" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "targetCount" INTEGER NOT NULL DEFAULT 1,
  "completedCount" INTEGER NOT NULL DEFAULT 0,
  "status" "WeeklyGoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WeeklyGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlannerStreak" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "current" INTEGER NOT NULL DEFAULT 0,
  "longest" INTEGER NOT NULL DEFAULT 0,
  "lastCompletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlannerStreak_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompletionHistory" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "taskId" TEXT,
  "title" TEXT NOT NULL,
  "category" "PlannerTaskCategory" NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CompletionHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlannerTask_workspaceId_dueDate_status_idx" ON "PlannerTask"("workspaceId", "dueDate", "status");
CREATE INDEX "PlannerTask_workspaceId_category_idx" ON "PlannerTask"("workspaceId", "category");
CREATE INDEX "WeeklyGoal_workspaceId_weekStart_status_idx" ON "WeeklyGoal"("workspaceId", "weekStart", "status");
CREATE UNIQUE INDEX "PlannerStreak_workspaceId_key" ON "PlannerStreak"("workspaceId");
CREATE INDEX "CompletionHistory_workspaceId_completedAt_idx" ON "CompletionHistory"("workspaceId", "completedAt");
CREATE INDEX "CompletionHistory_taskId_idx" ON "CompletionHistory"("taskId");

ALTER TABLE "PlannerTask" ADD CONSTRAINT "PlannerTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WeeklyGoal" ADD CONSTRAINT "WeeklyGoal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlannerStreak" ADD CONSTRAINT "PlannerStreak_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompletionHistory" ADD CONSTRAINT "CompletionHistory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompletionHistory" ADD CONSTRAINT "CompletionHistory_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "PlannerTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
