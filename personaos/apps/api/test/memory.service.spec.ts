import { describe, expect, it, vi } from "vitest";
import { MemoryService } from "../src/memory/memory.service";

describe("MemoryService", () => {
  it("syncs Capture into a MemoryItem without inventing content", async () => {
    const capture = {
      id: "capture-1",
      workspaceId: "workspace-1",
      sourceType: "TEXT",
      title: "После встречи",
      description: "Команда устала после запуска.",
      transcript: null,
      tags: ["бизнес"],
      importance: "HIGH"
    };
    const prisma = {
      capture: { findUnique: vi.fn().mockResolvedValue(capture) },
      memoryItem: {
        upsert: vi.fn().mockResolvedValue({ id: "memory-1", title: capture.title })
      }
    };
    const service = new MemoryService(prisma as never, { getActiveWorkspace: vi.fn() } as never);

    await service.syncFromCapture(capture.id);

    expect(prisma.memoryItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workspaceId: capture.workspaceId,
          sourceType: "CAPTURE",
          sourceId: capture.id,
          title: capture.title,
          summary: capture.description,
          tags: capture.tags,
          importance: capture.importance
        })
      })
    );
  });

  it("creates links between memories in the same workspace", async () => {
    const memory = { id: "memory-1", workspaceId: "workspace-1" };
    const prisma = {
      memoryItem: {
        findUnique: vi.fn().mockResolvedValue(memory)
      },
      workspaceMember: {
        findUnique: vi.fn().mockResolvedValue({ id: "membership-1" })
      },
      memoryLink: {
        upsert: vi.fn().mockResolvedValue({ id: "link-1" })
      }
    };
    const service = new MemoryService(prisma as never, { getActiveWorkspace: vi.fn() } as never);

    await service.createLink("user-1", {
      fromMemoryId: "memory-1",
      toMemoryId: "memory-2",
      relation: "RELATED"
    });

    expect(prisma.memoryLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: {
          fromMemoryId: "memory-1",
          toMemoryId: "memory-2",
          relation: "RELATED"
        }
      })
    );
  });
});
