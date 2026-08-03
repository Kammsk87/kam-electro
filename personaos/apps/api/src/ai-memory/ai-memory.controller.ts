import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { AiMemoryService } from "./ai-memory.service";

const limitSchema = z.coerce.number().int().min(1).max(25).default(10);

@Controller("ai-memory")
@UseGuards(AuthGuard)
export class AiMemoryController {
  constructor(private readonly aiMemoryService: AiMemoryService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.aiMemoryService.summary(user.id);
  }

  @Post("reindex")
  reindex(@CurrentUser() user: AuthUser) {
    return this.aiMemoryService.reindex(user.id);
  }

  @Get("search")
  search(@CurrentUser() user: AuthUser, @Query("query") query = "", @Query("limit") limit?: string) {
    return this.aiMemoryService.semanticSearch(user.id, query, limitSchema.parse(limit));
  }

  @Get("context")
  context(@CurrentUser() user: AuthUser, @Query("query") query = "", @Query("limit") limit?: string) {
    return this.aiMemoryService.context(user.id, query, limitSchema.parse(limit));
  }

  @Get(":id/similar")
  similar(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("limit") limit?: string) {
    return this.aiMemoryService.similar(user.id, id, limitSchema.parse(limit));
  }
}
