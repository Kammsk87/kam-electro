import { describe, expect, it, vi } from "vitest";
import { PublicationsController } from "../src/publications/publications.controller";

describe("PublicationsController", () => {
  it("creates a publication from draft endpoint", async () => {
    const service = {
      createFromDraft: vi.fn().mockResolvedValue({ id: "publication-1" })
    };
    const controller = new PublicationsController(service as never);

    await expect(
      controller.createFromDraft(
        { id: "user-1", email: "a@example.com", role: "USER" },
        "draft-1",
        {
          platform: "THREADS"
        }
      )
    ).resolves.toEqual({ id: "publication-1" });

    expect(service.createFromDraft).toHaveBeenCalledWith("user-1", "draft-1", "THREADS");
  });
});
