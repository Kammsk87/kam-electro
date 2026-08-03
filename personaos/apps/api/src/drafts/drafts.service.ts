import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { DraftPlatform, DraftStatus } from "@prisma/client";
import { AiService } from "../ai/ai.service";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { buildFallbackDraft, buildRewritePrompt, buildWritingPrompt } from "./writing-prompts";

export type DraftInput = {
  title?: string | null;
  content?: string;
  platform?: DraftPlatform;
  status?: DraftStatus;
};

const rewriteInstructions = {
  rewrite: "Improve readability and flow while preserving meaning.",
  shorter: "Make the draft shorter while preserving all core facts and the main takeaway.",
  longer: "Make the draft slightly more developed using only existing facts from the draft.",
  "more-personal": "Make the draft feel more personal without adding new emotions or events.",
  "more-practical": "Make the draft more practical and useful without changing the story.",
  "more-sarcastic": "Add a bit more dry sarcasm only where it is already supported by the text.",
  simplify: "Simplify the language. Keep the meaning and facts unchanged."
} as const;

export type RewriteMode = keyof typeof rewriteInstructions;

@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
    private readonly aiService: AiService
  ) {}

  async list(userId: string, status?: DraftStatus) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.draft.findMany({
      where: {
        workspaceId: workspace.id,
        status: status ?? undefined
      },
      include: { story: true },
      orderBy: { updatedAt: "desc" }
    });
  }

  async get(userId: string, id: string) {
    const draft = await this.prisma.draft.findUnique({
      where: { id },
      include: {
        story: true,
        versions: { orderBy: { createdAt: "desc" } }
      }
    });
    await this.ensureWorkspaceAccess(userId, draft?.workspaceId);
    return draft;
  }

  async createFromStory(userId: string, storyId: string, platform: DraftPlatform) {
    const story = await this.prisma.story.findUnique({ where: { id: storyId } });
    await this.ensureWorkspaceAccess(userId, story?.workspaceId);

    if (!story) {
      throw new NotFoundException("Story not found.");
    }

    const existing = await this.prisma.draft.findUnique({
      where: { storyId_platform: { storyId, platform } },
      include: { versions: { orderBy: { createdAt: "desc" } }, story: true }
    });

    if (existing) {
      return existing;
    }

    const prompt = buildWritingPrompt(story, platform);
    const fallback = buildFallbackDraft(story, platform);
    const aiResult = await this.aiService.generate({
      ...prompt,
      temperature: 0.25,
      fallback
    });

    const content = aiResult.content || fallback;

    return this.prisma.draft.create({
      data: {
        workspaceId: story.workspaceId,
        storyId,
        platform,
        title: story.title,
        content,
        status: "DRAFT",
        versions: {
          create: {
            title: story.title,
            content,
            reason: `Created from Story via ${aiResult.provider}`
          }
        }
      },
      include: {
        story: true,
        versions: { orderBy: { createdAt: "desc" } }
      }
    });
  }

  async update(userId: string, id: string, input: DraftInput) {
    const draft = await this.prisma.draft.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, draft?.workspaceId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.draft.update({
        where: { id },
        data: input,
        include: { story: true }
      });

      await tx.draftVersion.create({
        data: {
          draftId: id,
          title: updated.title,
          content: updated.content,
          reason: "Manual update"
        }
      });

      return updated;
    });
  }

  async rewrite(userId: string, id: string, mode: RewriteMode = "rewrite") {
    const draft = await this.prisma.draft.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, draft?.workspaceId);

    if (!draft) {
      throw new NotFoundException("Draft not found.");
    }

    const prompt = buildRewritePrompt({
      platform: draft.platform,
      currentContent: draft.content,
      instruction: rewriteInstructions[mode]
    });

    const aiResult = await this.aiService.rewrite({
      ...prompt,
      temperature: 0.25,
      fallback: draft.content
    });
    const content = aiResult.content || draft.content;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.draft.update({
        where: { id },
        data: { content },
        include: { story: true }
      });

      await tx.draftVersion.create({
        data: {
          draftId: id,
          title: updated.title,
          content: updated.content,
          reason: `Rewrite: ${mode} via ${aiResult.provider}`
        }
      });

      return updated;
    });
  }

  async delete(userId: string, id: string) {
    const draft = await this.prisma.draft.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, draft?.workspaceId);
    await this.prisma.draft.delete({ where: { id } });
    return { ok: true };
  }

  async summary(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const [ready, inProgress] = await Promise.all([
      this.prisma.draft.count({ where: { workspaceId: workspace.id, status: "READY" } }),
      this.prisma.draft.count({ where: { workspaceId: workspace.id, status: "DRAFT" } })
    ]);
    return { ready, inProgress };
  }

  private async ensureWorkspaceAccess(userId: string, workspaceId?: string) {
    if (!workspaceId) {
      throw new NotFoundException("Draft not found.");
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId }
      }
    });

    if (!membership) {
      throw new ForbiddenException("You do not have access to this draft.");
    }
  }
}
