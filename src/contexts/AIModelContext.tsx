"use client";
import React, { createContext, useContext, useEffect } from "react";
import useLocalStorage from "@/hooks/useLocalStorage";
import { AI_MODELS } from "@/lib/ai/models";

interface LLMConfig {
  provider: string;
  model: string;
}

const DEFAULT_LLM: LLMConfig = {
  provider: "anthropic",
  model: "claude-sonnet-5",
};

interface AIModelContextType {
  llm: LLMConfig;
  setLlm: (value: LLMConfig | ((prev: LLMConfig) => LLMConfig)) => void;
}

const AIModelContext = createContext<AIModelContextType | undefined>(undefined);

export const AIModelProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [llm, setLlm] = useLocalStorage<LLMConfig>("llm", DEFAULT_LLM);

  // A previously-stored model may have been removed or retired (e.g. it now
  // 404s at the provider). Fall back to the default so Copilot stays usable.
  useEffect(() => {
    if (!AI_MODELS.some((m) => m.id === llm.model)) {
      setLlm(DEFAULT_LLM);
    }
  }, [llm.model, setLlm]);

  return (
    <AIModelContext.Provider value={{ llm, setLlm }}>
      {children}
    </AIModelContext.Provider>
  );
};

export const useAIModel = (): AIModelContextType => {
  const ctx = useContext(AIModelContext);
  if (!ctx) throw new Error("useAIModel must be used within AIModelProvider");
  return ctx;
};
