import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CaptureEmotion,
  CaptureImportance,
  CaptureSourceType,
  CaptureStatus,
  Prisma
} from "@prisma/client";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { MemoryService } from "../memory/memory.service";

export type CaptureInput = {
  sourceType: CaptureSourceType;
  title?: string | null;
  description?: string | null;
  transcript?: string | null;
  media?: Prisma.InputJsonValue | null;
  location?: Prisma.InputJsonValue | null;
  tags?: string[];
  status?: CaptureStatus;
  emotion?: CaptureEmotion;
  importance?: CaptureImportance;
  context?: Prisma.InputJsonValue | null;
  isFavorite?: boolean;
};

export type CaptureListQuery = {
  page: number;
  pageSize: number;
  status?: CaptureStatus;
  sourceType?: CaptureSourceType;
  favorite?: boolean;
  search?: string;
  tag?: string;
};

@Injectable()
export class CapturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
    private readonly memoryService: MemoryService
  ) {}

  async list(userId: string, query: CaptureListQuery) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const where: Prisma.CaptureWhereInput = {
      workspaceId: workspace.id,
      status: query.status ?? { not: "DELETED" }
    };

    if (query.sourceType) {
      where.sourceType = query.sourceType;
    }

    if (typeof query.favorite === "boolean") {
      where.isFavorite = query.favorite;
    }

    if (query.tag) {
      where.tags = { has: query.tag };
    }

    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { transcript: { contains: query.search, mode: "insensitive" } },
        { tags: { has: query.search } }
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.capture.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.prisma.capture.count({ where })
    ]);

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      hasMore: query.page * query.pageSize < total
    };
  }

  async create(userId: string, input: CaptureInput) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);

    const capture = await this.prisma.capture.create({
      data: {
        workspaceId: workspace.id,
        sourceType: input.sourceType,
        title: input.title,
        description: input.description,
        transcript: input.transcript,
        media: input.media ?? undefined,
        location: input.location ?? undefined,
        tags: input.tags ?? [],
        status: input.status ?? "NEW",
        emotion: input.emotion ?? "UNKNOWN",
        importance: input.importance ?? "MEDIUM",
        context: input.context ?? undefined,
        isFavorite: input.isFavorite ?? false
      }
    });
    await this.memoryService.syncFromCapture(capture.id);
    return capture;
  }

  async get(userId: string, id: string) {
    const capture = await this.prisma.capture.findUnique({ where: { id } });
    await this.ensureAccess(userId, capture?.workspaceId);
    return capture;
  }

  async update(userId: string, id: string, input: Partial<CaptureInput>) {
    const capture = await this.prisma.capture.findUnique({ where: { id } });
    await this.ensureAccess(userId, capture?.workspaceId);

    const updated = await this.prisma.capture.update({
      where: { id },
      data: {
        sourceType: input.sourceType,
        title: input.title,
        description: input.description,
        transcript: input.transcript,
        media: input.media === null ? undefined : input.media,
        location: input.location === null ? undefined : input.location,
        tags: input.tags,
        status: input.status,
        emotion: input.emotion,
        importance: input.importance,
        context: input.context === null ? undefined : input.context,
        isFavorite: input.isFavorite
      }
    });
    await this.memoryService.syncFromCapture(updated.id);
    return updated;
  }

  async archive(userId: string, id: string) {
    return this.update(userId, id, { status: "ARCHIVED" });
  }

  async restore(userId: string, id: string) {
    return this.update(userId, id, { status: "NEW" });
  }

  async softDelete(userId: string, id: string) {
    return this.update(userId, id, { status: "DELETED" });
  }

  async toggleFavorite(userId: string, id: string) {
    const capture = await this.prisma.capture.findUnique({ where: { id } });
    await this.ensureAccess(userId, capture?.workspaceId);

    return this.prisma.capture.update({
      where: { id },
      data: { isFavorite: !capture?.isFavorite }
    });
  }

  private async ensureAccess(userId: string, workspaceId?: string) {
    if (!workspaceId) {
      throw new NotFoundException("Capture not found.");
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId
        }
      }
    });

    if (!membership) {
      throw new ForbiddenException("You do not have access to this capture.");
    }
  }
}
