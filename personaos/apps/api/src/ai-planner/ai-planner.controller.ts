import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { AuthUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/current-user.decorator";
import { AiPlannerService } from "./ai-planner.service";

@Controller("ai-planner")
@UseGuards(AuthGuard)
export class AiPlannerController {
  constructor(private readonly aiPlannerService: AiPlannerService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.aiPlannerService.summary(user.id);
  }

  @Get("recommendations")
  recommendations(@CurrentUser() user: AuthUser) {
    return this.aiPlannerService.recommendations(user.id);
  }

  @Post("generate")
  generate(@CurrentUser() user: AuthUser) {
    return this.aiPlannerService.generate(user.id);
  }

  @Post("recommendations/:id/accept")
  accept(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.aiPlannerService.accept(user.id, id);
  }
}
