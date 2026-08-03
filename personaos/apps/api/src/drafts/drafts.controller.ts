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
import { DraftsService } from "./drafts.service";

const draftPlatformSchema = z.enum(["TELEGRAM", "INSTAGRAM", "THREADS", "VK"]);
const draftStatusSchema = z.enum(["DRAFT", "READY", "PUBLISHED", "ARCHIVED"]);

const draftSchema = z.object({
  title: z.string().max(300).optional().nullable(),
  content: z.string().min(1).max(50000).optional(),
  platform: draftPlatformSchema.optional(),
  status: draftStatusSchema.optional()
});

const rewriteSchema = z.object({
  mode: z
    .enum([
      "rewrite",
      "shorter",
      "longer",
      "more-personal",
      "more-practical",
      "more-sarcastic",
      "simplify"
    ])
    .default("rewrite")
});

@Controller("drafts")
@UseGuards(AuthGuard)
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("status") status?: string) {
    const parsedStatus = status ? draftStatusSchema.parse(status) : undefined;
    return this.draftsService.list(user.id, parsedStatus);
  }

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.draftsService.summary(user.id);
  }

  @Post("from-story/:storyId")
  createFromStory(
    @CurrentUser() user: AuthUser,
    @Param("storyId") storyId: string,
    @Body() body: unknown
  ) {
    const input = parseBody(
      z.object({ platform: draftPlatformSchema.default("TELEGRAM") }),
      body ?? {}
    );
    return this.draftsService.createFromStory(user.id, storyId, input.platform ?? "TELEGRAM");
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.draftsService.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.draftsService.update(user.id, id, parseBody(draftSchema, body));
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.draftsService.delete(user.id, id);
  }

  @Post(":id/rewrite")
  rewrite(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = parseBody(rewriteSchema, body ?? {});
    return this.draftsService.rewrite(user.id, id, input.mode);
  }
}
