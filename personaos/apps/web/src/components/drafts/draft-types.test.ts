import { describe, expect, it } from "vitest";
import { getDraftMetrics } from "./draft-types";

describe("getDraftMetrics", () => {
  it("calculates words, characters and read time", () => {
    expect(getDraftMetrics("one two three")).toEqual({
      words: 3,
      characters: 13,
      estimatedReadTime: 1
    });
  });
});
