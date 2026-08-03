import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { parseBody } from "../common/validation";
import { OrchestratorService } from "./orchestrator.service";

const typeSchema = z.enum([
  "MEMORY_EMBED",
  "MEMORY_SEARCH",
  "PLANNER_RECOMMEND",
  "RESEARCH_SCAN",
  "WRITING_REWRITE",
  "PUBLISHING_SYNC"
]);
const prioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]);
const statusSchema = z.enum(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]);

@Controller("orchestrator")
@UseGuards(AuthGuard)
export class OrchestratorController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.orchestratorService.summary(user.id);
  }

  @Get("jobs")
  jobs(@CurrentUser() user: AuthUser, @Query("status") status?: string) {
    return this.orchestratorService.list(user.id, status ? statusSchema.parse(status) : undefined);
  }

  @Post("jobs")
  queue(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(
      z.object({
        type: typeSchema,
        priority: prioritySchema.optional(),
        payload: z.unknown().optional(),
        runAfter: z.string().datetime().optional().nullable()
      }),
      body
    );
    const runAfter: Date | null | undefined =
      typeof input.runAfter === "string" ? new Date(input.runAfter) : input.runAfter;
    return this.orchestratorService.queue(user.id, {
      type: input.type,
      priority: input.priority,
      payload: input.payload,
      runAfter
    });
  }

  @Post("process-next")
  processNext(@CurrentUser() user: AuthUser) {
    return this.orchestratorService.processNext(user.id);
  }

  @Post("jobs/:id/retry")
  retry(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.orchestratorService.retry(user.id, id);
  }

  @Post("jobs/:id/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.orchestratorService.cancel(user.id, id);
  }
}
