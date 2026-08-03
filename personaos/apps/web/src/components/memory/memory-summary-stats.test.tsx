import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemorySummaryStats } from "./memory-summary-stats";

describe("MemorySummaryStats", () => {
  it("renders memory item count", () => {
    const html = renderToStaticMarkup(<MemorySummaryStats summary={{ count: 7, recent: [] }} />);

    expect(html).toContain("Элементы памяти");
    expect(html).toContain(">7<");
  });
});
