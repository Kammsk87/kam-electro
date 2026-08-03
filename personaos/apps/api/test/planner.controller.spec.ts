import { describe, expect, it, vi } from "vitest";
import { PlannerController } from "../src/planner/planner.controller";

describe("PlannerController", () => {
  it("completes a planner task", async () => {
    const service = {
      completeTask: vi.fn().mockResolvedValue({ id: "task-1", status: "DONE" })
    };
    const controller = new PlannerController(service as never);

    await expect(
      controller.completeTask({ id: "user-1", email: "a@example.com", role: "USER" }, "task-1")
    ).resolves.toEqual({
      id: "task-1",
      status: "DONE"
    });

    expect(service.completeTask).toHaveBeenCalledWith("user-1", "task-1");
  });
});
