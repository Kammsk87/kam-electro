import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.module";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveWorkspace(userId: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: {
        members: {
          some: { userId }
        }
      },
      include: {
        authorProfile: true,
        socialAccounts: {
          orderBy: [{ priority: "asc" }, { platform: "asc" }]
        }
      },
      orderBy: { createdAt: "asc" }
    });

    if (!workspace) {
      throw new NotFoundException("Workspace has not been created yet.");
    }

    return workspace;
  }

  async createWorkspace(userId: string, input: { name: string; description?: string | null }) {
    const baseSlug = slugify(input.name) || "workspace";
    const slug = `${baseSlug}-${userId.slice(0, 6)}`;

    return this.prisma.workspace.create({
      data: {
        ownerId: userId,
        name: input.name,
        slug,
        description: input.description,
        members: {
          create: {
            userId,
            role: "OWNER"
          }
        }
      }
    });
  }
}
