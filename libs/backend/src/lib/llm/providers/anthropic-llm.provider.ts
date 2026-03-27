import type { LlmProvider, LlmProviderOptions, LlmProviderStreamResult } from './llm-provider.interface.js';
import { parseSSEStream } from '../sse-parser.js';

export class AnthropicLlmProvider implements LlmProvider {
  readonly id = 'anthropic' as const;

  async *stream(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    options: LlmProviderOptions,
    signal: AbortSignal,
  ): AsyncGenerator<LlmProviderStreamResult> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature ?? 0.7,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: HTTP ${response.status}`);
    }

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of parseSSEStream(response)) {
      try {
        const data = JSON.parse(event.data);

        switch (event.event) {
          case 'message_start':
            inputTokens = data.message?.usage?.input_tokens ?? 0;
            break;
          case 'content_block_delta':
            if (data.delta?.type === 'text_delta' && data.delta.text) {
              yield { token: data.delta.text };
            }
            break;
          case 'message_delta':
            outputTokens = data.usage?.output_tokens ?? 0;
            break;
          case 'message_stop':
            yield { inputTokens, outputTokens };
            break;
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }
}
