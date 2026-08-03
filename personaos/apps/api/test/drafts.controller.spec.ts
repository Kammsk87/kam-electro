import { describe, expect, it, vi } from "vitest";
import { DraftsController } from "../src/drafts/drafts.controller";

describe("DraftsController", () => {
  it("creates a draft from a story id and platform", async () => {
    const service = {
      createFromStory: vi.fn().mockResolvedValue({ id: "draft-1" })
    };
    const controller = new DraftsController(service as never);

    await expect(
      controller.createFromStory(
        { id: "user-1", email: "a@example.com", role: "USER" },
        "story-1",
        {
          platform: "THREADS"
        }
      )
    ).resolves.toEqual({ id: "draft-1" });

    expect(service.createFromStory).toHaveBeenCalledWith("user-1", "story-1", "THREADS");
  });
});
