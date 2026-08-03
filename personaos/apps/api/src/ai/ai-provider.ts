export type AiProviderName = "openai" | "anthropic" | "local";

export type AiTextRequest = {
  system: string;
  user: string;
  temperature?: number;
  fallback?: string;
};

export type AiTextResponse = {
  content: string;
  provider: AiProviderName;
};

export interface AiTextProvider {
  readonly name: AiProviderName;
  generate(request: AiTextRequest): Promise<AiTextResponse>;
  rewrite(request: AiTextRequest): Promise<AiTextResponse>;
  summarize(request: AiTextRequest): Promise<AiTextResponse>;
}
