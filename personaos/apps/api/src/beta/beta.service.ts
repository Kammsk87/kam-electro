import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

@Injectable()
export class BetaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async readiness(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const [
      flags,
      feedback,
      exportJobs,
      aiJobsQueued,
      connectedSocials,
      memories,
      publications
    ] = await Promise.all([
      this.prisma.featureFlag.count({ where: { OR: [{ workspaceId: workspace.id }, { workspaceId: null }] } }),
      this.prisma.userFeedback.count({ where: { workspaceId: workspace.id, status: "NEW" } }),
      this.prisma.exportJob.count({ where: { workspaceId: workspace.id } }),
      this.prisma.aiJob.count({ where: { workspaceId: workspace.id, status: "QUEUED" } }),
      this.prisma.socialConnection.count({ where: { workspaceId: workspace.id, status: "CONNECTED" } }),
      this.prisma.memoryItem.count({ where: { workspaceId: workspace.id } }),
      this.prisma.publication.count({ where: { workspaceId: workspace.id } })
    ]);

    return {
      workspace: workspace.name,
      checks: {
        logging: "structured Nest logs enabled by runtime",
        backups: "requires managed PostgreSQL backup policy in production",
        monitoring: aiJobsQueued >= 0 ? "orchestrator summary available" : "missing",
        feedback: "available",
        featureFlags: flags,
        export: "available",
        privacy: "manual export/delete flows prepared",
        dockerProduction: "compose foundation present"
      },
      counters: { feedback, exportJobs, aiJobsQueued, connectedSocials, memories, publications }
    };
  }

  async flags(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.featureFlag.findMany({
      where: { OR: [{ workspaceId: workspace.id }, { workspaceId: null }] },
      orderBy: { key: "asc" }
    });
  }

  async setFlag(
    userId: string,
    input: { key: string; enabled: boolean; description?: string | null }
  ) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.featureFlag.upsert({
      where: { workspaceId_key: { workspaceId: workspace.id, key: input.key } },
      create: {
        workspaceId: workspace.id,
        key: input.key,
        enabled: input.enabled,
        description: input.description
      },
      update: {
        enabled: input.enabled,
        description: input.description
      }
    });
  }

  async feedback(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.userFeedback.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  }

  async createFeedback(userId: string, input: { title: string; message: string }) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.userFeedback.create({
      data: { workspaceId: workspace.id, userId, title: input.title, message: input.message }
    });
  }

  async createExport(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.exportJob.create({
      data: { workspaceId: workspace.id, userId, status: "QUEUED", format: "json" }
    });
  }

  async completeExport(userId: string, id: string, downloadUrl?: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const job = await this.prisma.exportJob.findUnique({ where: { id } });
    if (!job || job.workspaceId !== workspace.id) throw new NotFoundException("Export job not found.");
    return this.prisma.exportJob.update({
      where: { id },
      data: { status: "SUCCEEDED", downloadUrl }
    });
  }

  async exports(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.exportJob.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  }
}
