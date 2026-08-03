import { describe, expect, it, vi } from "vitest";
import { AnalyticsController } from "../src/analytics/analytics.controller";

describe("AnalyticsController", () => {
  it("returns weekly report for the current user", async () => {
    const service = {
      weeklyReport: vi.fn().mockResolvedValue({ title: "Weekly Report" })
    };
    const controller = new AnalyticsController(service as never);

    await expect(
      controller.weeklyReport({ id: "user-1", email: "a@example.com", role: "USER" })
    ).resolves.toEqual({
      title: "Weekly Report"
    });

    expect(service.weeklyReport).toHaveBeenCalledWith("user-1");
  });
});
