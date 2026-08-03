import { Injectable, NotFoundException } from "@nestjs/common";
import type { PersonaSignalSourceType, PersonaSignalType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.module";
import { WorkspacesService } from "../workspaces/workspaces.service";

export type PersonaProfileInput = {
  summary?: string | null;
  values?: string[];
  beliefs?: string[];
  themes?: string[];
  tone?: string[];
  humorStyle?: string | null;
  sarcasmLevel?: number;
  emotionalityLevel?: number;
  riskAttitude?: string | null;
  businessAttitude?: string | null;
  peopleAttitude?: string | null;
  moneyAttitude?: string | null;
  familyAttitude?: string | null;
  forbiddenTopics?: string[];
  preferredFormats?: string[];
};

export type PersonaSignalInput = {
  sourceType: PersonaSignalSourceType;
  sourceId?: string | null;
  signalType: PersonaSignalType;
  value: string;
  confidence: number;
  weight: number;
};

@Injectable()
export class PersonaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService
  ) {}

  async getProfile(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const existing = await this.prisma.personaProfile.findUnique({
      where: { workspaceId: workspace.id }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.personaProfile.create({
      data: {
        workspaceId: workspace.id,
        userId,
        summary: workspace.authorProfile?.positioning ?? workspace.description ?? null,
        values: [],
        beliefs: [],
        themes: workspace.authorProfile?.mainTopics ?? [],
        tone: workspace.authorProfile?.toneOfVoice ?? [],
        sarcasmLevel: workspace.authorProfile?.sarcasmLevel ?? 2,
        emotionalityLevel: workspace.authorProfile?.personalLevel ?? 3,
        forbiddenTopics: workspace.authorProfile?.forbiddenTopics ?? [],
        preferredFormats: []
      }
    });
  }

  async updateProfile(userId: string, input: PersonaProfileInput) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    await this.getProfile(userId);

    return this.prisma.personaProfile.update({
      where: { workspaceId: workspace.id },
      data: input
    });
  }

  async listSignals(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.personaSignal.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" }
    });
  }

  async addSignal(userId: string, input: PersonaSignalInput) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.personaSignal.create({
      data: {
        workspaceId: workspace.id,
        ...input
      }
    });
  }

  async removeSignal(userId: string, signalId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const signal = await this.prisma.personaSignal.findUnique({ where: { id: signalId } });

    if (!signal || signal.workspaceId !== workspace.id) {
      throw new NotFoundException("Persona signal not found.");
    }

    await this.prisma.personaSignal.delete({ where: { id: signalId } });
    return { ok: true };
  }

  async getVersions(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    return this.prisma.personaVersion.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { version: "desc" }
    });
  }

  async createVersion(userId: string, reason?: string | null) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const profile = await this.getProfile(userId);
    const signals = await this.listSignals(userId);
    const latest = await this.prisma.personaVersion.findFirst({
      where: { workspaceId: workspace.id },
      orderBy: { version: "desc" }
    });

    return this.prisma.personaVersion.create({
      data: {
        workspaceId: workspace.id,
        version: (latest?.version ?? 0) + 1,
        reason,
        snapshot: {
          profile,
          signalCount: signals.length,
          createdFrom: "manual-version"
        } satisfies Prisma.InputJsonValue
      }
    });
  }

  async rebuildProfileFromSignals(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    await this.getProfile(userId);
    const signals = await this.prisma.personaSignal.findMany({
      where: { workspaceId: workspace.id }
    });

    const topValues = this.rankSignals(signals, "VALUE");
    const topBeliefs = this.rankSignals(signals, "BELIEF");
    const topThemes = [
      ...new Set([...this.rankSignals(signals, "THEME"), ...this.rankSignals(signals, "TOPIC")])
    ];
    const topTone = [
      ...new Set([...this.rankSignals(signals, "TONE"), ...this.rankSignals(signals, "STYLE")])
    ];
    const humor = this.rankSignals(signals, "HUMOR")[0];
    const forbiddenTopics = this.rankSignals(signals, "FORBIDDEN_TOPIC");

    return this.prisma.personaProfile.update({
      where: { workspaceId: workspace.id },
      data: {
        values: topValues,
        beliefs: topBeliefs,
        themes: topThemes,
        tone: topTone,
        humorStyle: humor,
        forbiddenTopics,
        summary: this.buildSummary({ topValues, topThemes, topTone, humor })
      }
    });
  }

  async getSummary(userId: string) {
    const workspace = await this.workspacesService.getActiveWorkspace(userId);
    const [profile, signalCount, lastVersion] = await Promise.all([
      this.getProfile(userId),
      this.prisma.personaSignal.count({ where: { workspaceId: workspace.id } }),
      this.prisma.personaVersion.findFirst({
        where: { workspaceId: workspace.id },
        orderBy: { version: "desc" }
      })
    ]);

    const fillableFields = [
      profile.summary,
      profile.values.length,
      profile.beliefs.length,
      profile.themes.length,
      profile.tone.length,
      profile.humorStyle,
      profile.riskAttitude,
      profile.businessAttitude,
      profile.peopleAttitude,
      profile.moneyAttitude,
      profile.familyAttitude,
      profile.forbiddenTopics.length,
      profile.preferredFormats.length
    ];
    const completed = fillableFields.filter(Boolean).length;

    return {
      completeness: Math.round((completed / fillableFields.length) * 100),
      signalCount,
      lastVersion: lastVersion?.version ?? null,
      updatedAt: profile.updatedAt
    };
  }

  private rankSignals(
    signals: Array<{
      signalType: PersonaSignalType;
      value: string;
      confidence: number;
      weight: number;
    }>,
    type: PersonaSignalType
  ) {
    const score = new Map<string, number>();

    for (const signal of signals) {
      if (signal.signalType !== type) continue;
      score.set(signal.value, (score.get(signal.value) ?? 0) + signal.confidence * signal.weight);
    }

    return [...score.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 12)
      .map(([value]) => value);
  }

  private buildSummary(input: {
    topValues: string[];
    topThemes: string[];
    topTone: string[];
    humor?: string;
  }) {
    const parts = [
      input.topThemes.length ? `Темы: ${input.topThemes.join(", ")}` : null,
      input.topValues.length ? `Ценности: ${input.topValues.join(", ")}` : null,
      input.topTone.length ? `Голос: ${input.topTone.join(", ")}` : null,
      input.humor ? `Юмор: ${input.humor}` : null
    ].filter(Boolean);

    return parts.join(". ");
  }
}
