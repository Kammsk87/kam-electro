import { describe, expect, it } from "vitest";
import { storyBlocks } from "./story-types";

describe("storyBlocks", () => {
  it("keeps the required Story Engine structure", () => {
    expect(storyBlocks.map((block) => block.key)).toEqual([
      "hook",
      "context",
      "conflict",
      "insight",
      "takeaway"
    ]);
  });
});
