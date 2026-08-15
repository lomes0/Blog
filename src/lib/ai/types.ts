// The unions are spelled as `as const` arrays rather than bare type unions so a
// runtime validator can be built from the same list — `z.enum(AI_PROVIDERS)` in
// `/api/completion` is the type, not a hand-copied restatement of it that drifts
// the moment a provider is added.
export const AI_PROVIDERS = ["google", "anthropic", "azure", "ollama"] as const;

export type AIProviderType = typeof AI_PROVIDERS[number];

/**
 * Does a user have to bring a key for this provider?
 *
 * Ollama is the exception, and it is not an oversight —
 * docs/plans/byo-provider-keys.md §4.5. It authenticates with nothing; it is a
 * base URL, usually a local one. A bring-your-own-key rule that refused Ollama
 * for "no key on file" would be refusing a provider that has no key to bring.
 *
 * The mirror of that rule matters more: **keys are per-user, URLs are
 * deployment config.** A user-supplied base URL would make the server fetch any
 * host they name, from inside its own network, with its own egress —
 * `169.254.169.254` being the obvious target and not the only one. So Ollama's
 * endpoint stays in the environment, and Azure's does too even though its key
 * does not.
 */
export const providerRequiresKey = (provider: AIProviderType): boolean =>
  provider !== "ollama";

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
