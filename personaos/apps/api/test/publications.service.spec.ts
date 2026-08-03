import { describe, expect, it, vi } from "vitest";
import { PublicationsService } from "../src/publications/publications.service";

describe("PublicationsService", () => {
  it("creates a planned publication from a draft", async () => {
    const draft = {
      id: "draft-1",
      workspaceId: "workspace-1",
      platform: "TELEGRAM"
    };
    const prisma = {
      draft: { findUnique: vi.fn().mockResolvedValue(draft) },
      workspaceMember: { findUnique: vi.fn().mockResolvedValue({ id: "membership-1" }) },
      publication: {
        create: vi.fn().mockResolvedValue({ id: "publication-1", status: "PLANNED" })
      }
    };
    const workspacesService = { getActiveWorkspace: vi.fn() };
    const service = new PublicationsService(prisma as never, workspacesService as never);

    await service.createFromDraft("user-1", draft.id, "INSTAGRAM");

    expect(prisma.publication.create).toHaveBeenCalledWith({
      data: {
        workspaceId: draft.workspaceId,
        draftId: draft.id,
        platform: "INSTAGRAM",
        status: "PLANNED"
      },
      include: { draft: true }
    });
  });
});
