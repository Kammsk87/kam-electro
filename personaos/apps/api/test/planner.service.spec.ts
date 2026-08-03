import { describe, expect, it, vi } from "vitest";
import { PlannerService } from "../src/planner/planner.service";

describe("PlannerService", () => {
  it("creates deterministic daily capture task when day is empty", async () => {
    const prisma = {
      plannerTask: {
        count: vi.fn().mockResolvedValue(0),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "task-1", title: "Capture one real moment", status: "TODO" }])
      },
      interviewSession: { count: vi.fn().mockResolvedValue(0) },
      story: { count: vi.fn().mockResolvedValue(0) },
      draft: { count: vi.fn().mockResolvedValue(0) },
      publication: { count: vi.fn().mockResolvedValue(0) },
      weeklyGoal: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: "goal-1" })
      },
      plannerStreak: { upsert: vi.fn().mockResolvedValue({ current: 0, longest: 0 }) },
      completionHistory: { findMany: vi.fn().mockResolvedValue([]) }
    };
    const service = new PlannerService(
      prisma as never,
      { getActiveWorkspace: vi.fn().mockResolvedValue({ id: "workspace-1" }) } as never
    );

    await service.today("user-1");

    expect(prisma.plannerTask.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          workspaceId: "workspace-1",
          title: "Capture one real moment",
          category: "CAPTURE"
        })
      ])
    });
  });
});
