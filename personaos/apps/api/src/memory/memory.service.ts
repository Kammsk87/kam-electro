import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { MemoryImportance, MemoryRelation, MemorySourceType } from "@prisma/client";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

export type MemoryInput = {
  title?: string | null;
  summary?: string | null;
  tags?: string[];
  importance?: MemoryImportance;
};

@Injectable()
export class MemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async syncFromCapture(captureId: string) {
    const capture = await this.prisma.capture.findUnique({ where: { id: captureId } });
    if (!capture) throw new NotFoundException("Capture not found.");

    return this.prisma.memoryItem.upsert({
      where: {
        workspaceId_sourceType_sourceId: {
          workspaceId: capture.workspaceId,
          sourceType: "CAPTURE",
          sourceId: capture.id
        }
      },
      create: {
        workspaceId: capture.workspaceId,
        sourceType: "CAPTURE",
        sourceId: capture.id,
        title:
          capture.title ||
          this.titleFromText(capture.description || capture.transcript) ||
          `${capture.sourceType} capture`,
        summary: capture.description || capture.transcript || null,
        tags: capture.tags,
        importance: capture.importance
      },
      update: {
        title:
          capture.title ||
          this.titleFromText(capture.description || capture.transcript) ||
          undefined,
        summary: capture.description || capture.transcript || undefined,
        tags: capture.tags,
        importance: capture.importance
      }
    });
  }

  async syncFromReflection(reflectionId: string) {
    const reflection = await this.prisma.interviewSession.findUnique({
      where: { id: reflectionId },
      include: {
        capture: true,
        messages: { orderBy: { createdAt: "asc" } }
      }
    });
    if (!reflection) throw new NotFoundException("Reflection not found.");

    const answers = reflection.messages
      .filter((message) => message.role === "USER")
      .map((message) => message.content.trim())
      .filter(Boolean);
    const reflectionSummary = answers.join("\n\n");
    const baseSummary = [
      reflection.capture.description || reflection.capture.transcript,
      reflectionSummary
    ]
      .filter(Boolean)
      .join("\n\n");

    return this.prisma.memoryItem.upsert({
      where: {
        workspaceId_sourceType_sourceId: {
          workspaceId: reflection.workspaceId,
          sourceType: "CAPTURE",
          sourceId: reflection.captureId
        }
      },
      create: {
        workspaceId: reflection.workspaceId,
        sourceType: "CAPTURE",
        sourceId: reflection.captureId,
        title: reflection.capture.title || this.titleFromText(baseSummary) || "Reflection memory",
        summary: baseSummary || reflection.summary,
        tags: reflection.capture.tags,
        importance: reflection.capture.importance
      },
      update: {
        title: reflection.capture.title || this.titleFromText(baseSummary) || undefined,
        summary: baseSummary || reflection.summary,
        tags: reflection.capture.tags,
        importance: reflection.capture.importance
      }
    });
  }

  async syncFromStory(storyId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      include: {
        reflection: {
          include: { capture: true }
        }
      }
    });
    if (!story) throw new NotFoundException("Story not found.");

    const storySummary = [story.hook, story.context, story.conflict, story.insight, story.takeaway]
      .filter(Boolean)
      .join("\n\n");

    return this.prisma.memoryItem.upsert({
      where: {
        workspaceId_sourceType_sourceId: {
          workspaceId: story.workspaceId,
          sourceType: "CAPTURE",
          sourceId: story.reflection.captureId
        }
      },
      create: {
        workspaceId: story.workspaceId,
        sourceType: "CAPTURE",
        sourceId: story.reflection.captureId,
        title:
          story.title ||
          story.reflection.capture.title ||
          this.titleFromText(storySummary) ||
          "Story memory",
        summary: storySummary,
        tags: story.reflection.capture.tags,
        importance: story.reflection.capture.importance
      },
      update: {
        title: story.title || story.reflection.capture.title || undefined,
        summary: storySummary,
        tags: story.reflection.capture.tags,
        importance: story.reflection.capture.importance
      }
    });
  }

  async sync(sourceType: MemorySourceType, sourceId: string) {
    if (sourceType === "CAPTURE") return this.syncFromCapture(sourceId);
    if (sourceType === "REFLECTION") return this.syncFromReflection(sourceId);
    return this.syncFromStory(sourceId);
  }

  async syncForUser(userId: string, sourceType: MemorySourceType, sourceId: string) {
    const item = await this.sync(sourceType, sourceId);
    await this.ensureMemoryAccess(userId, item.workspaceId);
    return item;
  }

  async list(userId: string, query: { search?: string; tag?: string }) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.memoryItem.findMany({
      where: {
        workspaceId: workspace.id,
        ...(query.tag ? { tags: { has: query.tag } } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: "insensitive" } },
                { summary: { contains: query.search, mode: "insensitive" } },
                { tags: { has: query.search } }
              ]
            }
          : {})
      },
      orderBy: { updatedAt: "desc" },
      take: 100
    });
  }

  async search(userId: string, query: string) {
    return this.list(userId, { search: query });
  }

  async get(userId: string, id: string) {
    const item = await this.prisma.memoryItem.findUnique({
      where: { id },
      include: {
        linksFrom: { include: { toMemory: true } },
        linksTo: { include: { fromMemory: true } }
      }
    });
    await this.ensureMemoryAccess(userId, item?.workspaceId);
    return item;
  }

  async update(userId: string, id: string, input: MemoryInput) {
    const item = await this.prisma.memoryItem.findUnique({ where: { id } });
    await this.ensureMemoryAccess(userId, item?.workspaceId);
    return this.prisma.memoryItem.update({ where: { id }, data: input });
  }

  async createLink(
    userId: string,
    input: { fromMemoryId: string; toMemoryId: string; relation: MemoryRelation }
  ) {
    const [from, to] = await Promise.all([
      this.prisma.memoryItem.findUnique({ where: { id: input.fromMemoryId } }),
      this.prisma.memoryItem.findUnique({ where: { id: input.toMemoryId } })
    ]);
    await this.ensureMemoryAccess(userId, from?.workspaceId);
    await this.ensureMemoryAccess(userId, to?.workspaceId);

    if (from?.workspaceId !== to?.workspaceId) {
      throw new ForbiddenException("Cannot link memories from different workspaces.");
    }

    return this.prisma.memoryLink.upsert({
      where: {
        fromMemoryId_toMemoryId_relation: {
          fromMemoryId: input.fromMemoryId,
          toMemoryId: input.toMemoryId,
          relation: input.relation
        }
      },
      create: input,
      update: {}
    });
  }

  async deleteLink(userId: string, id: string) {
    const link = await this.prisma.memoryLink.findUnique({
      where: { id },
      include: { fromMemory: true }
    });
    await this.ensureMemoryAccess(userId, link?.fromMemory.workspaceId);
    await this.prisma.memoryLink.delete({ where: { id } });
    return { ok: true };
  }

  async summary(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const [count, recent] = await Promise.all([
      this.prisma.memoryItem.count({ where: { workspaceId: workspace.id } }),
      this.prisma.memoryItem.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { updatedAt: "desc" },
        take: 5
      })
    ]);
    return { count, recent };
  }

  private titleFromText(value?: string | null) {
    return value?.split(/\s+/).slice(0, 10).join(" ").slice(0, 160);
  }

  private async ensureMemoryAccess(userId: string, workspaceId?: string) {
    if (!workspaceId) {
      throw new NotFoundException("Memory item not found.");
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId }
      }
    });

    if (!membership) {
      throw new ForbiddenException("You do not have access to this memory.");
    }
  }
}
