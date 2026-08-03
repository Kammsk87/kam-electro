import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { parseBody } from "../common/validation";
import { AuthorProfileService } from "./author-profile.service";

const authorProfileSchema = z.object({
  displayName: z.string().min(2).max(80),
  bio: z.string().max(500).optional().nullable(),
  positioning: z.string().max(500).optional().nullable(),
  mainTopics: z.array(z.string().min(1).max(60)).min(1).max(20),
  forbiddenTopics: z.array(z.string().min(1).max(80)).max(20).default([]),
  toneOfVoice: z.array(z.string().min(1).max(80)).min(1).max(20),
  sarcasmLevel: z.number().int().min(1).max(5),
  depthLevel: z.number().int().min(1).max(5),
  personalLevel: z.number().int().min(1).max(5),
  expertiseLevel: z.number().int().min(1).max(5),
  preferredPostLength: z.enum(["SHORT", "MEDIUM", "LONG", "MIXED"]),
  contentGoals: z.array(z.string().min(1).max(100)).max(20).default([])
});

@Controller("author-profile")
@UseGuards(AuthGuard)
export class AuthorProfileController {
  constructor(private readonly authorProfileService: AuthorProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.authorProfileService.getForCurrentWorkspace(user.id);
  }

  @Put()
  upsert(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(authorProfileSchema, body);
    return this.authorProfileService.upsertForCurrentWorkspace(
      user.id,
      {
        ...input,
        forbiddenTopics: input.forbiddenTopics ?? [],
        contentGoals: input.contentGoals ?? []
      }
    );
  }
}
