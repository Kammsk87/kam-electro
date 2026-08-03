import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PersonaDnaStats } from "./persona-dna-stats";

describe("PersonaDnaStats", () => {
  it("renders profile completeness, signals and latest version", () => {
    const html = renderToStaticMarkup(
      <PersonaDnaStats summary={{ completeness: 76, signalCount: 8, lastVersion: 3 }} />
    );

    expect(html).toContain("76%");
    expect(html).toContain("сигналы");
    expect(html).toContain(">8<");
    expect(html).toContain(">3<");
  });
});
