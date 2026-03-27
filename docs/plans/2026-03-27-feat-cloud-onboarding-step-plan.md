---
title: "feat: Add cloud provider choice to onboarding"
type: feat
status: active
date: 2026-03-27
---

# feat: Add Cloud Provider Choice to Onboarding

## Overview

Insert a new onboarding step (between System Audio and Model Installation) that lets users choose between local on-device AI and cloud providers. Cloud users enter API keys and skip the ~5GB model download, getting to a working app in seconds instead of minutes.

## Problem Statement

The current onboarding forces every user through a ~5GB model download before the app is usable. Users who have cloud API keys (OpenAI, Deepgram) shouldn't have to wait. A choice screen at onboarding lets them skip the download entirely.

## Proposed Solution

Add a new step 4 ("AI Mode") to the onboarding flow. The current step 4 (Model Installation) becomes step 5, and the Ready screen becomes step 6. Total steps go from 6 to 7.

### Flow

```
Step 0: Language
Step 1: Welcome
Step 2: Microphone
Step 3: System Audio
Step 4: AI Mode Choice     ← NEW
Step 5: Model Installation  (skipped if cloud mode)
Step 6: Ready
```

## Technical Approach

### Step 4a: Mode Selection Screen

Two cards side by side:

| Local | Cloud |
|-------|-------|
| 100% offline | Better accuracy |
| ~5GB download | API key required |
| No account needed | Faster setup |

User selects one and clicks Continue.

### Step 4b: API Key Entry (if cloud selected)

Shows inline within the same step (no extra navigation):
- LLM provider dropdown (default: OpenAI) + API key input with Test button
- STT provider dropdown (default: Deepgram) + API key input with Test button (optional)
- "Keys are encrypted on your device" note
- Continue button enabled when at least LLM key is validated

### Conditional Model Download Skip

If cloud mode selected:
- Always download VAD model silently (2MB, needed for speech indicators)
- Skip LLM and STT model downloads
- Jump from step 4 directly to step 6 (Ready)

If local mode selected:
- Proceed to step 5 (Model Installation) as today

## Implementation

### Phase 1: Component Changes

**Tasks:**

- [ ] Update `steps` array from `[0,1,2,3,4,5]` to `[0,1,2,3,4,5,6]` in `onboarding.component.ts`
- [ ] Bump all `@if (step === N)` for N >= 4 by +1 in `onboarding.component.html` (install becomes 5, ready becomes 6)
- [ ] Add `VoxTapeOnboardingApi.credentials` interface (matching settings pattern)
- [ ] Add `VoxTapeOnboardingApi.config.get()` to read current config for provider state
- [ ] Add component state: `aiMode: 'local' | 'cloud' = 'local'`, `llmProvider`, `sttProvider`, `llmKeyValid`, `sttKeyValid`
- [ ] Import `ApiKeyInputComponent` and `FormsModule` in onboarding component imports
- [ ] Add `@Output() statusChange` event to `ApiKeyInputComponent` so onboarding can track key validity

**Files to modify:**
- `apps/renderer/src/app/layout/onboarding/onboarding.component.ts`
- `apps/renderer/src/app/layout/onboarding/onboarding.component.html`
- `apps/renderer/src/app/layout/onboarding/onboarding.component.scss`
- `apps/renderer/src/app/layout/settings/api-key-input/api-key-input.component.ts`

### Phase 2: Template — Mode Selection (Step 4a)

**Tasks:**

- [ ] Add `@if (step === 4)` block with two selectable cards (Local / Cloud)
- [ ] Cards use retro pixel styling (no border-radius, beveled borders, green glow on selected)
- [ ] Selected card highlighted with `var(--accent-primary)` border
- [ ] Continue button always enabled (default selection is Local)
- [ ] Back button returns to System Audio step

### Phase 3: Template — API Key Entry (Step 4b, inline)

**Tasks:**

- [ ] When `aiMode === 'cloud'`, show API key section below the cards (within same step)
- [ ] LLM section: provider dropdown (OpenAI/Anthropic/Gemini) + `<app-api-key-input>`
- [ ] STT section: provider dropdown (Local/Deepgram) + `<app-api-key-input>` (if not local)
- [ ] "Keys are encrypted on your device" hint text
- [ ] Continue button disabled until LLM key is validated
- [ ] On Continue: save provider config via `config.set('llm.provider', ...)` and `config.set('stt.provider', ...)`

### Phase 4: Skip Logic

**Tasks:**

- [ ] In `nextStep()`: if `step === 4 && aiMode === 'cloud'`, set `this.step = 6` (skip model install, jump to Ready)
- [ ] In `nextStep()`: if `step === 4 && aiMode === 'cloud'`, trigger silent VAD model download (2MB)
- [ ] Update existing install guard: `if (this.step === 5 && this.installState !== 'done') return;` (was step 4)
- [ ] Update `finish()` step reference if needed

### Phase 5: i18n

**Tasks:**

- [ ] Add onboarding i18n keys to `en.json` and `fr.json`:
  - `onboarding.aiModeTitle` — "How should VoxTape process your meetings?"
  - `onboarding.aiModeSubtitle` — "You can change this later in Settings."
  - `onboarding.localTitle` — "Local"
  - `onboarding.localDesc` — "100% offline, ~5 GB download"
  - `onboarding.cloudTitle` — "Cloud"
  - `onboarding.cloudDesc` — "Better accuracy, API key required"
  - `onboarding.cloudKeysTitle` — "Connect your API keys"
  - `onboarding.cloudKeysHint` — "Keys are encrypted on your device"
  - `onboarding.llmLabel` — "Summaries & chat"
  - `onboarding.sttLabel` — "Transcription (optional)"

### Phase 6: ApiKeyInputComponent Enhancement

**Tasks:**

- [ ] Add `@Output() statusChange = new EventEmitter<'stored' | 'none' | 'testing' | 'valid' | 'failed'>()` to `ApiKeyInputComponent`
- [ ] Emit status on every state change (after test, after delete, on init)
- [ ] Override retro styling when used in onboarding context (no border-radius, pixel font)

## Acceptance Criteria

- [ ] New "AI Mode" step appears between System Audio and Model Installation
- [ ] Selecting "Local" proceeds to model download as before
- [ ] Selecting "Cloud" shows API key inputs inline
- [ ] At least one valid LLM key required to proceed in cloud mode
- [ ] STT key is optional (falls back to local Whisper if available)
- [ ] Cloud mode skips the 5GB model download step
- [ ] VAD model (2MB) always downloaded regardless of mode
- [ ] Provider and model config saved to `voxtape-config.json`
- [ ] API keys encrypted via safeStorage
- [ ] All new UI text bilingual (FR/EN)
- [ ] Retro pixel styling consistent with existing onboarding steps
- [ ] Back button works correctly through the new step
- [ ] Existing local-only onboarding flow unchanged for users who pick Local

## References

- Brainstorm: `docs/brainstorms/2026-03-27-cloud-onboarding-step-brainstorm.md`
- Onboarding component: `apps/renderer/src/app/layout/onboarding/onboarding.component.ts`
- ApiKeyInputComponent: `apps/renderer/src/app/layout/settings/api-key-input/api-key-input.component.ts`
- Provider types: `libs/shared-types/src/provider.types.ts`
- Cloud provider integration PR: Lingelo/VoxTape#6
