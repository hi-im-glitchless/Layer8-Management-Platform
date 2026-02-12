import Anthropic from '@anthropic-ai/sdk';
import type { LLMMessage, LLMStreamChunk } from '../../../types/llm.js';

export class AnthropicProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *stream(
    messages: LLMMessage[],
    model: string,
    maxTokens?: number,
    signal?: AbortSignal,
  ): AsyncGenerator<LLMStreamChunk> {
    // Anthropic requires system message as a top-level param, not in messages array
    let systemPrompt: string | undefined;
    const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else {
        anthropicMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    const response = await this.client.messages.create(
      {
        model,
        max_tokens: maxTokens ?? 4096,
        messages: anthropicMessages,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        stream: true,
      },
      { signal },
    );

    let usage: { inputTokens: number; outputTokens: number } | undefined;

    for await (const event of response) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield { text: event.delta.text, done: false };
      }

      if (event.type === 'message_start' && event.message.usage) {
        usage = {
          inputTokens: event.message.usage.input_tokens,
          outputTokens: 0,
        };
      }

      if (event.type === 'message_delta' && event.usage) {
        usage = {
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: event.usage.output_tokens,
        };
      }
    }

    yield { text: '', done: true, usage };
  }

  healthCheck(): boolean {
    return true;
  }
}
