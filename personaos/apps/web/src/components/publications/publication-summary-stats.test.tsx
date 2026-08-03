import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicationSummaryStats } from "./publication-summary-stats";

describe("PublicationSummaryStats", () => {
  it("renders publication dashboard numbers", () => {
    const html = renderToStaticMarkup(
      <PublicationSummaryStats summary={{ planned: 2, ready: 1, publishedThisWeek: 3 }} />
    );

    expect(html).toContain("Запланировано");
    expect(html).toContain(">2<");
    expect(html).toContain("За неделю");
    expect(html).toContain(">3<");
  });
});
