import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { PublicationPlatform, PublicationStatus } from "@prisma/client";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

export type PublicationInput = {
  platform?: PublicationPlatform;
  status?: PublicationStatus;
  scheduledAt?: Date | null;
  publishedAt?: Date | null;
  externalUrl?: string | null;
  notes?: string | null;
};

@Injectable()
export class PublicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async createFromDraft(userId: string, draftId: string, platform?: PublicationPlatform) {
    const draft = await this.prisma.draft.findUnique({ where: { id: draftId } });
    await this.ensureWorkspaceAccess(userId, draft?.workspaceId);

    if (!draft) {
      throw new NotFoundException("Draft not found.");
    }

    return this.prisma.publication.create({
      data: {
        workspaceId: draft.workspaceId,
        draftId,
        platform: platform ?? draft.platform,
        status: "PLANNED"
      },
      include: { draft: true }
    });
  }

  async list(
    userId: string,
    filters: { platform?: PublicationPlatform; status?: PublicationStatus }
  ) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.publication.findMany({
      where: {
        workspaceId: workspace.id,
        platform: filters.platform,
        status: filters.status
      },
      include: { draft: true },
      orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }]
    });
  }

  async get(userId: string, id: string) {
    const publication = await this.prisma.publication.findUnique({
      where: { id },
      include: { draft: true }
    });
    await this.ensureWorkspaceAccess(userId, publication?.workspaceId);
    return publication;
  }

  async update(userId: string, id: string, input: PublicationInput) {
    const publication = await this.prisma.publication.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, publication?.workspaceId);

    return this.prisma.publication.update({
      where: { id },
      data: input,
      include: { draft: true }
    });
  }

  async schedule(userId: string, id: string, scheduledAt: Date | null) {
    return this.update(userId, id, {
      scheduledAt,
      status: scheduledAt ? "PLANNED" : undefined
    });
  }

  async markReady(userId: string, id: string) {
    return this.update(userId, id, { status: "READY" });
  }

  async markPublished(
    userId: string,
    id: string,
    input: { externalUrl?: string | null; notes?: string | null }
  ) {
    return this.update(userId, id, {
      status: "PUBLISHED",
      publishedAt: new Date(),
      externalUrl: input.externalUrl,
      notes: input.notes
    });
  }

  async cancel(userId: string, id: string) {
    return this.update(userId, id, { status: "CANCELLED" });
  }

  async delete(userId: string, id: string) {
    const publication = await this.prisma.publication.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, publication?.workspaceId);
    await this.prisma.publication.delete({ where: { id } });
    return { ok: true };
  }

  async summary(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [planned, ready, publishedThisWeek] = await Promise.all([
      this.prisma.publication.count({ where: { workspaceId: workspace.id, status: "PLANNED" } }),
      this.prisma.publication.count({ where: { workspaceId: workspace.id, status: "READY" } }),
      this.prisma.publication.count({
        where: {
          workspaceId: workspace.id,
          status: "PUBLISHED",
          publishedAt: { gte: weekAgo }
        }
      })
    ]);

    return { planned, ready, publishedThisWeek };
  }

  private async ensureWorkspaceAccess(userId: string, workspaceId?: string) {
    if (!workspaceId) {
      throw new NotFoundException("Publication not found.");
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId }
      }
    });

    if (!membership) {
      throw new ForbiddenException("You do not have access to this publication.");
    }
  }
}
