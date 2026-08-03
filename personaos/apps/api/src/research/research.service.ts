import { Injectable, NotFoundException } from "@nestjs/common";
import type { ResearchItemType, ResearchSource } from "@prisma/client";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

export type ResearchInput = {
  source: ResearchSource;
  type: ResearchItemType;
  title: string;
  summary?: string | null;
  url?: string | null;
  relevance?: number;
  tags?: string[];
};

@Injectable()
export class ResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async list(userId: string, filters: { source?: ResearchSource; type?: ResearchItemType }) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.researchItem.findMany({
      where: { workspaceId: workspace.id, source: filters.source, type: filters.type },
      orderBy: [{ relevance: "desc" }, { createdAt: "desc" }],
      take: 100
    });
  }

  async create(userId: string, input: ResearchInput) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.researchItem.create({
      data: { workspaceId: workspace.id, ...input, tags: input.tags ?? [] }
    });
  }

  async scan(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const [persona, memories] = await Promise.all([
      this.prisma.personaProfile.findUnique({ where: { workspaceId: workspace.id } }),
      this.prisma.memoryItem.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { updatedAt: "desc" },
        take: 12
      })
    ]);

    const themes = persona?.themes.length ? persona.themes : unique(memories.flatMap((item) => item.tags));
    const items = themes.slice(0, 6).map((theme, index) => ({
      workspaceId: workspace.id,
      source: "MANUAL" as const,
      type: "TOPIC" as const,
      title: `Explore "${theme}" through lived experience`,
      summary:
        "Local research suggestion based on Persona DNA and Memory. External trend detection will replace this when social APIs are connected.",
      relevance: Number((0.92 - index * 0.06).toFixed(2)),
      tags: [theme],
      metadata: { generatedBy: "research-lite" }
    }));

    if (items.length) {
      await this.prisma.researchItem.createMany({ data: items });
    }
    return this.list(userId, {});
  }

  async update(userId: string, id: string, input: Partial<ResearchInput>) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const item = await this.prisma.researchItem.findUnique({ where: { id } });
    if (!item || item.workspaceId !== workspace.id) throw new NotFoundException("Research item not found.");
    return this.prisma.researchItem.update({ where: { id }, data: input });
  }

  async delete(userId: string, id: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const item = await this.prisma.researchItem.findUnique({ where: { id } });
    if (!item || item.workspaceId !== workspace.id) throw new NotFoundException("Research item not found.");
    await this.prisma.researchItem.delete({ where: { id } });
    return { ok: true };
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
