---
title: "feat: Cloud LLM & STT Provider Integration"
type: feat
status: active
date: 2026-03-27
---

# feat: Cloud LLM & STT Provider Integration

## Overview

Add optional cloud provider support for both LLM (note enhancement) and STT (transcription), allowing users to choose between on-device AI and cloud services (OpenAI, Anthropic, Gemini for LLM; Deepgram for STT) via API keys stored securely with Electron safeStorage. Local models remain available but are optional when cloud is configured.

## Problem Statement

VoxTape's fully on-device AI (Ministral 3B for LLM, Whisper Turbo for STT) provides privacy and offline capability but limits transcription accuracy and summarization quality. Users with cloud API keys should be able to leverage more powerful models while maintaining the app's security-first philosophy.

## Proposed Solution

Provider abstraction in the NestJS backend (main process). The renderer stays untouched — it already speaks a provider-agnostic protocol (`LlmPromptPayload` in, token stream out). Cloud providers slot into `LlmService` and `SttService` as alternative backends.

No provider SDKs — use native `fetch` for LLM streaming (SSE) and `ws` for STT streaming (WebSocket). Zero new dependencies beyond `ws` (already available via Electron's Node.js).

## Technical Approach

### Architecture

```
Renderer (unchanged)
  │  LlmPromptPayload / LlmTokenPayload
  │  transcript:segment / transcript:partial
  ▼
Main Process (NestJS)
  ├── LlmService (dispatcher)
  │   ├── LocalLlmProvider  → llm-worker (node-llama-cpp) [existing]
  │   ├── OpenAiLlmProvider → fetch SSE streaming
  │   ├── AnthropicLlmProvider → fetch SSE streaming
  │   └── GeminiLlmProvider → fetch SSE streaming
  │
  ├── SttService (dispatcher)
  │   ├── LocalSttProvider  → stt-worker (sherpa-onnx) [existing]
  │   └── DeepgramSttProvider → WebSocket streaming
  │
  └── CredentialService → safeStorage + credentials.json (encrypted)
```

### Implementation Phases

#### Phase 1: Foundation — Credential Storage & Config Extension

**Goal:** Secure API key management and config schema for provider selection.

**Tasks:**

1. **Create `CredentialService`** (`libs/backend/src/lib/credential/`)
   - `credential.service.ts`: NestJS injectable wrapping Electron safeStorage
   - `setCredential(provider: string, key: string): void` — encrypt with `safeStorage.encryptString()`, store as `latin1` in `credentials.json`
   - `getCredential(provider: string): string | null` — decrypt with `safeStorage.decryptString()`
   - `deleteCredential(provider: string): void`
   - `hasCredential(provider: string): boolean`
   - Storage file: `~/Library/Application Support/VoxTape/credentials.json` with format `{ "openai": "<latin1-encoded-encrypted>" }`
   - `credential.module.ts`: NestJS module

2. **Extend `VoxTapeConfig` interface** (`libs/backend/src/lib/config/config.service.ts`)
   ```typescript
   llm: {
     provider: 'local' | 'openai' | 'anthropic' | 'gemini';  // NEW — default 'local'
     model: string | null;           // NEW — cloud model ID, e.g. 'gpt-4o'
     modelPath: string | null;       // existing — local model path
     contextSize: number;            // existing
     temperature: number;            // existing
   };
   stt: {
     provider: 'local' | 'deepgram'; // NEW — default 'local'
     model: string | null;            // NEW — cloud model ID, e.g. 'nova-3'
     modelPath: string | null;        // existing
   };
   ```

3. **Update config whitelists** — BOTH locations must be updated:
   - `apps/electron-shell/src/main.ts` (lines 514-530): add `llm.provider`, `llm.model`, `stt.provider`, `stt.model`
   - `libs/shared-types/src/lib/security-utils.ts` (lines 50-61): same keys

4. **Add IPC handlers** in `apps/electron-shell/src/main.ts`:
   - `credential:set` (invoke/handle) — calls `credentialService.setCredential()`
   - `credential:get` (invoke/handle) — returns `credentialService.hasCredential()` (boolean only — never send raw key to renderer)
   - `credential:delete` (invoke/handle)
   - `credential:validate` (invoke/handle) — makes a minimal API call to verify key works

5. **Extend preload API** (`apps/electron-shell/src/preload.ts`):
   ```typescript
   credentials: {
     set: (provider: string, key: string) => ipcRenderer.invoke('credential:set', provider, key),
     has: (provider: string) => ipcRenderer.invoke('credential:get', provider),
     delete: (provider: string) => ipcRenderer.invoke('credential:delete', provider),
     validate: (provider: string, key: string) => ipcRenderer.invoke('credential:validate', provider, key),
   }
   ```

6. **Add IPC channel constants** (`libs/shared-types/src/ipc-channels.ts`):
   ```typescript
   CREDENTIAL_SET: 'credential:set',
   CREDENTIAL_GET: 'credential:get',
   CREDENTIAL_DELETE: 'credential:delete',
   CREDENTIAL_VALIDATE: 'credential:validate',
   ```

7. **Add shared types** (`libs/shared-types/src/provider.types.ts`):
   ```typescript
   export type LlmProviderId = 'local' | 'openai' | 'anthropic' | 'gemini';
   export type SttProviderId = 'local' | 'deepgram';

   export interface CloudModel {
     id: string;           // e.g. 'gpt-4o'
     name: string;         // e.g. 'GPT-4o'
     contextWindow: number;
     inputPricePerMToken: number;   // USD per million tokens
     outputPricePerMToken: number;
   }

   export interface SttCloudModel {
     id: string;
     name: string;
     pricePerMinute: number; // USD
   }
   ```

**Success criteria:**
- API keys can be stored, retrieved (main process only), and deleted
- Config accepts new provider/model fields with defaults
- Credential validation makes a real API call and returns success/failure

**Files to create:**
- `libs/backend/src/lib/credential/credential.service.ts`
- `libs/backend/src/lib/credential/credential.module.ts`
- `libs/shared-types/src/provider.types.ts`

**Files to modify:**
- `libs/backend/src/lib/config/config.service.ts` — VoxTapeConfig interface
- `libs/backend/src/lib/backend.module.ts` — import CredentialModule
- `libs/backend/src/index.ts` — export new module/service
- `libs/shared-types/src/ipc-channels.ts` — new channel constants
- `libs/shared-types/src/lib/security-utils.ts` — whitelist new keys
- `libs/shared-types/src/index.ts` — export new types
- `apps/electron-shell/src/main.ts` — IPC handlers + config whitelist
- `apps/electron-shell/src/preload.ts` — credentials API

---

#### Phase 2: Cloud LLM Providers

**Goal:** Route LLM prompts through cloud APIs with streaming, using the same event protocol.

**Tasks:**

1. **Create SSE stream parser utility** (`libs/backend/src/lib/llm/sse-parser.ts`)
   - `parseSSEStream(response: Response): AsyncGenerator<{ event?: string; data: unknown }>`
   - Handles `\r\n\r\n` block splitting, `data:` / `event:` parsing, `[DONE]` termination

2. **Create LLM provider interface and implementations** (`libs/backend/src/lib/llm/providers/`)
   ```typescript
   // llm-provider.interface.ts
   export interface LlmProvider {
     id: LlmProviderId;
     stream(
       apiKey: string,
       systemPrompt: string,
       userPrompt: string,
       options: { model: string; maxTokens?: number; temperature?: number },
       signal: AbortSignal,
     ): AsyncGenerator<{ token?: string; inputTokens?: number; outputTokens?: number }>;
   }
   ```
   - `openai-llm.provider.ts` — fetch `https://api.openai.com/v1/chat/completions` with `stream: true, stream_options: { include_usage: true }`
   - `anthropic-llm.provider.ts` — fetch `https://api.anthropic.com/v1/messages` with `stream: true`, parse `content_block_delta` events
   - `gemini-llm.provider.ts` — fetch `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={key}`

3. **Refactor `LlmService` as dispatcher** (`libs/backend/src/lib/llm/llm.service.ts`)
   - Inject `CredentialService` and `ConfigService`
   - `prompt(payload)`: check `config.llm.provider`
     - `'local'`: forward to existing child process worker (no changes)
     - `'openai'|'anthropic'|'gemini'`: get API key from CredentialService, stream via cloud provider, emit same `token`/`complete`/`error` events
   - Support `AbortController` for cancellation
   - On cloud error: if local model available, emit warning event and fall back

4. **Extend `LlmCompletePayload`** (`libs/shared-types/src/llm.types.ts`):
   ```typescript
   export interface LlmCompletePayload {
     requestId: string;
     fullText: string;
     tokensGenerated: number;  // existing (output tokens)
     inputTokens?: number;     // NEW
     outputTokens?: number;    // NEW
     estimatedCostUsd?: number; // NEW
     durationMs: number;
     provider?: LlmProviderId; // NEW
   }
   ```

5. **Hardcoded model registry** (`libs/backend/src/lib/llm/model-registry.ts`):
   ```typescript
   export const LLM_MODELS: Record<LlmProviderId, CloudModel[]> = {
     local: [], // managed separately
     openai: [
       { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, inputPricePerMToken: 2.5, outputPricePerMToken: 10 },
       { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, inputPricePerMToken: 0.15, outputPricePerMToken: 0.6 },
     ],
     anthropic: [
       { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000, inputPricePerMToken: 3, outputPricePerMToken: 15 },
       { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', contextWindow: 200000, inputPricePerMToken: 0.8, outputPricePerMToken: 4 },
     ],
     gemini: [
       { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', contextWindow: 1048576, inputPricePerMToken: 0.1, outputPricePerMToken: 0.4 },
     ],
   };
   ```

6. **Bypass map-reduce for large-context cloud models** (`apps/renderer/src/app/services/session.service.ts`)
   - In `enhanceNotes()`: if cloud provider active and model context window > transcript tokens, skip chunking and call `enhanceDirect()` directly
   - Requires new IPC to fetch model context window size, or embed it in config

**Success criteria:**
- User can select OpenAI/Anthropic/Gemini in settings, enter API key, and enhance notes using cloud LLM
- Token stream displays in UI identically to local LLM
- Cloud errors fall back to local (if available) with a warning
- Cancellation works mid-stream

**Files to create:**
- `libs/backend/src/lib/llm/sse-parser.ts`
- `libs/backend/src/lib/llm/providers/llm-provider.interface.ts`
- `libs/backend/src/lib/llm/providers/openai-llm.provider.ts`
- `libs/backend/src/lib/llm/providers/anthropic-llm.provider.ts`
- `libs/backend/src/lib/llm/providers/gemini-llm.provider.ts`
- `libs/backend/src/lib/llm/model-registry.ts`

**Files to modify:**
- `libs/backend/src/lib/llm/llm.service.ts` — add provider routing
- `libs/backend/src/lib/llm/llm.module.ts` — inject dependencies
- `libs/shared-types/src/llm.types.ts` — extend payloads
- `apps/renderer/src/app/services/session.service.ts` — map-reduce bypass

---

#### Phase 3: Cloud STT Provider (Deepgram)

**Goal:** Real-time streaming transcription via Deepgram WebSocket, matching the local STT UX.

**Tasks:**

1. **Create STT provider interface** (`libs/backend/src/lib/stt/providers/stt-provider.interface.ts`):
   ```typescript
   export interface SttProvider {
     id: SttProviderId;
     start(apiKey: string, options: { language: string; model: string }): void;
     feedAudio(chunk: Int16Array): void;
     stop(): void;
     onSegment(callback: (segment: TranscriptSegment) => void): void;
     onPartial(callback: (text: string) => void): void;
     onError(callback: (error: Error) => void): void;
   }
   ```

2. **Create Deepgram provider** (`libs/backend/src/lib/stt/providers/deepgram-stt.provider.ts`):
   - Opens WebSocket to `wss://api.deepgram.com/v1/listen` with params: `model=nova-3`, `language`, `sample_rate=16000`, `encoding=linear16`, `interim_results=true`, `punctuate=true`, `smart_format=true`
   - `feedAudio()`: converts Int16Array to Buffer, sends over WebSocket
   - Parses `Results` messages, maps to `TranscriptSegment` shape
   - KeepAlive every 8s to prevent timeout
   - `stop()`: sends `{ type: 'CloseStream' }`, waits for final results

3. **Audio mixer for dual-channel** (`libs/backend/src/lib/stt/audio-mixer.ts`):
   - When cloud STT active and both mic + system audio enabled
   - Mix both Int16 channels to a single mono stream before feeding to cloud provider
   - Simple averaging: `output[i] = (mic[i] + system[i]) / 2` with clipping

4. **Refactor `SttService` as dispatcher** (`libs/backend/src/lib/stt/stt.service.ts`):
   - Check `config.stt.provider`
   - `'local'`: use existing child process worker (unchanged)
   - `'deepgram'`: route audio through mixer → Deepgram provider
   - `feedAudioChunk()`: route to active provider
   - On cloud error: buffer incoming audio, lazy-reload local STT worker, replay buffer

5. **Audio buffer for failover** (`libs/backend/src/lib/stt/audio-buffer.ts`):
   - Circular buffer holding last 30 seconds of audio chunks
   - On failover: feed buffered audio to local STT worker after it initializes
   - Prevents audio loss during the 5-10s model load

6. **Hardcoded STT model registry** (`libs/backend/src/lib/stt/stt-model-registry.ts`):
   ```typescript
   export const STT_MODELS: Record<SttProviderId, SttCloudModel[]> = {
     local: [],
     deepgram: [
       { id: 'nova-3', name: 'Nova 3', pricePerMinute: 0.0043 },
       { id: 'nova-2', name: 'Nova 2', pricePerMinute: 0.0036 },
     ],
   };
   ```

**Success criteria:**
- User can select Deepgram STT, enter API key, and get real-time streaming transcription
- Dual-channel audio (mic + system) mixed to mono before cloud upload
- Segments appear in UI with same format as local STT
- Cloud STT failure triggers buffered failover to local (if model available)
- Provider switching blocked during active recording

**Files to create:**
- `libs/backend/src/lib/stt/providers/stt-provider.interface.ts`
- `libs/backend/src/lib/stt/providers/deepgram-stt.provider.ts`
- `libs/backend/src/lib/stt/audio-mixer.ts`
- `libs/backend/src/lib/stt/audio-buffer.ts`
- `libs/backend/src/lib/stt/stt-model-registry.ts`

**Files to modify:**
- `libs/backend/src/lib/stt/stt.service.ts` — add provider routing + failover
- `libs/backend/src/lib/stt/stt.module.ts` — inject dependencies

---

#### Phase 4: Settings UI & Cost Tracking

**Goal:** User-facing settings for provider/model selection and per-session cost display.

**Tasks:**

1. **Add "AI Providers" settings section** (`apps/renderer/src/app/layout/settings/`):
   - **LLM Provider**: dropdown (Local / OpenAI / Anthropic / Gemini)
   - **LLM Model**: dropdown (populated from hardcoded model registry, contextual to provider)
   - **STT Provider**: dropdown (Local / Deepgram)
   - **STT Model**: dropdown (contextual to provider)
   - **API Key per provider**: password input + "Test Connection" button + status indicator (valid/invalid/untested)
   - **Delete Key** button per provider
   - Dropdowns disabled during active recording (block mid-recording switch)
   - Place section between "Models" and "Keyboard Shortcuts" sections

2. **Add i18n keys** for settings labels (`apps/renderer/src/assets/i18n/en.json`, `fr.json`):
   - `settings.aiProviders`, `settings.llmProvider`, `settings.sttProvider`, `settings.apiKey`, `settings.testConnection`, `settings.connectionValid`, `settings.connectionFailed`, etc.

3. **Database migration for cost tracking** (`libs/backend/src/lib/database/database.service.ts`):
   ```sql
   ALTER TABLE sessions ADD COLUMN cloud_input_tokens INTEGER DEFAULT 0;
   ALTER TABLE sessions ADD COLUMN cloud_output_tokens INTEGER DEFAULT 0;
   ALTER TABLE sessions ADD COLUMN cloud_stt_seconds REAL DEFAULT 0;
   ALTER TABLE sessions ADD COLUMN cloud_estimated_cost_usd REAL DEFAULT 0;
   ALTER TABLE sessions ADD COLUMN llm_provider TEXT DEFAULT 'local';
   ALTER TABLE sessions ADD COLUMN stt_provider TEXT DEFAULT 'local';
   ```

4. **Update `SessionService` to track costs** (`apps/renderer/src/app/services/session.service.ts`):
   - On `llm:complete`: accumulate `inputTokens`, `outputTokens`, `estimatedCostUsd` into session
   - On STT: track audio duration sent to cloud
   - Save to database via existing debounced auto-save

5. **Display cost in session detail view** (`apps/renderer/src/app/layout/session-detail/`):
   - Show cloud token usage and estimated cost if `cloud_estimated_cost_usd > 0`
   - Format: "Cloud usage: 1,234 tokens (~$0.02)"

6. **Provider status indicator in recording UI**:
   - Small badge/icon showing active provider (e.g., cloud icon vs. local icon) near the recording controls
   - Warning indicator if cloud provider is degraded or failed over to local

**Success criteria:**
- Users can configure providers and API keys entirely from the Settings UI
- Cost per session displayed accurately
- Provider status visible during recording
- All UI elements bilingual (FR/EN)

**Files to modify:**
- `apps/renderer/src/app/layout/settings/settings.component.ts`
- `apps/renderer/src/app/layout/settings/settings.component.html`
- `apps/renderer/src/app/layout/settings/settings.component.scss`
- `apps/renderer/src/app/services/session.service.ts`
- `apps/renderer/src/assets/i18n/en.json`
- `apps/renderer/src/assets/i18n/fr.json`
- `libs/backend/src/lib/database/database.service.ts`
- Session detail component (template + TS)

---

## Acceptance Criteria

### Functional Requirements

- [ ] Users can store API keys for OpenAI, Anthropic, Gemini, and Deepgram
- [ ] API keys are encrypted at rest via Electron safeStorage (OS keychain)
- [ ] API keys never sent to renderer process (main process only)
- [ ] Users can select LLM provider (Local/OpenAI/Anthropic/Gemini) in settings
- [ ] Users can select STT provider (Local/Deepgram) in settings
- [ ] Users can select model per provider from hardcoded list
- [ ] "Test Connection" validates API key with a real API call
- [ ] Cloud LLM streams tokens with identical UX to local LLM
- [ ] Cloud STT streams transcription segments in real-time
- [ ] Dual-channel audio mixed to mono before cloud STT upload
- [ ] Provider switching blocked during active recording
- [ ] Cloud LLM failure falls back to local (if model available) with warning
- [ ] Cloud STT failure triggers buffered failover to local with audio buffer replay
- [ ] Token count and estimated cost tracked and displayed per session
- [ ] Local models are optional when cloud is configured
- [ ] Map-reduce pipeline bypassed when cloud model context window exceeds transcript size
- [ ] All UI bilingual (FR/EN)

### Non-Functional Requirements

- [ ] API keys never appear in logs, config JSON, or error messages
- [ ] Cloud HTTP timeouts: 30s for LLM (per-request), 10s for STT WebSocket connect
- [ ] Audio buffer holds 30s for failover
- [ ] No new native dependencies (use fetch for LLM, ws from Node.js for STT)
- [ ] Credential validation distinguishes auth errors from network errors

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| safeStorage unavailable (rare on macOS) | Check `isEncryptionAvailable()`, show error if unavailable |
| Cloud provider rate limiting | Retry with exponential backoff (3 attempts), then fall back to local |
| Deepgram WebSocket instability | KeepAlive pings every 8s, reconnect on drop, buffer audio during reconnect |
| Pricing changes invalidate hardcoded costs | Display "estimated" label, update pricing in app releases |
| User has no local models + no internet | Show clear error state: "No AI provider available. Connect to internet or download local models." |

## References & Research

### Internal References
- LLM service: `libs/backend/src/lib/llm/llm.service.ts`
- STT service: `libs/backend/src/lib/stt/stt.service.ts`
- Config service: `libs/backend/src/lib/config/config.service.ts`
- Config whitelist: `apps/electron-shell/src/main.ts:514-530`
- Security utils whitelist: `libs/shared-types/src/lib/security-utils.ts:50-61`
- IPC channels: `libs/shared-types/src/ipc-channels.ts`
- LLM types: `libs/shared-types/src/llm.types.ts`
- Preload: `apps/electron-shell/src/preload.ts`
- Settings UI: `apps/renderer/src/app/layout/settings/settings.component.ts`
- Database: `libs/backend/src/lib/database/database.service.ts`
- Brainstorm: `docs/brainstorms/2026-03-27-cloud-llm-stt-integration-brainstorm.md`

### External References
- Electron safeStorage API: electronjs.org/docs/latest/api/safe-storage
- OpenAI streaming: platform.openai.com/docs/api-reference/streaming
- Anthropic streaming: docs.anthropic.com/en/api/messages-streaming
- Gemini streaming: ai.google.dev/gemini-api/docs/text-generation#generate-a-text-stream
- Deepgram WebSocket: developers.deepgram.com/reference/speech-to-text/listen-streaming
