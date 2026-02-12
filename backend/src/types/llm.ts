export type LLMProvider = 'cliproxy' | 'anthropic';

export type LLMFeatureContext = 'template-adapter' | 'executive-report' | 'general';

export interface LLMStreamChunk {
  text: string;
  done: boolean;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMGenerateRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  feature?: LLMFeatureContext;
}

export interface LLMProviderStatus {
  provider: LLMProvider;
  available: boolean;
  error?: string;
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
