// The unions are spelled as `as const` arrays rather than bare type unions so a
// runtime validator can be built from the same list — `z.enum(AI_PROVIDERS)` in
// `/api/completion` is the type, not a hand-copied restatement of it that drifts
// the moment a provider is added.
export const AI_PROVIDERS = ["google", "anthropic", "azure", "ollama"] as const;

export type AIProviderType = typeof AI_PROVIDERS[number];

export interface AIModel {
  id: string;
  name: string;
  provider: AIProviderType;
  capabilities: {
    streaming: boolean;
    maxTokens: number;
    supportsImages?: boolean;
  };
  metadata?: {
    fast?: boolean;
    reason?: boolean;
  };
}

export const AI_OPTIONS = [
  "improve",
  "continue",
  "shorter",
  "longer",
  "zap",
  "summarize",
  "tone",
] as const;

export type AIOptionType = typeof AI_OPTIONS[number];

export interface AIProviderConfig {
  google: {
    apiKey?: string;
  };
  anthropic: {
    apiKey?: string;
  };
  azure: {
    apiKey?: string;
    resourceName?: string;
  };
  ollama: {
    baseURL?: string;
  };
}
