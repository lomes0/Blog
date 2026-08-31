class AIError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "AIError";
  }
}

export class AIProviderError extends AIError {
  constructor(
    public readonly provider: string,
    message: string,
    cause?: unknown,
  ) {
    super(`[${provider}] ${message}`, cause);
    this.name = "AIProviderError";
  }
}

export class AIConfigurationError extends AIError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "AIConfigurationError";
  }
}
