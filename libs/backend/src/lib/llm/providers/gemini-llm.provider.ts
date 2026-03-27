import type { LlmProvider, LlmProviderOptions, LlmProviderStreamResult } from './llm-provider.interface.js';
import { parseSSEStream } from '../sse-parser.js';

export class GeminiLlmProvider implements LlmProvider {
  readonly id = 'gemini' as const;

  async *stream(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    options: LlmProviderOptions,
    signal: AbortSignal,
  ): AsyncGenerator<LlmProviderStreamResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${options.model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          maxOutputTokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0.7,
        },
      }),
      signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Gemini API error ${response.status}: ${body}`);
    }

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of parseSSEStream(response)) {
      try {
        const data = JSON.parse(event.data);

        // Extract text from candidates
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          yield { token: text };
        }

        // Extract usage metadata
        if (data.usageMetadata) {
          inputTokens = data.usageMetadata.promptTokenCount ?? inputTokens;
          outputTokens = data.usageMetadata.candidatesTokenCount ?? outputTokens;
        }
      } catch {
        // Skip malformed JSON
      }
    }

    if (inputTokens || outputTokens) {
      yield { inputTokens, outputTokens };
    }
  }
}
