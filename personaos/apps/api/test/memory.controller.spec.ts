import { describe, expect, it, vi } from "vitest";
import { MemoryController } from "../src/memory/memory.controller";

describe("MemoryController", () => {
  it("syncs a source through the API", async () => {
    const service = {
      syncForUser: vi.fn().mockResolvedValue({ id: "memory-1" })
    };
    const controller = new MemoryController(service as never);

    await expect(
      controller.sync(
        { id: "user-1", email: "a@example.com", role: "USER" },
        {
          sourceType: "CAPTURE",
          sourceId: "capture-1"
        }
      )
    ).resolves.toEqual({ id: "memory-1" });

    expect(service.syncForUser).toHaveBeenCalledWith("user-1", "CAPTURE", "capture-1");
  });
});
