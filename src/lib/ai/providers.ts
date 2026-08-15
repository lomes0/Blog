import { createOllama } from "ollama-ai-provider";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { AIProviderType } from "./types";
import { AIConfigurationError, AIProviderError } from "./errors";

/**
 * Use a flexible type that works with all provider versions.
 * Different providers return different model specification versions (v1, v2, v3),
 * and there's no common base type that all providers implement.
 * This is a known limitation of the AI SDK's provider architecture.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProviderInstance = (modelId: string) => any;

/**
 * What a provider needs to make a call, resolved by the caller rather than read
 * from `process.env` here — docs/plans/byo-provider-keys.md §4.4.
 *
 * The split down the middle is a security boundary, not a convenience: the
 * **key** is the user's and arrives from `providerCredentials`, while the
 * **URLs** are the deployment's and come from the environment. `providerRequiresKey`
 * carries the reasoning; the short version is that a user-supplied base URL
 * turns this factory into an SSRF gadget.
 */
export interface ProviderCredentials {
  /** Absent only where `providerRequiresKey` is false — that is, Ollama. */
  apiKey?: string;
  /** Deployment config. Required by Azure, optional for Ollama. */
  baseURL?: string;
  /** Deployment config. Azure only. */
  apiVersion?: string;
}

/** The key, or a refusal naming the provider that wanted one. */
const requireKey = (
  credentials: ProviderCredentials,
  provider: AIProviderType,
): string => {
  if (!credentials.apiKey) {
    throw new AIConfigurationError(`No API key supplied for ${provider}`);
  }
  return credentials.apiKey;
};

const createGoogleProvider = (
  credentials: ProviderCredentials,
): ProviderInstance =>
  createGoogleGenerativeAI({ apiKey: requireKey(credentials, "google") });

const createAnthropicProvider = (
  credentials: ProviderCredentials,
): ProviderInstance =>
  createAnthropic({ apiKey: requireKey(credentials, "anthropic") });

const createAzureProvider = (
  credentials: ProviderCredentials,
): ProviderInstance => {
  const apiKey = requireKey(credentials, "azure");

  const baseURL = credentials.baseURL;
  if (!baseURL) {
    throw new AIConfigurationError("AZURE_OPENAI_BASE_URL not configured");
  }
  const apiVersion = credentials.apiVersion || "2025-04-01-preview";

  // Use @ai-sdk/openai with custom fetch to transform URLs for Azure format
  // This provides v2/v3 model specs while using standard chat completions API
  const openai = createOpenAI({
    apiKey,
    baseURL,
    headers: {
      "api-key": apiKey,
    },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url = typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : input.url;
        const urlObj = new URL(url);

        // Extract model from request body
        // Clone the body to avoid consuming the original stream
        let model: string | undefined;
        if (init?.body) {
          try {
            const bodyText = typeof init.body === "string"
              ? init.body
              : await new Response(init.body).text();
            const bodyData = JSON.parse(bodyText);
            model = bodyData.model;

            // Replace the consumed body with a new one
            init = {
              ...init,
              body: bodyText,
            };
          } catch (parseError) {
            console.error("Failed to parse request body:", parseError);
            throw new AIConfigurationError(
              "Failed to parse request body for Azure provider",
            );
          }
        }

        if (!model) {
          throw new AIConfigurationError(
            "Model ID is required for Azure provider",
          );
        }

        // Transform OpenAI URL to Azure format
        // From: {baseURL}/chat/completions or {baseURL}/v1/chat/completions
        // To: {baseURL}/openai/deployments/{model}/chat/completions?api-version={version}
        if (urlObj.pathname.endsWith("/chat/completions")) {
          urlObj.pathname = urlObj.pathname.replace(
            /\/(v1\/)?chat\/completions$/,
            `/openai/deployments/${model}/chat/completions`,
          );
          urlObj.searchParams.set("api-version", apiVersion);
        }

        return fetch(urlObj.toString(), init);
      } catch (error) {
        console.error("Azure provider fetch error:", error);
        throw error;
      }
    },
  });

  // Use .chat() to ensure we get chat models, not the prompt caching API
  return (modelId: string) => openai.chat(modelId);
};

const createOllamaProvider = (
  credentials: ProviderCredentials,
): ProviderInstance =>
  createOllama({ baseURL: credentials.baseURL || OLLAMA_DEFAULT_URL });

const OLLAMA_DEFAULT_URL = "http://localhost:11434/api";

/**
 * The deployment-configured half of a provider's settings — the URLs, and
 * nothing else.
 *
 * **There is no `*_API_KEY` read left in this file**, and that is the point of
 * docs/plans/byo-provider-keys.md: a key belongs to a user and arrives from
 * `providerCredentials`, while an endpoint belongs to the deployment and stays
 * here. §4.5 is the reasoning — a user-supplied base URL would make this
 * factory fetch any host they name, from inside the deployment's network.
 *
 * Pair the result with a user's key to build full credentials; that is what
 * `resolveProviderCredentials` in `./credentials` does.
 */
export const deploymentEndpoint = (
  providerType: AIProviderType,
): Pick<ProviderCredentials, "baseURL" | "apiVersion"> => {
  switch (providerType) {
    case "azure":
      return {
        baseURL: process.env.AZURE_OPENAI_BASE_URL,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION,
      };
    case "ollama":
      return { baseURL: process.env.OLLAMA_API_URL };
    case "google":
    case "anthropic":
      // Both are reached at the SDK's own default host. Nothing to configure,
      // and nothing a user could point elsewhere.
      return {};
  }
};

export const createProvider = (
  providerType: AIProviderType,
  credentials: ProviderCredentials,
): ProviderInstance => {
  try {
    switch (providerType) {
      case "google":
        return createGoogleProvider(credentials);
      case "anthropic":
        return createAnthropicProvider(credentials);
      case "azure":
        return createAzureProvider(credentials);
      case "ollama":
        return createOllamaProvider(credentials);
      default:
        throw new AIProviderError(
          providerType,
          `Unknown provider type: ${providerType}`,
        );
    }
  } catch (error) {
    if (
      error instanceof AIConfigurationError || error instanceof AIProviderError
    ) {
      throw error;
    }
    throw new AIProviderError(
      providerType,
      "Failed to create provider",
      error,
    );
  }
};
