CREATE TYPE "PersonaSignalSourceType" AS ENUM ('CAPTURE', 'REFLECTION', 'AUTHOR_PROFILE', 'MANUAL');
CREATE TYPE "PersonaSignalType" AS ENUM ('VALUE', 'BELIEF', 'THEME', 'TONE', 'HUMOR', 'STYLE', 'TOPIC', 'EMOTION', 'DECISION_PATTERN', 'FORBIDDEN_TOPIC');

CREATE TABLE "PersonaProfile" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "summary" TEXT,
  "values" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "beliefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "themes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tone" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "humorStyle" TEXT,
  "sarcasmLevel" INTEGER NOT NULL DEFAULT 2,
  "emotionalityLevel" INTEGER NOT NULL DEFAULT 3,
  "riskAttitude" TEXT,
  "businessAttitude" TEXT,
  "peopleAttitude" TEXT,
  "moneyAttitude" TEXT,
  "familyAttitude" TEXT,
  "forbiddenTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "preferredFormats" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PersonaProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonaSignal" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sourceType" "PersonaSignalSourceType" NOT NULL,
  "sourceId" TEXT,
  "signalType" "PersonaSignalType" NOT NULL,
  "value" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonaSignal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PersonaVersion" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PersonaVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PersonaProfile_workspaceId_key" ON "PersonaProfile"("workspaceId");
CREATE INDEX "PersonaProfile_userId_idx" ON "PersonaProfile"("userId");
CREATE INDEX "PersonaSignal_workspaceId_signalType_idx" ON "PersonaSignal"("workspaceId", "signalType");
CREATE INDEX "PersonaSignal_workspaceId_sourceType_idx" ON "PersonaSignal"("workspaceId", "sourceType");
CREATE INDEX "PersonaSignal_workspaceId_createdAt_idx" ON "PersonaSignal"("workspaceId", "createdAt");
CREATE UNIQUE INDEX "PersonaVersion_workspaceId_version_key" ON "PersonaVersion"("workspaceId", "version");
CREATE INDEX "PersonaVersion_workspaceId_createdAt_idx" ON "PersonaVersion"("workspaceId", "createdAt");

ALTER TABLE "PersonaProfile" ADD CONSTRAINT "PersonaProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonaProfile" ADD CONSTRAINT "PersonaProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonaSignal" ADD CONSTRAINT "PersonaSignal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PersonaVersion" ADD CONSTRAINT "PersonaVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
