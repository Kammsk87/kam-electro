import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { parseBody } from "../common/validation";
import { SocialAccountsService } from "./social-accounts.service";

const socialAccountSchema = z.object({
  platform: z.enum(["TELEGRAM", "INSTAGRAM", "THREADS", "VK"]),
  accountName: z.string().max(120).optional().nullable(),
  accountUrl: z.string().url().max(300).optional().or(z.literal("")).nullable(),
  priority: z.enum(["PRIMARY", "SECONDARY", "LOW"]),
  isActive: z.boolean(),
  publishingEnabled: z.boolean(),
  analyticsEnabled: z.boolean(),
  notes: z.string().max(500).optional().nullable()
});

const socialAccountsSchema = z.object({
  accounts: z.array(socialAccountSchema).min(1).max(4)
});

@Controller("social-accounts")
@UseGuards(AuthGuard)
export class SocialAccountsController {
  constructor(private readonly socialAccountsService: SocialAccountsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.socialAccountsService.listForCurrentWorkspace(user.id);
  }

  @Put()
  replace(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(socialAccountsSchema, body);
    return this.socialAccountsService.replaceForCurrentWorkspace(
      user.id,
      input.accounts.map((account) => ({
        ...account,
        accountUrl: account.accountUrl || null
      }))
    );
  }
}
