import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { parseBody } from "../common/validation";
import { MemoryService } from "./memory.service";

const sourceTypeSchema = z.enum(["CAPTURE", "REFLECTION", "STORY"]);
const importanceSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const relationSchema = z.enum(["RELATED", "SIMILAR", "FOLLOWUP", "CONTRADICTION"]);

const updateMemorySchema = z.object({
  title: z.string().max(300).optional().nullable(),
  summary: z.string().max(20000).optional().nullable(),
  tags: z.array(z.string().min(1).max(60)).max(50).optional(),
  importance: importanceSchema.optional()
});

@Controller("memory")
@UseGuards(AuthGuard)
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("search") search?: string,
    @Query("tag") tag?: string
  ) {
    return this.memoryService.list(user.id, { search, tag });
  }

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.memoryService.summary(user.id);
  }

  @Post("sync")
  sync(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(
      z.object({ sourceType: sourceTypeSchema, sourceId: z.string().min(1) }),
      body
    );
    return this.memoryService.syncForUser(user.id, input.sourceType, input.sourceId);
  }

  @Post("link")
  createLink(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(
      z.object({
        fromMemoryId: z.string().min(1),
        toMemoryId: z.string().min(1),
        relation: relationSchema
      }),
      body
    );
    return this.memoryService.createLink(user.id, input);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.memoryService.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.memoryService.update(user.id, id, parseBody(updateMemorySchema, body));
  }

  @Delete("link/:id")
  deleteLink(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.memoryService.deleteLink(user.id, id);
  }
}
