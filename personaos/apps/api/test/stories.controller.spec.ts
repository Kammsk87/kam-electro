import { describe, expect, it, vi } from "vitest";
import { StoriesController } from "../src/stories/stories.controller";

describe("StoriesController", () => {
  it("creates a story from a reflection id", async () => {
    const service = {
      createFromReflection: vi.fn().mockResolvedValue({ id: "story-1" })
    };
    const controller = new StoriesController(service as never);

    await expect(
      controller.createFromReflection(
        { id: "user-1", email: "a@example.com", role: "USER" },
        "reflection-1"
      )
    ).resolves.toEqual({ id: "story-1" });

    expect(service.createFromReflection).toHaveBeenCalledWith("user-1", "reflection-1");
  });
});
