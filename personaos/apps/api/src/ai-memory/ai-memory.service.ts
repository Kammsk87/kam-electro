import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { cosineSimilarity, localEmbedding, textFingerprint } from "./embedding";

@Injectable()
export class AiMemoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async reindex(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const memories = await this.prisma.memoryItem.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { updatedAt: "desc" }
    });

    const embeddings = await Promise.all(
      memories.map((memory) => this.upsertEmbedding(memory.id, memory.workspaceId, this.memoryText(memory)))
    );

    return { indexed: embeddings.length, provider: "LOCAL", model: "local-hash-v1" };
  }

  async semanticSearch(userId: string, query: string, limit = 10) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    await this.ensureIndexed(workspace.id);
    const queryVector = localEmbedding(query);
    const embeddings = await this.prisma.memoryEmbedding.findMany({
      where: { workspaceId: workspace.id },
      include: { memoryItem: true }
    });

    return embeddings
      .map((embedding) => ({
        memory: embedding.memoryItem,
        score: cosineSimilarity(queryVector, embedding.vector)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async similar(userId: string, memoryItemId: string, limit = 8) {
    const memory = await this.prisma.memoryItem.findUnique({ where: { id: memoryItemId } });
    await this.ensureWorkspaceAccess(userId, memory?.workspaceId);
    if (!memory) throw new NotFoundException("Memory item not found.");

    await this.ensureIndexed(memory.workspaceId);
    const source = await this.prisma.memoryEmbedding.findUnique({
      where: { memoryItemId }
    });
    if (!source) return [];

    const embeddings = await this.prisma.memoryEmbedding.findMany({
      where: { workspaceId: memory.workspaceId, memoryItemId: { not: memoryItemId } },
      include: { memoryItem: true }
    });

    return embeddings
      .map((embedding) => ({
        memory: embedding.memoryItem,
        score: cosineSimilarity(source.vector, embedding.vector)
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
  }

  async context(userId: string, query: string, limit = 5) {
    const results = await this.semanticSearch(userId, query, limit);
    return {
      query,
      memories: results.map((result) => ({
        id: result.memory.id,
        title: result.memory.title,
        summary: result.memory.summary,
        tags: result.memory.tags,
        score: Number(result.score.toFixed(4))
      }))
    };
  }

  async summary(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const [memories, embeddings] = await Promise.all([
      this.prisma.memoryItem.count({ where: { workspaceId: workspace.id } }),
      this.prisma.memoryEmbedding.count({ where: { workspaceId: workspace.id } })
    ]);
    return {
      memories,
      embeddings,
      coverage: memories ? Math.round((embeddings / memories) * 100) : 0,
      provider: "LOCAL"
    };
  }

  private async ensureIndexed(workspaceId: string) {
    const missing = await this.prisma.memoryItem.findMany({
      where: { workspaceId, embedding: null },
      take: 50
    });
    await Promise.all(
      missing.map((memory) => this.upsertEmbedding(memory.id, workspaceId, this.memoryText(memory)))
    );
  }

  private upsertEmbedding(memoryItemId: string, workspaceId: string, text: string) {
    const vector = localEmbedding(text);
    return this.prisma.memoryEmbedding.upsert({
      where: { memoryItemId },
      create: {
        workspaceId,
        memoryItemId,
        provider: "LOCAL",
        model: "local-hash-v1",
        vector,
        textHash: textFingerprint(text),
        dimensions: vector.length
      },
      update: {
        vector,
        textHash: textFingerprint(text),
        dimensions: vector.length
      }
    });
  }

  private memoryText(memory: { title: string | null; summary: string | null; tags: string[] }) {
    return [memory.title, memory.summary, memory.tags.join(" ")].filter(Boolean).join("\n");
  }

  private async ensureWorkspaceAccess(userId: string, workspaceId?: string) {
    if (!workspaceId) throw new NotFoundException("Memory item not found.");
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } }
    });
    if (!membership) throw new ForbiddenException("You do not have access to this memory.");
  }
}
