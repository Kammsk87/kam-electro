import { describe, expect, it } from "vitest";
import { cosineSimilarity, localEmbedding, textFingerprint } from "./embedding";

describe("localEmbedding", () => {
  it("creates deterministic normalized vectors", () => {
    const first = localEmbedding("business risk and honest reflection");
    const second = localEmbedding("business risk and honest reflection");

    expect(first).toEqual(second);
    expect(first).toHaveLength(64);
    expect(textFingerprint("same")).toEqual(textFingerprint("same"));
  });

  it("scores related text higher than unrelated text", () => {
    const source = localEmbedding("business negotiation risk");
    const related = localEmbedding("risk in business negotiation");
    const unrelated = localEmbedding("family travel breakfast");

    expect(cosineSimilarity(source, related)).toBeGreaterThan(
      cosineSimilarity(source, unrelated)
    );
  });
});
