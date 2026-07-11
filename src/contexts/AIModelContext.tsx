"use client";
import React, { createContext, useContext } from "react";
import useLocalStorage from "@/hooks/useLocalStorage";

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
