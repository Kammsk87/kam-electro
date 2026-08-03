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
import { PublicationsService, type PublicationInput } from "./publications.service";

const publicationPlatformSchema = z.enum(["TELEGRAM", "INSTAGRAM", "THREADS", "VK"]);
const publicationStatusSchema = z.enum(["PLANNED", "READY", "PUBLISHED", "CANCELLED", "FAILED"]);
const dateSchema = z
  .string()
  .datetime()
  .optional()
  .nullable()
  .transform((value) => (value ? new Date(value) : value));

const publicationSchema = z.object({
  platform: publicationPlatformSchema.optional(),
  status: publicationStatusSchema.optional(),
  scheduledAt: dateSchema,
  publishedAt: dateSchema,
  externalUrl: z.string().url().optional().nullable(),
  notes: z.string().max(5000).optional().nullable()
});

function coerceDate(value: unknown): Date | null | undefined {
  if (value instanceof Date) return value;
  if (typeof value === "string" && value) return new Date(value);
  if (value === null) return null;
  return undefined;
}

function toPublicationInput(input: z.infer<typeof publicationSchema>): PublicationInput {
  return {
    ...input,
    scheduledAt: coerceDate(input.scheduledAt),
    publishedAt: coerceDate(input.publishedAt)
  };
}

@Controller("publications")
@UseGuards(AuthGuard)
export class PublicationsController {
  constructor(private readonly publicationsService: PublicationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("platform") platform?: string,
    @Query("status") status?: string
  ) {
    return this.publicationsService.list(user.id, {
      platform: platform ? publicationPlatformSchema.parse(platform) : undefined,
      status: status ? publicationStatusSchema.parse(status) : undefined
    });
  }

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.publicationsService.summary(user.id);
  }

  @Post("from-draft/:draftId")
  createFromDraft(
    @CurrentUser() user: AuthUser,
    @Param("draftId") draftId: string,
    @Body() body: unknown
  ) {
    const input = parseBody(
      z.object({ platform: publicationPlatformSchema.optional() }),
      body ?? {}
    );
    return this.publicationsService.createFromDraft(user.id, draftId, input.platform);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.publicationsService.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.publicationsService.update(
      user.id,
      id,
      toPublicationInput(parseBody(publicationSchema, body))
    );
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.publicationsService.delete(user.id, id);
  }

  @Post(":id/ready")
  ready(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.publicationsService.markReady(user.id, id);
  }

  @Post(":id/published")
  published(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = parseBody(publicationSchema.pick({ externalUrl: true, notes: true }), body ?? {});
    return this.publicationsService.markPublished(user.id, id, input);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.publicationsService.cancel(user.id, id);
  }
}
