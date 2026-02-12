import type { LlmSettings } from '@prisma/client';
import type {
  LLMFeatureContext,
  LLMMessage,
  LLMProviderStatus,
  LLMStreamChunk,
} from '../../types/llm.js';
import { getLlmSettings } from '../settings.js';
import { CLIProxyProvider } from './providers/cliproxy.js';
import { AnthropicProvider } from './providers/anthropic.js';

export class LLMClient {
  private cliproxy: CLIProxyProvider;
  private anthropic: AnthropicProvider | null;
  private settings: LlmSettings;

  constructor(settings: LlmSettings) {
    this.settings = settings;
    this.cliproxy = new CLIProxyProvider(settings.cliproxyBaseUrl);
    this.anthropic =
      settings.anthropicApiKey && settings.fallbackEnabled
        ? new AnthropicProvider(settings.anthropicApiKey)
        : null;
  }

  resolveModel(feature?: LLMFeatureContext): string {
    switch (feature) {
      case 'template-adapter':
        return this.settings.templateAdapterModel;
      case 'executive-report':
        return this.settings.executiveReportModel;
      default:
        return this.settings.defaultModel;
    }
  }

  async *generateStream(
    messages: LLMMessage[],
    options?: {
      maxTokens?: number;
      signal?: AbortSignal;
      feature?: LLMFeatureContext;
    },
  ): AsyncGenerator<LLMStreamChunk> {
    const model = this.resolveModel(options?.feature);

    // Try CLIProxyProvider first
    try {
      yield* this.cliproxy.stream(
        messages,
        model,
        options?.maxTokens,
        options?.signal,
      );
      return;
    } catch (error) {
      // If no fallback configured, throw immediately
      if (!this.anthropic) {
        throw new Error(
          'CLIProxyAPI connection refused. Check that the service is running, or switch to API fallback in Settings.',
        );
      }
    }

    // Fallback to Anthropic
    try {
      yield* this.anthropic!.stream(
        messages,
        model,
        options?.maxTokens,
        options?.signal,
      );
    } catch (fallbackError) {
      throw new Error(
        'Both CLIProxyAPI and Anthropic API failed. Check provider configuration in Settings.',
      );
    }
  }

  async checkStatus(): Promise<LLMProviderStatus[]> {
    const statuses: LLMProviderStatus[] = [];

    try {
      const cliproxyOk = await this.cliproxy.healthCheck();
      statuses.push({
        provider: 'cliproxy',
        available: cliproxyOk,
        ...(!cliproxyOk ? { error: 'CLIProxyAPI is not reachable' } : {}),
      });
    } catch (error) {
      statuses.push({
        provider: 'cliproxy',
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    if (this.anthropic) {
      statuses.push({
        provider: 'anthropic',
        available: this.anthropic.healthCheck(),
      });
    }

    return statuses;
  }
}

export async function createLLMClient(): Promise<LLMClient> {
  const settings = await getLlmSettings();
  return new LLMClient(settings);
}
