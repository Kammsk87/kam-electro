import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

type ActivityEvent = {
  type: "CAPTURE" | "REFLECTION" | "STORY" | "DRAFT" | "PUBLICATION" | "COMPLETION";
  title: string;
  createdAt: Date;
};

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async summary(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const [captures, reflections, stories, drafts, publications, streak] = await Promise.all([
      this.prisma.capture.count({
        where: { workspaceId: workspace.id, status: { not: "DELETED" } }
      }),
      this.prisma.interviewSession.count({ where: { workspaceId: workspace.id } }),
      this.prisma.story.count({ where: { workspaceId: workspace.id } }),
      this.prisma.draft.count({ where: { workspaceId: workspace.id } }),
      this.prisma.publication.count({ where: { workspaceId: workspace.id } }),
      this.prisma.plannerStreak.findUnique({ where: { workspaceId: workspace.id } })
    ]);

    return {
      captures,
      reflections,
      stories,
      drafts,
      publications,
      streak: streak?.current ?? 0,
      longestStreak: streak?.longest ?? 0
    };
  }

  async heatmap(userId: string, days = 90) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const since = this.addDays(this.startOfDay(new Date()), -days + 1);
    const events = await this.activityEvents(workspace.id, since);
    const buckets = new Map<string, number>();

    for (let index = 0; index < days; index += 1) {
      buckets.set(this.dateKey(this.addDays(since, index)), 0);
    }

    for (const event of events) {
      const key = this.dateKey(event.createdAt);
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return [...buckets.entries()].map(([date, count]) => ({ date, count }));
  }

  async weeklyReport(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const since = this.addDays(this.startOfDay(new Date()), -6);
    return this.report(workspace.id, since, "Weekly Report");
  }

  async monthlyReport(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const since = this.addDays(this.startOfDay(new Date()), -29);
    return this.report(workspace.id, since, "Monthly Report");
  }

  private async report(workspaceId: string, since: Date, title: string) {
    const events = await this.activityEvents(workspaceId, since);
    const byType = events.reduce<Record<ActivityEvent["type"], number>>(
      (acc, event) => {
        acc[event.type] += 1;
        return acc;
      },
      { CAPTURE: 0, REFLECTION: 0, STORY: 0, DRAFT: 0, PUBLICATION: 0, COMPLETION: 0 }
    );
    const activeDays = new Set(events.map((event) => this.dateKey(event.createdAt))).size;

    return {
      title,
      since,
      until: new Date(),
      totals: byType,
      activeDays,
      totalActivity: events.length,
      highlights: this.highlights(byType, activeDays),
      recent: events
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, 10)
    };
  }

  private async activityEvents(workspaceId: string, since: Date): Promise<ActivityEvent[]> {
    const [captures, reflections, stories, drafts, publications, completions] = await Promise.all([
      this.prisma.capture.findMany({
        where: { workspaceId, createdAt: { gte: since }, status: { not: "DELETED" } },
        select: { title: true, sourceType: true, createdAt: true }
      }),
      this.prisma.interviewSession.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: { id: true, status: true, createdAt: true }
      }),
      this.prisma.story.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: { title: true, createdAt: true }
      }),
      this.prisma.draft.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: { title: true, platform: true, createdAt: true }
      }),
      this.prisma.publication.findMany({
        where: { workspaceId, createdAt: { gte: since } },
        select: { platform: true, status: true, createdAt: true }
      }),
      this.prisma.completionHistory.findMany({
        where: { workspaceId, completedAt: { gte: since } },
        select: { title: true, category: true, completedAt: true }
      })
    ]);

    return [
      ...captures.map((item) => ({
        type: "CAPTURE" as const,
        title: item.title || `${item.sourceType} capture`,
        createdAt: item.createdAt
      })),
      ...reflections.map((item) => ({
        type: "REFLECTION" as const,
        title: `${item.status} reflection`,
        createdAt: item.createdAt
      })),
      ...stories.map((item) => ({
        type: "STORY" as const,
        title: item.title || "Story",
        createdAt: item.createdAt
      })),
      ...drafts.map((item) => ({
        type: "DRAFT" as const,
        title: item.title || `${item.platform} draft`,
        createdAt: item.createdAt
      })),
      ...publications.map((item) => ({
        type: "PUBLICATION" as const,
        title: `${item.platform} ${item.status.toLowerCase()}`,
        createdAt: item.createdAt
      })),
      ...completions.map((item) => ({
        type: "COMPLETION" as const,
        title: item.title || `${item.category} completed`,
        createdAt: item.completedAt
      }))
    ];
  }

  private highlights(totals: Record<ActivityEvent["type"], number>, activeDays: number) {
    const lines = [`Active days: ${activeDays}`];
    if (totals.CAPTURE > 0) lines.push(`Captured ${totals.CAPTURE} moments.`);
    if (totals.REFLECTION > 0) lines.push(`Started or continued ${totals.REFLECTION} reflections.`);
    if (totals.STORY > 0) lines.push(`Created ${totals.STORY} stories.`);
    if (totals.DRAFT > 0) lines.push(`Produced ${totals.DRAFT} drafts.`);
    if (totals.PUBLICATION > 0) lines.push(`Prepared ${totals.PUBLICATION} publications.`);
    if (totals.COMPLETION > 0) lines.push(`Completed ${totals.COMPLETION} planner tasks.`);
    return lines;
  }

  private startOfDay(date: Date) {
    const next = new Date(date);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private dateKey(date: Date) {
    return this.startOfDay(date).toISOString().slice(0, 10);
  }
}
