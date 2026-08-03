import { describe, expect, it } from "vitest";
import {
  buildFallbackDraft,
  buildRewritePrompt,
  buildWritingPrompt
} from "../src/drafts/writing-prompts";

const story = {
  title: "Про встречу",
  hook: "Команда устала раньше, чем это стало видно в цифрах.",
  context: "Мы вышли после встречи.",
  conflict: "Все говорили аккуратно, но смотрели одинаково.",
  insight: "Команда верит действиям, а не красивым словам.",
  takeaway: "Не путать мотивацию с вниманием к реальности."
};

describe("writing prompts", () => {
  it("builds platform-specific prompts with anti-fiction rules", () => {
    const prompt = buildWritingPrompt(story, "TELEGRAM");

    expect(prompt.system).toContain("Never invent facts");
    expect(prompt.system).toContain("Telegram");
    expect(prompt.user).toContain(story.hook);
    expect(prompt.user).toContain(story.takeaway);
  });

  it("builds rewrite prompts that preserve meaning", () => {
    const prompt = buildRewritePrompt({
      platform: "THREADS",
      currentContent: "Existing draft",
      instruction: "Make it shorter"
    });

    expect(prompt.system).toContain("Do not add new facts");
    expect(prompt.user).toContain("Existing draft");
  });

  it("builds a fallback draft from Story only", () => {
    expect(buildFallbackDraft(story, "INSTAGRAM")).toContain(story.insight);
  });
});
