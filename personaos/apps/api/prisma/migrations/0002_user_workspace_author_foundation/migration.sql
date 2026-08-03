CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "SocialPlatform" AS ENUM ('TELEGRAM', 'INSTAGRAM', 'THREADS', 'VK');
CREATE TYPE "PlatformPriority" AS ENUM ('PRIMARY', 'SECONDARY', 'LOW');
CREATE TYPE "PreferredPostLength" AS ENUM ('SHORT', 'MEDIUM', 'LONG', 'MIXED');

ALTER TABLE "User"
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN "onboardingDone" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Workspace"
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "description" TEXT;

UPDATE "Workspace"
SET "ownerId" = (
  SELECT "userId"
  FROM "WorkspaceMember"
  WHERE "WorkspaceMember"."workspaceId" = "Workspace"."id"
  ORDER BY "WorkspaceMember"."createdAt" ASC
  LIMIT 1
);

ALTER TABLE "Workspace" ALTER COLUMN "ownerId" SET NOT NULL;
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PasswordCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordCredential_userId_key" ON "PasswordCredential"("userId");
ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AuthorProfile" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "bio" TEXT,
  "positioning" TEXT,
  "mainTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "forbiddenTopics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "toneOfVoice" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sarcasmLevel" INTEGER NOT NULL DEFAULT 2,
  "depthLevel" INTEGER NOT NULL DEFAULT 4,
  "personalLevel" INTEGER NOT NULL DEFAULT 3,
  "expertiseLevel" INTEGER NOT NULL DEFAULT 4,
  "preferredPostLength" "PreferredPostLength" NOT NULL DEFAULT 'MIXED',
  "contentGoals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AuthorProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthorProfile_workspaceId_key" ON "AuthorProfile"("workspaceId");
ALTER TABLE "AuthorProfile" ADD CONSTRAINT "AuthorProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SocialAccount" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "platform" "SocialPlatform" NOT NULL,
  "accountName" TEXT,
  "accountUrl" TEXT,
  "priority" "PlatformPriority" NOT NULL DEFAULT 'LOW',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "publishingEnabled" BOOLEAN NOT NULL DEFAULT false,
  "analyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialAccount_workspaceId_platform_key" ON "SocialAccount"("workspaceId", "platform");
CREATE INDEX "SocialAccount_workspaceId_idx" ON "SocialAccount"("workspaceId");
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
