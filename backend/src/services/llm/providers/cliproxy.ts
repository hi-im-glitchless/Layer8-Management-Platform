import OpenAI from 'openai';
import type { LLMMessage, LLMStreamChunk } from '../../../types/llm.js';
import { config } from '../../../config.js';

export class CLIProxyProvider {
  private client: OpenAI;
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:8317') {
    this.baseUrl = baseUrl;
    this.client = new OpenAI({
      baseURL: `${baseUrl}/v1`,
      apiKey: config.CLIPROXY_API_KEY,
    });
  }

  async *stream(
    messages: LLMMessage[],
    model: string,
    maxTokens?: number,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamChunk> {
    const openaiMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
    }));

    const response = await this.client.chat.completions.create(
      {
        model,
        messages: openaiMessages,
        stream: true,
        stream_options: { include_usage: true },
        ...(maxTokens != null ? { max_tokens: maxTokens } : {}),
      },
      { signal },
    );

    let usage: { inputTokens: number; outputTokens: number } | undefined;

    for await (const chunk of response) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        yield { text, done: false };
      }

      if (chunk.usage) {
        usage = {
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }

    yield { text: '', done: true, usage };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${config.CLIPROXY_API_KEY}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
