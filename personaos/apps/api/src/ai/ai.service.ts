import { Injectable } from "@nestjs/common";
import type { AiTextProvider, AiTextRequest } from "./ai-provider";
import { AnthropicProvider } from "./anthropic.provider";
import { LocalLlmProvider } from "./local-llm.provider";
import { OpenAiProvider } from "./openai.provider";

@Injectable()
export class AiService {
  private readonly provider: AiTextProvider;

  constructor() {
    this.provider = this.createProvider();
  }

  generate(request: AiTextRequest) {
    return this.provider.generate(request);
  }

  rewrite(request: AiTextRequest) {
    return this.provider.rewrite(request);
  }

  summarize(request: AiTextRequest) {
    return this.provider.summarize(request);
  }

  private createProvider() {
    const provider = process.env.AI_PROVIDER ?? "local";

    if (provider === "openai" && process.env.OPENAI_API_KEY) {
      return new OpenAiProvider(process.env.OPENAI_API_KEY, process.env.OPENAI_MODEL);
    }

    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      return new AnthropicProvider(process.env.ANTHROPIC_API_KEY, process.env.ANTHROPIC_MODEL);
    }

    return new LocalLlmProvider();
  }
}
