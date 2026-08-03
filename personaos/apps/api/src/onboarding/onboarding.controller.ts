import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { parseBody } from "../common/validation";
import { OnboardingService } from "./onboarding.service";

const onboardingSchema = z.object({
  user: z.object({
    name: z.string().min(2).max(80),
    bio: z.string().min(2).max(500),
    occupation: z.string().min(2).max(160)
  }),
  workspace: z.object({
    name: z.string().min(2).max(120),
    description: z.string().min(2).max(500)
  }),
  authorProfile: z.object({
    displayName: z.string().min(2).max(80),
    bio: z.string().min(2).max(500),
    positioning: z.string().min(2).max(500),
    mainTopics: z.array(z.string().min(1).max(60)).min(1).max(20),
    forbiddenTopics: z.array(z.string().min(1).max(80)).max(20),
    toneOfVoice: z.array(z.string().min(1).max(80)).min(1).max(20),
    sarcasmLevel: z.number().int().min(1).max(5),
    depthLevel: z.number().int().min(1).max(5),
    personalLevel: z.number().int().min(1).max(5),
    expertiseLevel: z.number().int().min(1).max(5),
    preferredPostLength: z.enum(["SHORT", "MEDIUM", "LONG", "MIXED"]),
    contentGoals: z.array(z.string().min(1).max(100)).max(20)
  }),
  socialAccounts: z
    .array(
      z.object({
        platform: z.enum(["TELEGRAM", "INSTAGRAM", "THREADS", "VK"]),
        accountName: z.string().max(120).optional().nullable(),
        accountUrl: z.string().url().max(300).optional().or(z.literal("")).nullable(),
        priority: z.enum(["PRIMARY", "SECONDARY", "LOW"]),
        isActive: z.boolean(),
        publishingEnabled: z.boolean(),
        analyticsEnabled: z.boolean(),
        notes: z.string().max(500).optional().nullable()
      })
    )
    .min(1)
    .max(4)
});

@Controller("onboarding")
@UseGuards(AuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get("status")
  status(@CurrentUser() user: AuthUser) {
    return this.onboardingService.getStatus(user.id);
  }

  @Post("complete")
  complete(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(onboardingSchema, body);
    return this.onboardingService.complete(user.id, {
      ...input,
      socialAccounts: input.socialAccounts.map((account) => ({
        ...account,
        accountUrl: account.accountUrl || null
      }))
    });
  }
}
