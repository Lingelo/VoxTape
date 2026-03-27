# Cloud LLM & STT Provider Integration

**Date:** 2026-03-27
**Status:** Brainstorm

## What We're Building

Optional cloud provider integration for both LLM (note enhancement/summarization) and STT (transcription), allowing users to choose between local on-device AI and cloud services (OpenAI, Anthropic, Gemini) via API keys. Local models always remain available as fallback. Security is a core requirement — API keys encrypted at rest via Electron safeStorage (OS keychain).

## Why This Approach

The current architecture is fully offline with on-device models (Ministral 3B for LLM, Whisper Turbo for STT). Cloud providers offer better accuracy and more powerful models, but should be opt-in to preserve the offline-first philosophy.

**Approach chosen: Provider abstraction in the main process (NestJS backend)**

The renderer already speaks a provider-agnostic protocol (`LlmPromptPayload` in, `LlmTokenPayload`/`LlmCompletePayload` out). Cloud providers slot into the main process `LlmService` and `SttService` as alternative backends. No renderer, preload, or IPC changes needed for the streaming flow.

This is the cleanest architecture because:
- AI routing lives in one place (main process)
- Renderer stays completely provider-agnostic
- No unnecessary worker processes for HTTP calls (process isolation is for native binaries, not fetch)
- NestJS DI makes provider injection natural

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Both LLM and STT | User wants to improve both enhancement and transcription |
| LLM providers (v1) | OpenAI + Anthropic + Gemini | All three major providers from day one |
| STT providers (v1) | Flexible — design abstraction, pick providers during planning | Avoids premature commitment to specific STT APIs |
| API key storage | Electron safeStorage | OS keychain-backed, no extra deps, encrypted at rest |
| Local fallback | Always available | Offline-first stays core. Users can switch back anytime |
| Architecture | Provider abstraction in main process | Cleanest — renderer untouched, single routing point, no over-engineering |
| Default model | User-configurable in settings | Per-provider model selection with sensible defaults |

## Design Sketch

### Provider Interface (LLM)

```
LlmProvider {
  id: string                    // 'local' | 'openai' | 'anthropic' | 'gemini'
  name: string                  // Display name
  models: Model[]               // Hardcoded supported models
  prompt(payload): AsyncStream  // Returns token stream
  validate(apiKey): boolean     // Test connection
}
```

### Provider Interface (STT)

```
SttProvider {
  id: string
  name: string
  start(): void                    // Open streaming connection (WebSocket/gRPC)
  feedAudio(chunk): void           // Send audio chunk to stream
  stop(): void                     // Close connection, flush final results
  onSegment(callback): void        // Emits transcript segments (same shape as local)
  onPartial(callback): void        // Emits partial/interim results
  validate(apiKey): boolean        // Test connection
}
```

### Config Extension

```
llm: {
  provider: 'local' | 'openai' | 'anthropic' | 'gemini'
  model: string              // e.g. 'gpt-4o', 'claude-sonnet-4-20250514', 'gemini-2.0-flash'
  // existing: modelPath, contextSize, temperature
}
stt: {
  provider: 'local' | 'openai' | 'deepgram' | ...
  model: string
  // existing: modelPath
}
```

API keys stored separately via safeStorage, NOT in the config JSON.

### New IPC Channels

- `api-key:set { provider, key }` — encrypt and store
- `api-key:validate { provider }` — test connection
- `api-key:delete { provider }` — remove key

### Settings UI Additions

- Provider selector (dropdown: Local / OpenAI / Anthropic / Gemini)
- API key input (password field) with "Test Connection" button
- Model selector (hardcoded list per provider)
- Per-provider settings (temperature, max tokens)

### Error Handling

- Cloud call fails mid-session: fall back to local provider automatically (if models downloaded), surface a non-blocking warning to the user
- Invalid/revoked API key: show clear error in settings, disable cloud provider until key is updated
- Rate limiting: retry with backoff, fall back to local if retries exhausted

## Resolved Questions

1. **STT streaming vs batch**: Real-time streaming required. Must match current UX where words appear as people speak. This limits cloud STT providers to those supporting WebSocket/streaming APIs.

2. **Cost awareness**: Yes — show token count and estimated cost per session. Helps users manage cloud expenses.

3. **Model listing**: Hardcoded curated list per provider, updated with app releases. No dynamic API fetching — simpler and works without a valid key.

4. **Cost tracking**: Track token count per session (store in `ai_notes` or `sessions` table). Estimate cost using hardcoded per-model pricing. Display in session detail view. Pricing updated with app releases alongside model lists.
