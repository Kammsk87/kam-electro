import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { parseBody } from "../common/validation";
import { BetaService } from "./beta.service";

@Controller("beta")
@UseGuards(AuthGuard)
export class BetaController {
  constructor(private readonly betaService: BetaService) {}

  @Get("readiness")
  readiness(@CurrentUser() user: AuthUser) {
    return this.betaService.readiness(user.id);
  }

  @Get("feature-flags")
  flags(@CurrentUser() user: AuthUser) {
    return this.betaService.flags(user.id);
  }

  @Post("feature-flags")
  setFlag(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(
      z.object({
        key: z.string().min(1).max(120),
        enabled: z.boolean(),
        description: z.string().max(500).optional().nullable(),
        workspaceScoped: z.boolean().optional()
      }),
      body
    );
    return this.betaService.setFlag(user.id, input);
  }

  @Get("feedback")
  feedback(@CurrentUser() user: AuthUser) {
    return this.betaService.feedback(user.id);
  }

  @Post("feedback")
  createFeedback(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(
      z.object({
        title: z.string().min(1).max(180),
        message: z.string().min(1).max(4000)
      }),
      body
    );
    return this.betaService.createFeedback(user.id, input);
  }

  @Get("exports")
  exports(@CurrentUser() user: AuthUser) {
    return this.betaService.exports(user.id);
  }

  @Post("exports")
  createExport(@CurrentUser() user: AuthUser) {
    return this.betaService.createExport(user.id);
  }

  @Post("exports/:id/complete")
  completeExport(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: unknown) {
    const input = parseBody(z.object({ downloadUrl: z.string().url().optional() }), body ?? {});
    return this.betaService.completeExport(user.id, id, input.downloadUrl);
  }
}
