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
import { StoriesService } from "./stories.service";

const storyStatusSchema = z.enum(["DRAFT", "READY", "ARCHIVED"]);

const storySchema = z.object({
  reflectionId: z.string().min(1).optional(),
  title: z.string().max(300).optional().nullable(),
  hook: z.string().max(2000).optional().nullable(),
  context: z.string().max(10000).optional().nullable(),
  conflict: z.string().max(10000).optional().nullable(),
  insight: z.string().max(10000).optional().nullable(),
  takeaway: z.string().max(10000).optional().nullable(),
  status: storyStatusSchema.optional()
});

@Controller("stories")
@UseGuards(AuthGuard)
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("status") status?: string) {
    const parsedStatus = status ? storyStatusSchema.parse(status) : undefined;
    return this.storiesService.list(user.id, parsedStatus);
  }

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.storiesService.summary(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(storySchema.required({ reflectionId: true }), body);
    return this.storiesService.create(user.id, input);
  }

  @Post("from-reflection/:reflectionId")
  createFromReflection(@CurrentUser() user: AuthUser, @Param("reflectionId") reflectionId: string) {
    return this.storiesService.createFromReflection(user.id, reflectionId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.storiesService.get(user.id, id);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    return this.storiesService.update(
      user.id,
      id,
      parseBody(storySchema.omit({ reflectionId: true }), body)
    );
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.storiesService.delete(user.id, id);
  }
}
