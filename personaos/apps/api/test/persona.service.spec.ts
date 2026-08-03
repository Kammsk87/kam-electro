import { describe, expect, it, vi } from "vitest";
import { PersonaService } from "../src/persona/persona.service";

const workspace = {
  id: "workspace-1",
  description: "Личный бренд предпринимателя",
  authorProfile: {
    positioning: "Предприниматель о жизни и бизнесе",
    mainTopics: ["бизнес"],
    toneOfVoice: ["честный"],
    sarcasmLevel: 3,
    personalLevel: 4,
    forbiddenTopics: ["инфоцыганство"]
  }
};

describe("PersonaService", () => {
  it("rebuilds PersonaProfile from weighted signals", async () => {
    const prisma = {
      personaProfile: {
        findUnique: vi.fn().mockResolvedValue({ id: "profile-1", workspaceId: workspace.id }),
        update: vi
          .fn()
          .mockResolvedValue({ id: "profile-1", themes: ["психология поведения", "бизнес"] })
      },
      personaSignal: {
        findMany: vi.fn().mockResolvedValue([
          { signalType: "THEME", value: "бизнес", confidence: 0.8, weight: 1 },
          { signalType: "THEME", value: "психология поведения", confidence: 0.9, weight: 2 },
          { signalType: "TONE", value: "без пафоса", confidence: 0.7, weight: 1 },
          { signalType: "HUMOR", value: "сухой сарказм", confidence: 0.9, weight: 1 },
          { signalType: "FORBIDDEN_TOPIC", value: "инфоцыганство", confidence: 1, weight: 1 }
        ])
      }
    };
    const workspacesService = {
      getActiveWorkspace: vi.fn().mockResolvedValue(workspace)
    };
    const service = new PersonaService(prisma as never, workspacesService as never);

    await service.rebuildProfileFromSignals("user-1");

    expect(prisma.personaProfile.update).toHaveBeenCalledWith({
      where: { workspaceId: workspace.id },
      data: expect.objectContaining({
        themes: ["психология поведения", "бизнес"],
        tone: ["без пафоса"],
        humorStyle: "сухой сарказм",
        forbiddenTopics: ["инфоцыганство"]
      })
    });
  });
});
