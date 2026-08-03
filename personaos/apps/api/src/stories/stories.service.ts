import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { StoryStatus } from "@prisma/client";
import { MemoryService } from "../memory/memory.service";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

export type StoryInput = {
  title?: string | null;
  hook?: string | null;
  context?: string | null;
  conflict?: string | null;
  insight?: string | null;
  takeaway?: string | null;
  status?: StoryStatus;
};

type ReflectionMessage = {
  role: string;
  content: string;
};

@Injectable()
export class StoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
    private readonly memoryService: MemoryService
  ) {}

  async list(userId: string, status?: StoryStatus) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.story.findMany({
      where: {
        workspaceId: workspace.id,
        status: status ?? undefined
      },
      include: {
        reflection: {
          include: { capture: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    });
  }

  async get(userId: string, id: string) {
    const story = await this.prisma.story.findUnique({
      where: { id },
      include: {
        reflection: {
          include: {
            capture: true,
            messages: { orderBy: { createdAt: "asc" } }
          }
        }
      }
    });
    await this.ensureWorkspaceAccess(userId, story?.workspaceId);
    return story;
  }

  async create(userId: string, input: StoryInput & { reflectionId: string }) {
    const reflection = await this.prisma.interviewSession.findUnique({
      where: { id: input.reflectionId }
    });
    await this.ensureWorkspaceAccess(userId, reflection?.workspaceId);

    const story = await this.prisma.story.create({
      data: {
        workspaceId: reflection!.workspaceId,
        reflectionId: input.reflectionId,
        title: input.title ?? null,
        hook: input.hook ?? null,
        context: input.context ?? null,
        conflict: input.conflict ?? null,
        insight: input.insight ?? null,
        takeaway: input.takeaway ?? null,
        status: input.status ?? "DRAFT"
      }
    });
    await this.memoryService.syncFromStory(story.id);
    return story;
  }

  async createFromReflection(userId: string, reflectionId: string) {
    const reflection = await this.prisma.interviewSession.findUnique({
      where: { id: reflectionId },
      include: {
        capture: true,
        messages: { orderBy: { createdAt: "asc" } }
      }
    });
    await this.ensureWorkspaceAccess(userId, reflection?.workspaceId);

    if (!reflection) {
      throw new NotFoundException("Reflection not found.");
    }

    const existing = await this.prisma.story.findUnique({
      where: { reflectionId: reflection.id }
    });

    if (existing) {
      return existing;
    }

    const draft = this.buildStoryDraft({
      captureTitle: reflection.capture.title,
      captureDescription: reflection.capture.description ?? reflection.capture.transcript,
      messages: reflection.messages
    });

    const story = await this.prisma.story.create({
      data: {
        workspaceId: reflection.workspaceId,
        reflectionId: reflection.id,
        ...draft,
        status: "DRAFT"
      }
    });
    await this.memoryService.syncFromStory(story.id);
    return story;
  }

  async update(userId: string, id: string, input: StoryInput) {
    const story = await this.prisma.story.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, story?.workspaceId);

    const updated = await this.prisma.story.update({
      where: { id },
      data: input,
      include: {
        reflection: {
          include: { capture: true }
        }
      }
    });
    await this.memoryService.syncFromStory(updated.id);
    return updated;
  }

  async delete(userId: string, id: string) {
    const story = await this.prisma.story.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, story?.workspaceId);
    await this.prisma.story.delete({ where: { id } });
    return { ok: true };
  }

  async summary(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const [draft, ready] = await Promise.all([
      this.prisma.story.count({ where: { workspaceId: workspace.id, status: "DRAFT" } }),
      this.prisma.story.count({ where: { workspaceId: workspace.id, status: "READY" } })
    ]);

    return { draft, ready };
  }

  private buildStoryDraft(input: {
    captureTitle: string | null;
    captureDescription: string | null;
    messages: ReflectionMessage[];
  }) {
    const answers = input.messages
      .filter((message) => message.role === "USER")
      .map((message) => message.content.trim())
      .filter(Boolean);

    const context = this.pick(answers, [0, 1]) ?? input.captureDescription ?? "";
    const conflict = this.pick(answers, [2, 3, 4]) ?? "";
    const insight = this.pick(answers, [5, 6, 7]) ?? "";
    const takeaway = this.pick(answers, [8, 6]) ?? "";
    const hook = this.buildHook(answers, input.captureTitle);

    return {
      title: input.captureTitle || this.firstSentence(context) || "Новая история",
      hook,
      context,
      conflict,
      insight,
      takeaway
    };
  }

  private pick(answers: string[], positions: number[]) {
    const blocks = positions.map((position) => answers[position]).filter(Boolean);
    return blocks.length ? blocks.join("\n\n") : null;
  }

  private buildHook(answers: string[], captureTitle: string | null) {
    const candidates = [answers[4], answers[2], answers[0], captureTitle].filter(Boolean);
    return this.firstSentence(candidates[0] ?? "") || null;
  }

  private firstSentence(value: string) {
    return value
      .split(/(?<=[.!?])\s+/u)
      .find(Boolean)
      ?.slice(0, 180)
      .trim();
  }

  private async ensureWorkspaceAccess(userId: string, workspaceId?: string) {
    if (!workspaceId) {
      throw new NotFoundException("Story not found.");
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId }
      }
    });

    if (!membership) {
      throw new ForbiddenException("You do not have access to this story.");
    }
  }
}
