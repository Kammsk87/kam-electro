import type { AiTextProvider, AiTextRequest, AiTextResponse } from "./ai-provider";

export class LocalLlmProvider implements AiTextProvider {
  readonly name = "local" as const;

  async generate(request: AiTextRequest): Promise<AiTextResponse> {
    return { content: this.normalize(request.fallback ?? request.user), provider: this.name };
  }

  async rewrite(request: AiTextRequest): Promise<AiTextResponse> {
    return { content: this.normalize(request.fallback ?? request.user), provider: this.name };
  }

  async summarize(request: AiTextRequest): Promise<AiTextResponse> {
    return {
      content: this.normalize(request.fallback ?? request.user).slice(0, 800),
      provider: this.name
    };
  }

  private normalize(value: string) {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n\n");
  }
}
