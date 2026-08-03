import { Injectable } from "@nestjs/common";
import type { PlatformPriority, SocialPlatform } from "@prisma/client";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

export type SocialAccountInput = {
  platform: SocialPlatform;
  accountName?: string | null;
  accountUrl?: string | null;
  priority: PlatformPriority;
  isActive: boolean;
  publishingEnabled: boolean;
  analyticsEnabled: boolean;
  notes?: string | null;
};

@Injectable()
export class SocialAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async listForCurrentWorkspace(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.socialAccount.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ priority: "asc" }, { platform: "asc" }]
    });
  }

  async replaceForCurrentWorkspace(userId: string, accounts: SocialAccountInput[]) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);

    return this.prisma.$transaction(async (tx) => {
      for (const account of accounts) {
        await tx.socialAccount.upsert({
          where: {
            workspaceId_platform: {
              workspaceId: workspace.id,
              platform: account.platform
            }
          },
          update: account,
          create: {
            workspaceId: workspace.id,
            ...account
          }
        });
      }

      return tx.socialAccount.findMany({
        where: { workspaceId: workspace.id },
        orderBy: [{ priority: "asc" }, { platform: "asc" }]
      });
    });
  }
}
