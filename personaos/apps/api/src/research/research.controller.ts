import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { parseBody } from "../common/validation";
import { ResearchService } from "./research.service";

const sourceSchema = z.enum(["TELEGRAM", "INSTAGRAM", "THREADS", "VK", "MANUAL"]);
const typeSchema = z.enum(["TREND", "COMPETITOR", "TOPIC", "FORMAT"]);
const researchSchema = z.object({
  source: sourceSchema,
  type: typeSchema,
  title: z.string().min(1).max(240),
  summary: z.string().max(4000).optional().nullable(),
  url: z.string().url().optional().nullable(),
  relevance: z.number().min(0).max(1).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional()
});

@Controller("research")
@UseGuards(AuthGuard)
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("source") source?: string, @Query("type") type?: string) {
    return this.researchService.list(user.id, {
      source: source ? sourceSchema.parse(source) : undefined,
      type: type ? typeSchema.parse(type) : undefined
    });
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.researchService.create(user.id, parseBody(researchSchema, body));
  }

  @Post("scan")
  scan(@CurrentUser() user: AuthUser) {
    return this.researchService.scan(user.id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.researchService.update(user.id, id, parseBody(researchSchema.partial(), body));
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.researchService.delete(user.id, id);
  }
}
