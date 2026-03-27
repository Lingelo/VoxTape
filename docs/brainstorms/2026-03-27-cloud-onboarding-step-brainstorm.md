# Cloud Provider Option in Onboarding

**Date:** 2026-03-27
**Status:** Brainstorm

## What We're Building

A new onboarding step (inserted between System Audio and Model Installation) that presents users with a clear choice: run everything locally (download ~5GB of models) or use cloud APIs (enter an API key, skip the download). This makes first-run setup faster for users who prefer cloud providers while preserving the offline-first experience for those who want it.

## Why This Approach

The current onboarding forces a ~5GB model download before the app is usable. Users with cloud API keys shouldn't have to wait. A simple "Local vs Cloud" choice screen lets them skip the download entirely and start using VoxTape immediately.

**Approach chosen: Choice screen with simple mode selection**

A dedicated step shows two clear paths:
- **Local mode**: Download models (~5GB), everything offline
- **Cloud mode**: Enter one API key, skip download, start immediately

This is the cleanest UX because:
- Explicit trade-off is clear (download time vs API key)
- Non-technical users understand the choice
- Cloud users get a fast onboarding (skip 5GB download)
- Fine-grained provider/model selection deferred to Settings

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Placement | New step before Model Installation | User chooses mode before we decide what to download |
| Local models when cloud selected | Skippable | No forced 5GB download; user can download later in Settings |
| UX pattern | Choice screen (Local vs Cloud) | Clear trade-off, two explicit paths |
| Granularity | Simple mode (not per-provider) | Just "Local" or "Cloud" in onboarding; defaults to OpenAI LLM + Deepgram STT; fine-tune in Settings |
| Default cloud providers | OpenAI (LLM) + Deepgram (STT) | Most popular, best balance of quality and cost |

## Design Sketch

### New Step (between System Audio and Model Installation)

```
┌─────────────────────────────────────┐
│         How should VoxTape          │
│        process your meetings?       │
│                                     │
│  ┌───────────┐  ┌───────────────┐   │
│  │  LOCAL     │  │  CLOUD        │   │
│  │  ○ icon    │  │  ○ icon       │   │
│  │           │  │               │   │
│  │  100%     │  │  Better       │   │
│  │  offline  │  │  accuracy     │   │
│  │           │  │               │   │
│  │  ~5 GB    │  │  API key      │   │
│  │  download │  │  required     │   │
│  └───────────┘  └───────────────┘   │
│                                     │
│  [Continue]                         │
└─────────────────────────────────────┘
```

### Cloud Path (if selected)

```
┌─────────────────────────────────────┐
│       Connect your API keys         │
│                                     │
│  LLM (summaries & chat)            │
│  Provider: [OpenAI ▾]              │
│  [API Key input............] [Test] │
│  ✓ Valid                            │
│                                     │
│  STT (transcription) — optional     │
│  Provider: [Deepgram ▾]            │
│  [API Key input............] [Test] │
│                                     │
│  ℹ Keys are encrypted on device    │
│                                     │
│  [Continue]                         │
└─────────────────────────────────────┘
```

### Flow Changes

- **Local selected** → proceed to Model Installation (current step 4) as normal
- **Cloud selected** → show API key inputs → skip Model Installation → go to Ready screen
- At minimum, one valid LLM key is required. STT key is optional (falls back to local Whisper if STT models are available, or prompts download later).
- VAD model (2MB) always downloaded silently regardless of mode.

## Resolved Questions

1. **What if the user picks cloud but enters invalid keys?** Show inline validation errors. At minimum one valid LLM key required to proceed. User can switch back to local at any time.

2. **What about the VAD model (2MB)?** Always download silently — it's tiny (2MB), fast, and needed for speech detection indicators regardless of mode.

3. **Can user change their mind later?** Yes — Settings page has full provider/model configuration. Onboarding just sets the initial mode.

4. **Is STT key required in cloud mode?** No — LLM key is required (summaries are the core value), STT key is optional. Without cloud STT, local Whisper is used (user prompted to download STT model if missing).

5. **What if user picks cloud but has no internet later?** If local models were not downloaded, show a clear error: "No AI provider available. Connect to internet or download local models in Settings." This is an accepted trade-off for skipping the download.
