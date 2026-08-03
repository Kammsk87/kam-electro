import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { parseBody } from "../common/validation";
import { PersonaService } from "./persona.service";

const stringArray = z.array(z.string().min(1).max(120)).max(40);

const personaProfileSchema = z.object({
  summary: z.string().max(2000).optional().nullable(),
  values: stringArray.optional(),
  beliefs: stringArray.optional(),
  themes: stringArray.optional(),
  tone: stringArray.optional(),
  humorStyle: z.string().max(500).optional().nullable(),
  sarcasmLevel: z.number().int().min(1).max(5).optional(),
  emotionalityLevel: z.number().int().min(1).max(5).optional(),
  riskAttitude: z.string().max(500).optional().nullable(),
  businessAttitude: z.string().max(500).optional().nullable(),
  peopleAttitude: z.string().max(500).optional().nullable(),
  moneyAttitude: z.string().max(500).optional().nullable(),
  familyAttitude: z.string().max(500).optional().nullable(),
  forbiddenTopics: stringArray.optional(),
  preferredFormats: stringArray.optional()
});

const personaSignalSchema = z.object({
  sourceType: z.enum(["CAPTURE", "REFLECTION", "AUTHOR_PROFILE", "MANUAL"]),
  sourceId: z.string().max(160).optional().nullable(),
  signalType: z.enum([
    "VALUE",
    "BELIEF",
    "THEME",
    "TONE",
    "HUMOR",
    "STYLE",
    "TOPIC",
    "EMOTION",
    "DECISION_PATTERN",
    "FORBIDDEN_TOPIC"
  ]),
  value: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1).default(0.5),
  weight: z.number().min(0).max(10).default(1)
});

const versionSchema = z.object({
  reason: z.string().max(500).optional().nullable()
});

@Controller("persona")
@UseGuards(AuthGuard)
export class PersonaController {
  constructor(private readonly personaService: PersonaService) {}

  @Get()
  getProfile(@CurrentUser() user: AuthUser) {
    return this.personaService.getProfile(user.id);
  }

  @Put()
  updateProfile(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.personaService.updateProfile(user.id, parseBody(personaProfileSchema, body));
  }

  @Get("summary")
  getSummary(@CurrentUser() user: AuthUser) {
    return this.personaService.getSummary(user.id);
  }

  @Post("rebuild")
  rebuild(@CurrentUser() user: AuthUser) {
    return this.personaService.rebuildProfileFromSignals(user.id);
  }

  @Get("signals")
  listSignals(@CurrentUser() user: AuthUser) {
    return this.personaService.listSignals(user.id);
  }

  @Post("signals")
  addSignal(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(personaSignalSchema, body);
    return this.personaService.addSignal(user.id, {
      ...input,
      confidence: input.confidence ?? 0.5,
      weight: input.weight ?? 1
    });
  }

  @Delete("signals/:id")
  removeSignal(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.personaService.removeSignal(user.id, id);
  }

  @Get("versions")
  getVersions(@CurrentUser() user: AuthUser) {
    return this.personaService.getVersions(user.id);
  }

  @Post("versions")
  createVersion(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = parseBody(versionSchema, body);
    return this.personaService.createVersion(user.id, input.reason);
  }
}
