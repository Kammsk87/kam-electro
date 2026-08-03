import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { SocialPlatform } from "@prisma/client";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { getSocialAdapter } from "./social-platform-adapters";

@Injectable()
export class SocialIntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async list(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.socialConnection.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { platform: "asc" }
    });
  }

  async connectUrl(userId: string, platform: SocialPlatform, redirectUri?: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const adapter = getSocialAdapter(platform);
    return {
      platform,
      url: adapter.getConnectUrl({ workspaceId: workspace.id, redirectUri }),
      mode: process.env[`${platform}_CLIENT_ID`] ? "oauth" : "manual"
    };
  }

  async callback(
    userId: string,
    platform: SocialPlatform,
    input: { code?: string; accountName?: string; externalUserId?: string; scopes?: string[] }
  ) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const result = await getSocialAdapter(platform).exchangeCallback(input);

    return this.prisma.socialConnection.upsert({
      where: { workspaceId_platform: { workspaceId: workspace.id, platform } },
      create: {
        workspaceId: workspace.id,
        platform,
        status: result.ok ? "CONNECTED" : "ERROR",
        accountName: input.accountName,
        externalUserId: result.externalId ?? input.externalUserId,
        scopes: input.scopes ?? [],
        errorMessage: result.ok ? null : result.message,
        metadata: { message: result.message }
      },
      update: {
        status: result.ok ? "CONNECTED" : "ERROR",
        accountName: input.accountName,
        externalUserId: result.externalId ?? input.externalUserId,
        scopes: input.scopes ?? [],
        errorMessage: result.ok ? null : result.message,
        metadata: { message: result.message }
      }
    });
  }

  async publishPublication(userId: string, publicationId: string) {
    const publication = await this.prisma.publication.findUnique({
      where: { id: publicationId },
      include: { draft: true }
    });
    await this.ensureWorkspaceAccess(userId, publication?.workspaceId);
    if (!publication) throw new NotFoundException("Publication not found.");

    const platform = publication.platform as unknown as SocialPlatform;
    const connection = await this.prisma.socialConnection.findUnique({
      where: { workspaceId_platform: { workspaceId: publication.workspaceId, platform } }
    });

    const job = await this.prisma.socialIntegrationJob.create({
      data: {
        workspaceId: publication.workspaceId,
        publicationId,
        platform,
        type: publication.scheduledAt ? "SCHEDULE" : "PUBLISH",
        status: "QUEUED",
        scheduledFor: publication.scheduledAt,
        payload: {
          title: publication.draft.title,
          content: publication.draft.content,
          connectionStatus: connection?.status ?? "DISCONNECTED"
        }
      }
    });

    if (!connection || connection.status !== "CONNECTED") {
      return this.prisma.socialIntegrationJob.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          attempts: 1,
          errorMessage: `${platform} is not connected. Publication was not sent.`
        }
      });
    }

    const result = await getSocialAdapter(platform).publish({
      publicationId,
      content: publication.draft.content,
      scheduledAt: publication.scheduledAt
    });

    return this.prisma.socialIntegrationJob.update({
      where: { id: job.id },
      data: {
        status: result.ok ? "SUCCEEDED" : "FAILED",
        attempts: 1,
        result: { externalUrl: result.externalUrl, message: result.message },
        errorMessage: result.ok ? null : result.message
      }
    });
  }

  async syncPublicationStatus(userId: string, publicationId: string) {
    const publication = await this.prisma.publication.findUnique({ where: { id: publicationId } });
    await this.ensureWorkspaceAccess(userId, publication?.workspaceId);
    if (!publication) throw new NotFoundException("Publication not found.");

    const platform = publication.platform as unknown as SocialPlatform;
    const result = await getSocialAdapter(platform).syncStatus(publicationId);
    return this.prisma.socialIntegrationJob.create({
      data: {
        workspaceId: publication.workspaceId,
        publicationId,
        platform,
        type: "STATUS_SYNC",
        status: result.ok ? "SUCCEEDED" : "FAILED",
        attempts: 1,
        result: { message: result.message, externalId: result.externalId },
        errorMessage: result.ok ? null : result.message
      }
    });
  }

  async jobs(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.socialIntegrationJob.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }

  private async ensureWorkspaceAccess(userId: string, workspaceId?: string) {
    if (!workspaceId) throw new NotFoundException("Publication not found.");
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } }
    });
    if (!membership) throw new ForbiddenException("You do not have access to this workspace.");
  }
}
