import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  PlannerTaskCategory,
  PlannerTaskPriority,
  PlannerTaskStatus,
  WeeklyGoalStatus
} from "@prisma/client";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

export type PlannerTaskInput = {
  title: string;
  description?: string | null;
  category: PlannerTaskCategory;
  priority?: PlannerTaskPriority;
  dueDate?: Date;
  sourceType?: string | null;
  sourceId?: string | null;
};

export type WeeklyGoalInput = {
  title: string;
  description?: string | null;
  targetCount?: number;
  weekStart?: Date;
};

@Injectable()
export class PlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async today(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    await this.ensureDailyPlan(workspace.id);
    const [tasks, weeklyGoals, streak, completionHistory] = await Promise.all([
      this.tasksForDate(workspace.id, new Date()),
      this.currentWeeklyGoals(workspace.id),
      this.getOrCreateStreak(workspace.id),
      this.prisma.completionHistory.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { completedAt: "desc" },
        take: 10
      })
    ]);

    return { tasks, weeklyGoals, streak, completionHistory };
  }

  async listTasks(userId: string, status?: PlannerTaskStatus) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.plannerTask.findMany({
      where: { workspaceId: workspace.id, status },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }]
    });
  }

  async createTask(userId: string, input: PlannerTaskInput) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.plannerTask.create({
      data: {
        workspaceId: workspace.id,
        title: input.title,
        description: input.description,
        category: input.category,
        priority: input.priority ?? "MEDIUM",
        dueDate: input.dueDate ?? new Date(),
        sourceType: input.sourceType,
        sourceId: input.sourceId
      }
    });
  }

  async updateTask(
    userId: string,
    id: string,
    input: Partial<PlannerTaskInput> & { status?: PlannerTaskStatus }
  ) {
    const task = await this.prisma.plannerTask.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, task?.workspaceId);
    return this.prisma.plannerTask.update({ where: { id }, data: input });
  }

  async completeTask(userId: string, id: string) {
    const task = await this.prisma.plannerTask.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, task?.workspaceId);
    if (!task) throw new NotFoundException("Planner task not found.");

    return this.prisma.$transaction(async (tx) => {
      const completed = await tx.plannerTask.update({
        where: { id },
        data: { status: "DONE", completedAt: new Date() }
      });

      await tx.completionHistory.create({
        data: {
          workspaceId: task.workspaceId,
          taskId: task.id,
          title: task.title,
          category: task.category
        }
      });

      const streak = await tx.plannerStreak.upsert({
        where: { workspaceId: task.workspaceId },
        create: {
          workspaceId: task.workspaceId,
          current: 1,
          longest: 1,
          lastCompletedAt: new Date()
        },
        update: {}
      });
      const nextCurrent = this.nextStreak(streak.lastCompletedAt, streak.current);
      await tx.plannerStreak.update({
        where: { workspaceId: task.workspaceId },
        data: {
          current: nextCurrent,
          longest: Math.max(streak.longest, nextCurrent),
          lastCompletedAt: new Date()
        }
      });

      await tx.weeklyGoal.updateMany({
        where: {
          workspaceId: task.workspaceId,
          status: "ACTIVE",
          weekStart: this.weekStart(new Date())
        },
        data: { completedCount: { increment: 1 } }
      });

      return completed;
    });
  }

  async skipTask(userId: string, id: string) {
    const task = await this.prisma.plannerTask.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, task?.workspaceId);
    return this.prisma.plannerTask.update({ where: { id }, data: { status: "SKIPPED" } });
  }

  async listWeeklyGoals(userId: string, status?: WeeklyGoalStatus) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.weeklyGoal.findMany({
      where: { workspaceId: workspace.id, status },
      orderBy: { weekStart: "desc" }
    });
  }

  async createWeeklyGoal(userId: string, input: WeeklyGoalInput) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.weeklyGoal.create({
      data: {
        workspaceId: workspace.id,
        title: input.title,
        description: input.description,
        targetCount: input.targetCount ?? 5,
        weekStart: input.weekStart ?? this.weekStart(new Date())
      }
    });
  }

  async updateWeeklyGoal(
    userId: string,
    id: string,
    input: Partial<WeeklyGoalInput> & { status?: WeeklyGoalStatus }
  ) {
    const goal = await this.prisma.weeklyGoal.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, goal?.workspaceId);
    return this.prisma.weeklyGoal.update({ where: { id }, data: input });
  }

  async summary(userId: string) {
    const today = await this.today(userId);
    const done = today.tasks.filter((task) => task.status === "DONE").length;
    return {
      tasksToday: today.tasks.length,
      doneToday: done,
      openToday: today.tasks.length - done,
      weeklyGoals: today.weeklyGoals.length,
      streak: today.streak.current
    };
  }

  private async ensureDailyPlan(workspaceId: string) {
    const dueDate = this.startOfDay(new Date());
    const existing = await this.prisma.plannerTask.count({
      where: {
        workspaceId,
        dueDate: { gte: dueDate, lt: this.addDays(dueDate, 1) }
      }
    });
    if (existing > 0) return;

    const [openInterviews, draftStories, draftDrafts, plannedPublications] = await Promise.all([
      this.prisma.interviewSession.count({
        where: { workspaceId, status: { in: ["NEW", "ACTIVE", "PAUSED"] } }
      }),
      this.prisma.story.count({ where: { workspaceId, status: "DRAFT" } }),
      this.prisma.draft.count({ where: { workspaceId, status: "DRAFT" } }),
      this.prisma.publication.count({ where: { workspaceId, status: "PLANNED" } })
    ]);

    const tasks: PlannerTaskInput[] = [
      {
        title: "Capture one real moment",
        description: "Сохрани одну мысль, событие или наблюдение дня.",
        category: "CAPTURE",
        priority: "HIGH",
        dueDate
      }
    ];

    if (openInterviews > 0) {
      tasks.push({
        title: "Continue one Reflection",
        description: "Вернись к незавершённому интервью и добавь один честный ответ.",
        category: "REFLECTION",
        priority: "HIGH",
        dueDate
      });
    }

    if (draftStories > 0) {
      tasks.push({
        title: "Move one Story forward",
        description: "Открой Story Draft и доведи один блок до ясности.",
        category: "STORY",
        priority: "MEDIUM",
        dueDate
      });
    }

    if (draftDrafts > 0) {
      tasks.push({
        title: "Polish one Draft",
        description: "Открой Draft, перечитай и отметь как Ready, если он достаточно честный.",
        category: "WRITING",
        priority: "MEDIUM",
        dueDate
      });
    }

    if (plannedPublications > 0) {
      tasks.push({
        title: "Check planned Publications",
        description: "Проверь запланированные публикации и вручную отметь готовые.",
        category: "PUBLISHING",
        priority: "LOW",
        dueDate
      });
    }

    await this.prisma.plannerTask.createMany({
      data: tasks.map((task) => ({ ...task, workspaceId, dueDate: task.dueDate ?? dueDate }))
    });

    const weeklyGoals = await this.currentWeeklyGoals(workspaceId);
    if (!weeklyGoals.length) {
      await this.prisma.weeklyGoal.create({
        data: {
          workspaceId,
          title: "Build a week of lived material",
          description:
            "Минимум 5 завершённых действий: capture, reflection, story, draft или publication.",
          weekStart: this.weekStart(new Date()),
          targetCount: 5
        }
      });
    }
  }

  private tasksForDate(workspaceId: string, date: Date) {
    const start = this.startOfDay(date);
    return this.prisma.plannerTask.findMany({
      where: { workspaceId, dueDate: { gte: start, lt: this.addDays(start, 1) } },
      orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "asc" }]
    });
  }

  private currentWeeklyGoals(workspaceId: string) {
    return this.prisma.weeklyGoal.findMany({
      where: { workspaceId, weekStart: this.weekStart(new Date()), status: "ACTIVE" },
      orderBy: { createdAt: "asc" }
    });
  }

  private getOrCreateStreak(workspaceId: string) {
    return this.prisma.plannerStreak.upsert({
      where: { workspaceId },
      create: { workspaceId },
      update: {}
    });
  }

  private nextStreak(lastCompletedAt: Date | null, current: number) {
    if (!lastCompletedAt) return 1;
    const last = this.startOfDay(lastCompletedAt).getTime();
    const today = this.startOfDay(new Date()).getTime();
    if (last === today) return current;
    if (last === this.addDays(this.startOfDay(new Date()), -1).getTime()) return current + 1;
    return 1;
  }

  private weekStart(date: Date) {
    const start = this.startOfDay(date);
    const day = start.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return this.addDays(start, diff);
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

  private async ensureWorkspaceAccess(userId: string, workspaceId?: string) {
    if (!workspaceId) throw new NotFoundException("Planner item not found.");
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } }
    });
    if (!membership) throw new ForbiddenException("You do not have access to this planner item.");
  }
}
