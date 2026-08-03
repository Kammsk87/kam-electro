import type { AiTextProvider, AiTextRequest, AiTextResponse } from "./ai-provider";

type OpenAiResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export class OpenAiProvider implements AiTextProvider {
  readonly name = "openai" as const;

  constructor(
    private readonly apiKey: string,
    private readonly model = "gpt-4o-mini"
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
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        temperature: request.temperature ?? 0.3,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed: ${response.status}`);
    }

    const payload = (await response.json()) as OpenAiResponse;
    return { content: payload.choices?.[0]?.message?.content?.trim() ?? "", provider: this.name };
  }
}
