import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import type { AuthUser } from "../auth/auth.types";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthUser) {
    return this.analyticsService.summary(user.id);
  }

  @Get("heatmap")
  heatmap(@CurrentUser() user: AuthUser, @Query("days") days?: string) {
    const parsed = z.coerce.number().int().min(7).max(366).default(90).parse(days);
    return this.analyticsService.heatmap(user.id, parsed);
  }

  @Get("weekly-report")
  weeklyReport(@CurrentUser() user: AuthUser) {
    return this.analyticsService.weeklyReport(user.id);
  }

  @Get("monthly-report")
  monthlyReport(@CurrentUser() user: AuthUser) {
    return this.analyticsService.monthlyReport(user.id);
  }
}
