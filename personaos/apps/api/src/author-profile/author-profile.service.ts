import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

export type UpsertAuthorProfileInput = {
  displayName: string;
  bio?: string | null;
  positioning?: string | null;
  mainTopics: string[];
  forbiddenTopics: string[];
  toneOfVoice: string[];
  sarcasmLevel: number;
  depthLevel: number;
  personalLevel: number;
  expertiseLevel: number;
  preferredPostLength: "SHORT" | "MEDIUM" | "LONG" | "MIXED";
  contentGoals: string[];
};

@Injectable()
export class AuthorProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async getForCurrentWorkspace(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return workspace.authorProfile;
  }

  async upsertForCurrentWorkspace(userId: string, input: UpsertAuthorProfileInput) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);

    return this.prisma.authorProfile.upsert({
      where: { workspaceId: workspace.id },
      update: input,
      create: {
        workspaceId: workspace.id,
        ...input
      }
    });
  }
}
