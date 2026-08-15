"use client";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import useLocalStorage from "@/hooks/useLocalStorage";
import { AI_MODELS } from "@/lib/ai/models";
import { type AIProviderType, providerRequiresKey } from "@/lib/ai/types";

interface LLMConfig {
  provider: string;
  model: string;
}

const DEFAULT_LLM: LLMConfig = {
  provider: "anthropic",
  model: "claude-sonnet-5",
};

/**
 * One provider key, as `GET /api/ai/credentials` returns it —
 * docs/plans/byo-provider-keys.md §4.6.
 *
 * Restated here rather than imported from `@/lib/providerCredentials`, for two
 * reasons that both matter: that module reaches Prisma and cannot be pulled
 * into a client bundle, and its `Date` fields arrive here as strings anyway.
 * There is no `apiKey` field to omit — the server has no shape that carries one
 * outward.
 */
export interface ProviderKeySummary {
  provider: AIProviderType;
  /** The masked suffix, for display: `••••7f2a`. */
  last4: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  lastVerifiedAt: string | null;
}

/**
 * `signed-out` is deliberately not `error`. Provider keys are stored per
 * account, so a guest simply has none — surfacing that as a failed request
 * would put an alert in front of someone who has done nothing wrong.
 */
export type ProviderKeysState = "loading" | "ready" | "signed-out" | "error";

interface AIModelContextType {
  llm: LLMConfig;
  setLlm: (value: LLMConfig | ((prev: LLMConfig) => LLMConfig)) => void;
  /** The user's keys, masked. Empty while loading. */
  providerKeys: ProviderKeySummary[];
  providerKeysState: ProviderKeysState;
  providerKeysError: string | null;
  /** Re-read the list — call after saving or removing one. */
  refreshProviderKeys: () => Promise<void>;
  /**
   * Can this provider actually serve a request for this user?
   *
   * True for Ollama regardless, which has no key to bring
   * (`providerRequiresKey`). While the list is still loading this answers
   * *true*, so a picker does not flash every model as unavailable on the way in
   * — the states that matter are settled, not transient.
   */
  isProviderConfigured: (provider: string) => boolean;
}

const AIModelContext = createContext<AIModelContextType | undefined>(undefined);

export const AIModelProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [llm, setLlm] = useLocalStorage<LLMConfig>("llm", DEFAULT_LLM);
  const [providerKeys, setProviderKeys] = useState<ProviderKeySummary[]>([]);
  const [providerKeysState, setProviderKeysState] = useState<ProviderKeysState>(
    "loading",
  );
  const [providerKeysError, setProviderKeysError] = useState<string | null>(
    null,
  );

  const refreshProviderKeys = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/credentials");
      if (response.status === 401) {
        setProviderKeys([]);
        setProviderKeysError(null);
        setProviderKeysState("signed-out");
        return;
      }
      if (!response.ok) {
        throw new Error(`The server answered ${response.status}`);
      }
      const { data } = await response.json();
      setProviderKeys(data as ProviderKeySummary[]);
      setProviderKeysError(null);
      setProviderKeysState("ready");
    } catch (error) {
      setProviderKeysError(
        error instanceof Error ? error.message : "Could not load your keys",
      );
      setProviderKeysState("error");
    }
  }, []);

  useEffect(() => {
    void refreshProviderKeys();
  }, [refreshProviderKeys]);

  const configured = useMemo(
    () => new Set(providerKeys.map((key) => key.provider)),
    [providerKeys],
  );

  const isProviderConfigured = useCallback(
    (provider: string) =>
      providerKeysState === "loading" ||
      !providerRequiresKey(provider as AIProviderType) ||
      configured.has(provider as AIProviderType),
    [configured, providerKeysState],
  );

  /**
   * Keep the stored choice pointing at something that can actually run.
   *
   * Two ways it stops being able to: the model was retired from the registry
   * (it now 404s at the provider), or its provider has no key on file. Both end
   * the same way — a request that fails at the moment the user asks for
   * something, rather than at the moment the choice became invalid.
   *
   * The one case that is left alone is *nothing is configured*. Switching then
   * would only trade one unusable model for another, and it would overwrite a
   * preference the user will want back the moment they add a key.
   */
  useEffect(() => {
    if (providerKeysState === "loading") return;
    const current = AI_MODELS.find((model) => model.id === llm.model);
    if (current && isProviderConfigured(current.provider)) return;

    const fallback = AI_MODELS.find((model) =>
      isProviderConfigured(model.provider)
    );
    if (fallback) {
      setLlm({ provider: fallback.provider, model: fallback.id });
    } else if (!current) {
      // Nothing is usable, but the stored model does not even exist. Land on a
      // real one so every picker has something to show as selected.
      setLlm(DEFAULT_LLM);
    }
  }, [providerKeysState, llm.model, isProviderConfigured, setLlm]);

  const value = useMemo(
    () => ({
      llm,
      setLlm,
      providerKeys,
      providerKeysState,
      providerKeysError,
      refreshProviderKeys,
      isProviderConfigured,
    }),
    [
      llm,
      setLlm,
      providerKeys,
      providerKeysState,
      providerKeysError,
      refreshProviderKeys,
      isProviderConfigured,
    ],
  );

  return (
    <AIModelContext.Provider value={value}>
      {children}
    </AIModelContext.Provider>
  );
};

export const useAIModel = (): AIModelContextType => {
  const ctx = useContext(AIModelContext);
  if (!ctx) throw new Error("useAIModel must be used within AIModelProvider");
  return ctx;
};
