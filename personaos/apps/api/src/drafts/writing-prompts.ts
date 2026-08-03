import type { DraftPlatform } from "@prisma/client";

export type StoryPromptSource = {
  title?: string | null;
  hook?: string | null;
  context?: string | null;
  conflict?: string | null;
  insight?: string | null;
  takeaway?: string | null;
};

const platformGuidance: Record<DraftPlatform, string> = {
  TELEGRAM:
    "Telegram: thoughtful, clear, paragraph-driven. Can be longer. Strong opening, honest narrative, useful final thought.",
  INSTAGRAM:
    "Instagram: visual and personal. Shorter paragraphs, emotional clarity, readable rhythm, no artificial inspiration.",
  THREADS:
    "Threads: concise, conversational, one idea per line. Keep it sharp, natural and easy to reply to.",
  VK: "VK: grounded and accessible. Slightly broader context, clear story, practical takeaway. Low priority platform."
};

export function buildWritingPrompt(source: StoryPromptSource, platform: DraftPlatform) {
  return {
    system: [
      "You are PersonaOS Writing Engine.",
      "You only transform an existing Story into a readable draft.",
      "Never invent facts, events, people, emotions, numbers or conclusions.",
      "Never change the meaning.",
      "Never add dramatic language that is not supported by the Story.",
      "You may improve readability, structure, natural flow and clarity.",
      "Preserve the author's voice and lived experience.",
      platformGuidance[platform]
    ].join("\n"),
    user: [
      "Create a platform-ready draft using only this Story data.",
      "",
      `Platform: ${platform}`,
      "",
      `Title: ${source.title ?? ""}`,
      `Hook: ${source.hook ?? ""}`,
      `Context: ${source.context ?? ""}`,
      `Conflict: ${source.conflict ?? ""}`,
      `Insight: ${source.insight ?? ""}`,
      `Takeaway: ${source.takeaway ?? ""}`,
      "",
      "Return only the draft text. Do not explain your process."
    ].join("\n")
  };
}

export function buildRewritePrompt(input: {
  platform: DraftPlatform;
  currentContent: string;
  instruction: string;
}) {
  return {
    system: [
      "You are PersonaOS Writing Engine.",
      "Rewrite only the provided draft.",
      "Do not add new facts, events, emotions, claims or conclusions.",
      "Keep the meaning intact.",
      platformGuidance[input.platform]
    ].join("\n"),
    user: [
      `Instruction: ${input.instruction}`,
      `Platform: ${input.platform}`,
      "",
      "Draft:",
      input.currentContent,
      "",
      "Return only the rewritten draft."
    ].join("\n")
  };
}

export function buildFallbackDraft(story: StoryPromptSource, platform: DraftPlatform) {
  const intro = platform === "THREADS" ? "" : story.title ? `${story.title}\n\n` : "";
  return [intro, story.hook, story.context, story.conflict, story.insight, story.takeaway]
    .filter(Boolean)
    .join("\n\n");
}
