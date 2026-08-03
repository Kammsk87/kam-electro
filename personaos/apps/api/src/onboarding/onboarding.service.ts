import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";
import type { SocialAccountInput } from "../social-accounts/social-accounts.service";

type CompleteOnboardingInput = {
  user: {
    name: string;
    bio: string;
    occupation: string;
  };
  workspace: {
    name: string;
    description: string;
  };
  authorProfile: {
    displayName: string;
    bio: string;
    positioning: string;
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
  socialAccounts: SocialAccountInput[];
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { onboardingDone: true }
    });
    const workspace = await this.prisma.workspace.findFirst({
      where: { members: { some: { userId } } },
      select: { id: true }
    });

    return {
      onboardingDone: user.onboardingDone,
      hasWorkspace: Boolean(workspace)
    };
  }

  async complete(userId: string, input: CompleteOnboardingInput) {
    const workspace =
      (await this.prisma.workspace.findFirst({
        where: { members: { some: { userId } } }
      })) ??
      (await this.workspacesService.createWorkspace(userId, {
        name: input.workspace.name,
        description: input.workspace.description
      }));

    const updatedWorkspace = await this.prisma.workspace.update({
      where: { id: workspace.id },
      data: {
        name: input.workspace.name,
        description: input.workspace.description
      }
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: input.user.name,
        onboardingDone: true
      }
    });

    const authorProfile = await this.prisma.authorProfile.upsert({
      where: { workspaceId: updatedWorkspace.id },
      update: input.authorProfile,
      create: {
        workspaceId: updatedWorkspace.id,
        ...input.authorProfile
      }
    });

    const socialAccounts = [];
    for (const account of input.socialAccounts) {
      socialAccounts.push(
        await this.prisma.socialAccount.upsert({
          where: {
            workspaceId_platform: {
              workspaceId: updatedWorkspace.id,
              platform: account.platform
            }
          },
          update: account,
          create: {
            workspaceId: updatedWorkspace.id,
            ...account
          }
        })
      );
    }

    return {
      onboardingDone: true,
      workspace: updatedWorkspace,
      authorProfile,
      socialAccounts
    };
  }
}
