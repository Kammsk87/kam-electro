import { Injectable } from "@nestjs/common";
import type { AiPlannerRecommendationType } from "@prisma/client";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

@Injectable()
export class AiPlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async recommendations(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.aiPlannerRecommendation.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 30
    });
  }

  async generate(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const [memories, openReflections, draftStories, persona] = await Promise.all([
      this.prisma.memoryItem.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { updatedAt: "desc" },
        take: 8
      }),
      this.prisma.interviewSession.count({
        where: { workspaceId: workspace.id, status: { in: ["NEW", "ACTIVE", "PAUSED"] } }
      }),
      this.prisma.story.count({ where: { workspaceId: workspace.id, status: "DRAFT" } }),
      this.prisma.personaProfile.findUnique({ where: { workspaceId: workspace.id } })
    ]);

    const recommendations = [
      this.recommendation("DAILY_TASK", "Return to one unfinished thought", "Reflection is where raw experience becomes meaning."),
      openReflections > 0
        ? this.recommendation("FOLLOW_UP", "Finish one open Reflection", `There are ${openReflections} conversations waiting for one more honest answer.`)
        : null,
      draftStories > 0
        ? this.recommendation("FOLLOW_UP", "Move one Story to ready", `There are ${draftStories} Story drafts with enough material to sharpen.`)
        : null,
      persona?.themes.length
        ? this.recommendation("WEEKLY_THEME", `Theme of the week: ${persona.themes[0]}`, "This theme already belongs to the author DNA.")
        : null,
      memories[0]
        ? this.recommendation("IDEA_OF_DAY", memories[0].title || "Use a recent memory", "Recent lived material is usually warmer than abstract ideas.")
        : null
    ].filter(Boolean) as Array<{
      type: AiPlannerRecommendationType;
      title: string;
      reason: string;
    }>;

    await this.prisma.aiPlannerRecommendation.createMany({
      data: recommendations.map((item) => ({
        workspaceId: workspace.id,
        type: item.type,
        title: item.title,
        reason: item.reason,
        dueDate: new Date(),
        source: { generatedBy: "ai-planner-lite" }
      }))
    });

    return this.recommendations(userId);
  }

  async accept(userId: string, id: string) {
    const recommendation = await this.prisma.aiPlannerRecommendation.findUnique({ where: { id } });
    if (!recommendation) return null;
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    if (recommendation.workspaceId !== workspace.id) return null;

    const task = await this.prisma.plannerTask.create({
      data: {
        workspaceId: workspace.id,
        title: recommendation.title,
        description: recommendation.reason,
        category: "CAPTURE",
        priority: "MEDIUM",
        dueDate: recommendation.dueDate ?? new Date(),
        sourceType: "AI_PLANNER_RECOMMENDATION",
        sourceId: recommendation.id
      }
    });
    await this.prisma.aiPlannerRecommendation.update({
      where: { id },
      data: { status: "DONE" }
    });
    return task;
  }

  async summary(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const [open, generated] = await Promise.all([
      this.prisma.aiPlannerRecommendation.count({ where: { workspaceId: workspace.id, status: "TODO" } }),
      this.prisma.aiPlannerRecommendation.count({ where: { workspaceId: workspace.id } })
    ]);
    return { open, generated };
  }

  private recommendation(type: AiPlannerRecommendationType, title: string, reason: string) {
    return { type, title, reason };
  }
}
