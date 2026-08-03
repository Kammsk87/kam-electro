import { describe, expect, it, vi } from "vitest";
import { DraftsService } from "../src/drafts/drafts.service";

const story = {
  id: "story-1",
  workspaceId: "workspace-1",
  title: "Про встречу",
  hook: "Команда устала раньше, чем это стало видно.",
  context: "Мы вышли после встречи.",
  conflict: "Все говорили аккуратно.",
  insight: "Команда верит действиям.",
  takeaway: "Сначала смотри на реальность.",
  status: "READY",
  createdAt: new Date(),
  updatedAt: new Date(),
  reflectionId: "reflection-1"
};

describe("DraftsService", () => {
  it("creates a Draft from Story through the AI layer", async () => {
    const prisma = {
      story: { findUnique: vi.fn().mockResolvedValue(story) },
      workspaceMember: { findUnique: vi.fn().mockResolvedValue({ id: "membership-1" }) },
      draft: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "draft-1", content: "AI draft" })
      }
    };
    const workspacesService = { getActiveWorkspace: vi.fn() };
    const aiService = {
      generate: vi.fn().mockResolvedValue({ content: "AI draft", provider: "local" })
    };
    const service = new DraftsService(
      prisma as never,
      workspacesService as never,
      aiService as never
    );

    await service.createFromStory("user-1", story.id, "TELEGRAM");

    expect(aiService.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("Never invent facts"),
        user: expect.stringContaining(story.takeaway)
      })
    );
    expect(prisma.draft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storyId: story.id,
          platform: "TELEGRAM",
          content: "AI draft",
          versions: expect.any(Object)
        })
      })
    );
  });
});
