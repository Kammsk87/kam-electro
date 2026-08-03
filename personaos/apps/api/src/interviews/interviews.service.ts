import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { InterviewStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { MemoryService } from "../memory/memory.service";
import { buildReadinessSummary, getQuestionForStep, isFinalStep } from "./interview-questions";

@Injectable()
export class InterviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
    private readonly memoryService: MemoryService
  ) {}

  async listOpen(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.interviewSession.findMany({
      where: {
        workspaceId: workspace.id,
        status: { in: ["NEW", "ACTIVE", "PAUSED"] }
      },
      include: {
        capture: true,
        messages: { orderBy: { createdAt: "asc" } }
      },
      orderBy: { updatedAt: "desc" },
      take: 8
    });
  }

  async create(userId: string, captureId: string) {
    const capture = await this.prisma.capture.findUnique({ where: { id: captureId } });
    await this.ensureWorkspaceAccess(userId, capture?.workspaceId);

    const existing = await this.prisma.interviewSession.findFirst({
      where: {
        captureId,
        status: { in: ["NEW", "ACTIVE", "PAUSED"] }
      },
      include: { messages: { orderBy: { createdAt: "asc" } }, capture: true }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.interviewSession.create({
      data: {
        captureId,
        workspaceId: capture!.workspaceId,
        status: "ACTIVE",
        startedAt: new Date(),
        currentStep: 0,
        messages: {
          create: {
            role: "ASSISTANT",
            content: getQuestionForStep(0),
            metadata: { templateStep: 0 }
          }
        }
      },
      include: { messages: { orderBy: { createdAt: "asc" } }, capture: true }
    });
  }

  async get(userId: string, id: string) {
    const interview = await this.prisma.interviewSession.findUnique({
      where: { id },
      include: {
        capture: true,
        messages: { orderBy: { createdAt: "asc" } }
      }
    });
    await this.ensureWorkspaceAccess(userId, interview?.workspaceId);
    return interview;
  }

  async update(
    userId: string,
    id: string,
    input: { status?: InterviewStatus; summary?: string | null; currentStep?: number }
  ) {
    const interview = await this.prisma.interviewSession.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, interview?.workspaceId);

    return this.prisma.interviewSession.update({
      where: { id },
      data: input,
      include: { messages: { orderBy: { createdAt: "asc" } }, capture: true }
    });
  }

  async addUserMessage(
    userId: string,
    id: string,
    input: { content: string; metadata?: Prisma.InputJsonValue | null }
  ) {
    const interview = await this.prisma.interviewSession.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    await this.ensureWorkspaceAccess(userId, interview?.workspaceId);

    if (!interview) {
      throw new NotFoundException("Interview not found.");
    }

    const nextStep = interview.currentStep + 1;
    const shouldComplete = isFinalStep(nextStep);

    const updatedInterview = await this.prisma.$transaction(async (tx) => {
      await tx.interviewMessage.create({
        data: {
          interviewId: id,
          role: "USER",
          content: input.content,
          metadata: input.metadata ?? undefined
        }
      });

      if (shouldComplete) {
        await tx.interviewSession.update({
          where: { id },
          data: {
            status: "COMPLETED",
            currentStep: nextStep,
            finishedAt: new Date(),
            summary: buildReadinessSummary()
          }
        });
      } else {
        await tx.interviewMessage.create({
          data: {
            interviewId: id,
            role: "ASSISTANT",
            content: getQuestionForStep(nextStep, input.content),
            metadata: { templateStep: nextStep }
          }
        });

        await tx.interviewSession.update({
          where: { id },
          data: {
            status: "ACTIVE",
            currentStep: nextStep
          }
        });
      }

      return tx.interviewSession.findUniqueOrThrow({
        where: { id },
        include: { messages: { orderBy: { createdAt: "asc" } }, capture: true }
      });
    });

    if (updatedInterview.status === "COMPLETED") {
      await this.memoryService.syncFromReflection(updatedInterview.id);
    }

    return updatedInterview;
  }

  async editMessage(userId: string, interviewId: string, messageId: string, content: string) {
    const interview = await this.prisma.interviewSession.findUnique({ where: { id: interviewId } });
    await this.ensureWorkspaceAccess(userId, interview?.workspaceId);

    return this.prisma.interviewMessage.update({
      where: { id: messageId },
      data: {
        content,
        metadata: {
          editedAt: new Date().toISOString()
        }
      }
    });
  }

  async deleteMessage(userId: string, interviewId: string, messageId: string) {
    const interview = await this.prisma.interviewSession.findUnique({ where: { id: interviewId } });
    await this.ensureWorkspaceAccess(userId, interview?.workspaceId);

    await this.prisma.interviewMessage.delete({ where: { id: messageId } });
    return { ok: true };
  }

  async pause(userId: string, id: string) {
    return this.update(userId, id, { status: "PAUSED" });
  }

  async resume(userId: string, id: string) {
    return this.update(userId, id, { status: "ACTIVE" });
  }

  async complete(userId: string, id: string) {
    const interview = await this.prisma.interviewSession.findUnique({ where: { id } });
    await this.ensureWorkspaceAccess(userId, interview?.workspaceId);

    const updatedInterview = await this.prisma.interviewSession.update({
      where: { id },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        summary: buildReadinessSummary()
      },
      include: { messages: { orderBy: { createdAt: "asc" } }, capture: true }
    });
    await this.memoryService.syncFromReflection(updatedInterview.id);
    return updatedInterview;
  }

  private async ensureWorkspaceAccess(userId: string, workspaceId?: string) {
    if (!workspaceId) {
      throw new NotFoundException("Interview not found.");
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId }
      }
    });

    if (!membership) {
      throw new ForbiddenException("You do not have access to this interview.");
    }
  }
}
