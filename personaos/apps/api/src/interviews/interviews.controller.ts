import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { parseBody } from "../common/validation";
import { InterviewsService } from "./interviews.service";

const createInterviewSchema = z.object({
  captureId: z.string().min(1)
});

const updateInterviewSchema = z.object({
  status: z.enum(["NEW", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
  summary: z.string().max(2000).optional().nullable(),
  currentStep: z.number().int().min(0).optional()
});

const messageSchema = z.object({
  content: z.string().min(1).max(10000),
  metadata: z.unknown().optional().nullable()
});

@Controller("interviews")
@UseGuards(AuthGuard)
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("status") status?: string) {
    if (status === "open") {
      return this.interviewsService.listOpen(user.id);
    }
    return this.interviewsService.listOpen(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(createInterviewSchema, body);
    return this.interviewsService.create(user.id, input.captureId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.interviewsService.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.interviewsService.update(user.id, id, parseBody(updateInterviewSchema, body));
  }

  @Post(":id/messages")
  addMessage(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = parseBody(messageSchema, body);
    return this.interviewsService.addUserMessage(user.id, id, {
      content: input.content,
      metadata: input.metadata as Prisma.InputJsonValue | null | undefined
    });
  }

  @Patch(":id/messages/:messageId")
  editMessage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("messageId") messageId: string,
    @Body() body: unknown
  ) {
    const input = parseBody(messageSchema.pick({ content: true }), body);
    return this.interviewsService.editMessage(user.id, id, messageId, input.content);
  }

  @Delete(":id/messages/:messageId")
  deleteMessage(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("messageId") messageId: string) {
    return this.interviewsService.deleteMessage(user.id, id, messageId);
  }

  @Post(":id/pause")
  pause(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.interviewsService.pause(user.id, id);
  }

  @Post(":id/resume")
  resume(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.interviewsService.resume(user.id, id);
  }

  @Post(":id/complete")
  complete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.interviewsService.complete(user.id, id);
  }
}
