import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlannerSummaryStats } from "./planner-summary-stats";

describe("PlannerSummaryStats", () => {
  it("renders planner dashboard values", () => {
    const html = renderToStaticMarkup(
      <PlannerSummaryStats
        summary={{ tasksToday: 4, doneToday: 2, openToday: 2, weeklyGoals: 1, streak: 3 }}
      />
    );

    expect(html).toContain("Открыто сегодня");
    expect(html).toContain(">2<");
    expect(html).toContain("Серия");
    expect(html).toContain(">3<");
  });
});
