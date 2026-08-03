import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyticsSummaryStats } from "./analytics-summary-stats";

describe("AnalyticsSummaryStats", () => {
  it("renders local analytics counts", () => {
    const html = renderToStaticMarkup(
      <AnalyticsSummaryStats
        summary={{
          captures: 3,
          reflections: 2,
          stories: 1,
          drafts: 4,
          publications: 5,
          streak: 6,
          longestStreak: 8
        }}
      />
    );

    expect(html).toContain("Capture");
    expect(html).toContain(">3<");
    expect(html).toContain("Публикации");
    expect(html).toContain(">5<");
  });
});
