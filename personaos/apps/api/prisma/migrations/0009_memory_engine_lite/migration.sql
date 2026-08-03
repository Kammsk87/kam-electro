CREATE TYPE "MemorySourceType" AS ENUM ('CAPTURE', 'REFLECTION', 'STORY');
CREATE TYPE "MemoryImportance" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "MemoryRelation" AS ENUM ('RELATED', 'SIMILAR', 'FOLLOWUP', 'CONTRADICTION');

CREATE TABLE "MemoryItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sourceType" "MemorySourceType" NOT NULL,
  "sourceId" TEXT NOT NULL,
  "title" TEXT,
  "summary" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "importance" "MemoryImportance" NOT NULL DEFAULT 'MEDIUM',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemoryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemoryLink" (
  "id" TEXT NOT NULL,
  "fromMemoryId" TEXT NOT NULL,
  "toMemoryId" TEXT NOT NULL,
  "relation" "MemoryRelation" NOT NULL DEFAULT 'RELATED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemoryLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemoryItem_workspaceId_sourceType_sourceId_key" ON "MemoryItem"("workspaceId", "sourceType", "sourceId");
CREATE INDEX "MemoryItem_workspaceId_updatedAt_idx" ON "MemoryItem"("workspaceId", "updatedAt");
CREATE INDEX "MemoryItem_workspaceId_importance_idx" ON "MemoryItem"("workspaceId", "importance");
CREATE UNIQUE INDEX "MemoryLink_fromMemoryId_toMemoryId_relation_key" ON "MemoryLink"("fromMemoryId", "toMemoryId", "relation");
CREATE INDEX "MemoryLink_toMemoryId_idx" ON "MemoryLink"("toMemoryId");

ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryLink" ADD CONSTRAINT "MemoryLink_fromMemoryId_fkey" FOREIGN KEY ("fromMemoryId") REFERENCES "MemoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryLink" ADD CONSTRAINT "MemoryLink_toMemoryId_fkey" FOREIGN KEY ("toMemoryId") REFERENCES "MemoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
