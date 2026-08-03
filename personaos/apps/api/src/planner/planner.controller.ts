import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { parseBody } from "../common/validation";
import { PlannerService } from "./planner.service";

const categorySchema = z.enum(["CAPTURE", "REFLECTION", "STORY", "WRITING", "PUBLISHING"]);
const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
const taskStatusSchema = z.enum(["TODO", "DONE", "SKIPPED"]);
const weeklyGoalStatusSchema = z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]);

const taskSchema = z.object({
  title: z.string().min(1).max(240),
  description: z.string().max(1000).optional().nullable(),
  category: categorySchema,
  priority: prioritySchema.optional(),
  dueDate: z.string().datetime().optional(),
  sourceType: z.string().max(80).optional().nullable(),
  sourceId: z.string().max(160).optional().nullable()
});

const updateTaskSchema = taskSchema.partial().extend({
  status: taskStatusSchema.optional()
});

const weeklyGoalSchema = z.object({
  title: z.string().min(1).max(240),
  description: z.string().max(1000).optional().nullable(),
  targetCount: z.number().int().min(1).max(100).optional(),
  weekStart: z.string().datetime().optional()
});

function withDueDate<T extends { dueDate?: string }>(input: T) {
  return { ...input, dueDate: input.dueDate ? new Date(input.dueDate) : undefined };
}

function withWeekStart<T extends { weekStart?: string }>(input: T) {
  return { ...input, weekStart: input.weekStart ? new Date(input.weekStart) : undefined };
}

@Controller("planner")
@UseGuards(AuthGuard)
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  @Get("today")
  today(@CurrentUser() user: AuthUser) {
    return this.plannerService.today(user.id);
  }

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.plannerService.summary(user.id);
  }

  @Get("tasks")
  tasks(@CurrentUser() user: AuthUser, @Query("status") status?: string) {
    return this.plannerService.listTasks(
      user.id,
      status ? taskStatusSchema.parse(status) : undefined
    );
  }

  @Post("tasks")
  createTask(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.plannerService.createTask(user.id, withDueDate(parseBody(taskSchema, body)));
  }

  @Patch("tasks/:id")
  updateTask(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.plannerService.updateTask(
      user.id,
      id,
      withDueDate(parseBody(updateTaskSchema, body))
    );
  }

  @Post("tasks/:id/complete")
  completeTask(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.plannerService.completeTask(user.id, id);
  }

  @Post("tasks/:id/skip")
  skipTask(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.plannerService.skipTask(user.id, id);
  }

  @Get("weekly-goals")
  weeklyGoals(@CurrentUser() user: AuthUser, @Query("status") status?: string) {
    return this.plannerService.listWeeklyGoals(
      user.id,
      status ? weeklyGoalStatusSchema.parse(status) : undefined
    );
  }

  @Post("weekly-goals")
  createWeeklyGoal(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.plannerService.createWeeklyGoal(
      user.id,
      withWeekStart(parseBody(weeklyGoalSchema, body))
    );
  }

  @Patch("weekly-goals/:id")
  updateWeeklyGoal(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.plannerService.updateWeeklyGoal(
      user.id,
      id,
      withWeekStart(
        parseBody(
          weeklyGoalSchema.partial().extend({ status: weeklyGoalStatusSchema.optional() }),
          body
        )
      )
    );
  }
}
