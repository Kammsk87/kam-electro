import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { parseBody } from "../common/validation";
import { SocialIntegrationsService } from "./social-integrations.service";

const platformSchema = z.enum(["TELEGRAM", "INSTAGRAM", "THREADS", "VK"]);

@Controller("social-integrations")
@UseGuards(AuthGuard)
export class SocialIntegrationsController {
  constructor(private readonly socialIntegrationsService: SocialIntegrationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.socialIntegrationsService.list(user.id);
  }

  @Get("jobs")
  jobs(@CurrentUser() user: AuthUser) {
    return this.socialIntegrationsService.jobs(user.id);
  }

  @Post(":platform/connect-url")
  connectUrl(
    @CurrentUser() user: AuthUser,
    @Param("platform") platform: string,
    @Body() body: unknown
  ) {
    const input = parseBody(z.object({ redirectUri: z.string().url().optional() }), body ?? {});
    return this.socialIntegrationsService.connectUrl(
      user.id,
      platformSchema.parse(platform),
      input.redirectUri
    );
  }

  @Post(":platform/callback")
  callback(@CurrentUser() user: AuthUser, @Param("platform") platform: string, @Body() body: unknown) {
    const input = parseBody(
      z.object({
        code: z.string().optional(),
        accountName: z.string().max(120).optional(),
        externalUserId: z.string().max(180).optional(),
        scopes: z.array(z.string()).optional()
      }),
      body ?? {}
    );
    return this.socialIntegrationsService.callback(user.id, platformSchema.parse(platform), input);
  }

  @Post("publications/:publicationId/publish")
  publish(@CurrentUser() user: AuthUser, @Param("publicationId") publicationId: string) {
    return this.socialIntegrationsService.publishPublication(user.id, publicationId);
  }

  @Post("publications/:publicationId/sync")
  sync(@CurrentUser() user: AuthUser, @Param("publicationId") publicationId: string) {
    return this.socialIntegrationsService.syncPublicationStatus(user.id, publicationId);
  }
}
