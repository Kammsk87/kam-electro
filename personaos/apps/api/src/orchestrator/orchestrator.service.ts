import { Injectable, NotFoundException } from "@nestjs/common";
import type { AiJobPriority, AiJobStatus, AiJobType } from "@prisma/client";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

export type QueueJobInput = {
  type: AiJobType;
  priority?: AiJobPriority;
  payload?: unknown;
  runAfter?: Date | null;
};

@Injectable()
export class OrchestratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async queue(userId: string, input: QueueJobInput) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.aiJob.create({
      data: {
        workspaceId: workspace.id,
        type: input.type,
        priority: input.priority ?? "NORMAL",
        payload: input.payload as object,
        runAfter: input.runAfter
      }
    });
  }

  async list(userId: string, status?: AiJobStatus) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.aiJob.findMany({
      where: { workspaceId: workspace.id, status },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 100
    });
  }

  async processNext(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const job = await this.prisma.aiJob.findFirst({
      where: {
        workspaceId: workspace.id,
        status: "QUEUED",
        OR: [{ runAfter: null }, { runAfter: { lte: new Date() } }]
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
    });
    if (!job) return { processed: false, message: "No queued jobs." };

    await this.prisma.aiJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date() }
    });

    return this.prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        finishedAt: new Date(),
        result: {
          message:
            "Job accepted by PersonaOS Orchestrator. Concrete workers can attach platform-specific execution later.",
          type: job.type
        }
      }
    });
  }

  async retry(userId: string, id: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const job = await this.prisma.aiJob.findUnique({ where: { id } });
    if (!job || job.workspaceId !== workspace.id) throw new NotFoundException("AI job not found.");
    return this.prisma.aiJob.update({
      where: { id },
      data: { status: "QUEUED", error: null, runAfter: new Date() }
    });
  }

  async cancel(userId: string, id: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const job = await this.prisma.aiJob.findUnique({ where: { id } });
    if (!job || job.workspaceId !== workspace.id) throw new NotFoundException("AI job not found.");
    return this.prisma.aiJob.update({
      where: { id },
      data: { status: "CANCELLED", finishedAt: new Date() }
    });
  }

  async summary(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const statuses: AiJobStatus[] = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"];
    const pairs = await Promise.all(
      statuses.map(async (status) => [
        status,
        await this.prisma.aiJob.count({ where: { workspaceId: workspace.id, status } })
      ] as const)
    );
    return Object.fromEntries(pairs);
  }
}
