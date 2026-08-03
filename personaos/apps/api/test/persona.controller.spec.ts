import { describe, expect, it, vi } from "vitest";
import { PersonaController } from "../src/persona/persona.controller";

describe("PersonaController", () => {
  it("delegates profile updates to PersonaService with validated data", async () => {
    const service = {
      updateProfile: vi.fn().mockResolvedValue({ id: "profile-1", summary: "updated" })
    };
    const controller = new PersonaController(service as never);

    await expect(
      controller.updateProfile(
        { id: "user-1", email: "a@example.com", role: "USER" },
        { summary: "updated", themes: ["бизнес"], sarcasmLevel: 4 }
      )
    ).resolves.toEqual({ id: "profile-1", summary: "updated" });

    expect(service.updateProfile).toHaveBeenCalledWith("user-1", {
      summary: "updated",
      themes: ["бизнес"],
      sarcasmLevel: 4
    });
  });
});
