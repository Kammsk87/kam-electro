import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { parseBody } from "../common/validation";
import { CapturesService } from "./captures.service";

const sourceTypeSchema = z.enum(["PHOTO", "VIDEO", "VOICE", "TEXT", "LINK", "LOCATION", "MIXED"]);
const statusSchema = z.enum(["NEW", "REVIEWED", "ARCHIVED", "DELETED"]);
const emotionSchema = z.enum(["UNKNOWN", "HAPPY", "SAD", "SURPRISED", "EXCITED", "ANGRY", "THOUGHTFUL"]);
const importanceSchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

const captureSchema = z.object({
  sourceType: sourceTypeSchema,
  title: z.string().max(160).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  transcript: z.string().max(10000).optional().nullable(),
  media: z.unknown().optional().nullable(),
  location: z.unknown().optional().nullable(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  status: statusSchema.optional(),
  emotion: emotionSchema.optional(),
  importance: importanceSchema.optional(),
  context: z.unknown().optional().nullable(),
  isFavorite: z.boolean().optional()
});

const updateCaptureSchema = captureSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: statusSchema.optional(),
  sourceType: sourceTypeSchema.optional(),
  favorite: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  search: z.string().max(200).optional(),
  tag: z.string().max(40).optional()
});

@Controller("captures")
@UseGuards(AuthGuard)
export class CapturesController {
  constructor(private readonly capturesService: CapturesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    const parsed = listQuerySchema.parse(query);
    return this.capturesService.list(user.id, parsed);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const parsed = parseBody(captureSchema, body);
    return this.capturesService.create(user.id, {
      ...parsed,
      media: parsed.media as Prisma.InputJsonValue | null | undefined,
      location: parsed.location as Prisma.InputJsonValue | null | undefined,
      context: parsed.context as Prisma.InputJsonValue | null | undefined
    });
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.capturesService.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const parsed = parseBody(updateCaptureSchema, body);
    return this.capturesService.update(user.id, id, {
      ...parsed,
      media: parsed.media as Prisma.InputJsonValue | null | undefined,
      location: parsed.location as Prisma.InputJsonValue | null | undefined,
      context: parsed.context as Prisma.InputJsonValue | null | undefined
    });
  }

  @Patch(":id/favorite")
  toggleFavorite(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.capturesService.toggleFavorite(user.id, id);
  }

  @Patch(":id/archive")
  archive(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.capturesService.archive(user.id, id);
  }

  @Patch(":id/restore")
  restore(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.capturesService.restore(user.id, id);
  }

  @Delete(":id")
  softDelete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.capturesService.softDelete(user.id, id);
  }
}
