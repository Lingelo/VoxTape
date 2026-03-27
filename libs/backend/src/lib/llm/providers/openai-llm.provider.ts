import type { LlmProvider, LlmProviderOptions, LlmProviderStreamResult } from './llm-provider.interface.js';
import { parseSSEStream } from '../sse-parser.js';

export class OpenAiLlmProvider implements LlmProvider {
  readonly id = 'openai' as const;

  async *stream(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    options: LlmProviderOptions,
    signal: AbortSignal,
  ): AsyncGenerator<LlmProviderStreamResult> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    for await (const event of parseSSEStream(response)) {
      try {
        const chunk = JSON.parse(event.data);

        // Usage info comes in a separate chunk with choices: []
        if (chunk.usage) {
          yield {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
          continue;
        }

        const delta = chunk.choices?.[0]?.delta;
        if (delta?.content) {
          yield { token: delta.content };
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }
}
