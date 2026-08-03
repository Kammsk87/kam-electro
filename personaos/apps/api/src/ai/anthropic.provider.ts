import type { AiTextProvider, AiTextRequest, AiTextResponse } from "./ai-provider";

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
};

export class AnthropicProvider implements AiTextProvider {
  readonly name = "anthropic" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model = "claude-3-5-haiku-latest"
  ) {}

  generate(request: AiTextRequest) {
    return this.complete(request);
  }

  rewrite(request: AiTextRequest) {
    return this.complete(request);
  }

  summarize(request: AiTextRequest) {
    return this.complete(request);
  }

  private async complete(request: AiTextRequest): Promise<AiTextResponse> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1600,
        temperature: request.temperature ?? 0.3,
        system: request.system,
        messages: [{ role: "user", content: request.user }]
      })
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed: ${response.status}`);
    }

    const payload = (await response.json()) as AnthropicResponse;
    return {
      content: payload.content?.find((item) => item.type === "text")?.text?.trim() ?? "",
      provider: this.name
    };
  }
}
