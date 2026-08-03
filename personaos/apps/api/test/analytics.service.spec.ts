import { describe, expect, it, vi } from "vitest";
import { AnalyticsService } from "../src/analytics/analytics.service";

describe("AnalyticsService", () => {
  it("returns local summary counts", async () => {
    const prisma = {
      capture: { count: vi.fn().mockResolvedValue(3) },
      interviewSession: { count: vi.fn().mockResolvedValue(2) },
      story: { count: vi.fn().mockResolvedValue(1) },
      draft: { count: vi.fn().mockResolvedValue(4) },
      publication: { count: vi.fn().mockResolvedValue(5) },
      plannerStreak: { findUnique: vi.fn().mockResolvedValue({ current: 6, longest: 8 }) }
    };
    const service = new AnalyticsService(
      prisma as never,
      { getActiveWorkspace: vi.fn().mockResolvedValue({ id: "workspace-1" }) } as never
    );

    await expect(service.summary("user-1")).resolves.toEqual({
      captures: 3,
      reflections: 2,
      stories: 1,
      drafts: 4,
      publications: 5,
      streak: 6,
      longestStreak: 8
    });
  });
});
