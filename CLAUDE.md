# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## Nx Guidelines

- Always run tasks through `nx` (`nx run`, `nx run-many`, `nx affected`) instead of underlying tooling directly
- Use the Nx MCP server tools: `nx_workspace` for architecture overview, `nx_project_details` for individual projects, `nx_docs` for configuration questions
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md` when available

<!-- nx configuration end-->

## Project Overview

**Sourdine** is a macOS Electron desktop app for real-time meeting transcription and AI-powered note-taking. All AI runs **on-device** (no API keys, fully offline): sherpa-onnx for speech-to-text (Parakeet TDT + Silero VAD) and node-llama-cpp for LLM features (Mistral 7B).

## Commands

```bash
# Development (Angular dev server + Electron with hot reload)
npm run dev

# Production build
npm run build

# Packaging
npm run package          # Electron Forge package → out/Sourdine-darwin-arm64/
npm run make             # Create DMG + ZIP distributables

# Nx tasks (prefer these for individual projects)
NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx serve renderer   # Angular dev server only
NX_IGNORE_UNSUPPORTED_TS_SETUP=true npx nx build renderer   # Angular prod build only
npx nx lint renderer
npx nx lint backend
npx nx lint shared-types

# Electron shell build (4 Vite builds: main, preload, stt-worker, llm-worker)
node apps/electron-shell/build.mjs

# Model downloads (required for first run)
npm run download-model       # STT: Silero VAD (2MB) + Parakeet TDT v3 int8 (640MB)
npm run download-llm-model   # LLM: Mistral 7B Q4_K_M (4.4GB)

# Icon generation
npm run generate-icon
```

**Note:** `NX_IGNORE_UNSUPPORTED_TS_SETUP=true` is required for Nx commands with Angular 21 + TypeScript 5.9.

## Architecture

### Multi-Process Design

```
┌─────────────────────────────────────────────────┐
│  Electron Main Process                          │
│  ┌─────────────────────────────────────────┐    │
│  │  NestJS Backend (DI container)          │    │
│  │  AudioModule → SttModule → stt-worker ──┼──→ Node child process (sherpa-onnx)
│  │  LlmModule ─────────────→ llm-worker ──┼──→ Node child process (node-llama-cpp)
│  │  DatabaseModule (better-sqlite3)        │    │
│  │  ConfigModule, ExportModule             │    │
│  │  ModelManagerModule                     │    │
│  └─────────────────────────────────────────┘    │
│  IPC Hub (ipcMain.on / ipcMain.handle)          │
└────────────────┬────────────────────────────────┘
                 │ contextBridge (preload.ts)
┌────────────────┴────────────────────────────────┐
│  Renderer Process (Angular 21 SPA)              │
│  ElectronIpcService → SessionService            │
│  AudioCaptureService (getUserMedia + Worklet)   │
│  LlmService (streaming tokens)                  │
│  Routes: / (main), /widget, /settings,          │
│          /onboarding                            │
└─────────────────────────────────────────────────┘
```

### Nx Monorepo Layout

| Project | Type | Stack | Purpose |
|---------|------|-------|---------|
| `apps/electron-shell` | App | Electron + Vite | Main process, preload, STT/LLM workers |
| `apps/renderer` | App | Angular 21 + SCSS | UI (standalone components, signals) |
| `libs/backend` | Lib | NestJS 11 | Backend services (audio, STT, LLM, DB, config, export, model-manager) |
| `libs/shared-types` | Lib | TypeScript | Shared interfaces, IPC channel constants |

### IPC Communication

**Channel naming**: domain-scoped (`audio:chunk`, `transcript:segment`, `llm:prompt`, `session:list`, etc.)

**Two patterns:**
- **Fire-and-forget** (`send`/`on`): Audio chunks, transcript segments, LLM tokens
- **Request-response** (`invoke`/`handle`): Session CRUD, model listing, config read/write

**Worker messages** use `{ type: string, data: any }` envelope over Node.js child process IPC.

### Data Flow: Recording → Transcription

```
Renderer AudioWorklet (48kHz → 16kHz Int16 PCM, 100ms chunks)
  → IPC audio:chunk
  → Main SttService → stt-worker (Silero VAD → Parakeet TDT)
  → process.send({ type: 'segment' })
  → Main emits transcript:segment → Renderer SessionService
  → Auto-save to SQLite (debounced 2s)
```

### Data Flow: LLM Enhancement

```
Renderer SessionService.enhanceNotes()
  → IPC llm:prompt { requestId, systemPrompt, userPrompt }
  → Main LlmService → llm-worker (lazy model load, streaming)
  → Token-by-token: llm:token → Renderer LlmService._streamedText$
  → On complete: llm:complete → SessionService extracts title + summary
```

### Database (Better-SQLite3)

Tables: `sessions`, `segments`, `ai_notes`, `folders` + FTS5 virtual tables (`sessions_fts`, `segments_fts`) with sync triggers. WAL mode enabled.

### Models

Workers search 3 locations in order:
1. `process.env.SOURDINE_MODELS_DIR` (set by main.ts → userData)
2. `__dirname/../../../models` (dev mode, project root)
3. `__dirname/../../resources/models` (prod, app.asar.unpacked)

On startup, main.ts migrates models from legacy paths to `~/Library/Application Support/Sourdine/models/`.

## Build System

**`npm run dev`** runs:
1. `node apps/electron-shell/build.mjs` — 4 parallel Vite builds (main, preload, stt-worker, llm-worker) → `apps/electron-shell/dist/`
2. `npx nx serve renderer` — Angular dev server on `:4200`
3. `electron apps/electron-shell/dist/main.js` — waits for `:4200` then launches

**`npm run package/make`** (`scripts/package.mjs`):
1. Nx prod build of renderer
2. Vite build of electron-shell
3. Copy renderer output → `apps/electron-shell/renderer/`
4. Electron Forge package/make (ASAR with native modules unpacked)

## Key Patterns

- **State management**: Pure RxJS BehaviorSubjects, no NgRx. Debounced auto-save via `_saveRequested$` Subject.
- **Angular**: Standalone components, signals, `providedIn: 'root'` singletons. NgZone-aware IPC callbacks.
- **Audio pipeline**: AudioWorklet resamples + converts to Int16, uses transferable ArrayBuffers (zero-copy).
- **LLM lazy init**: Model loads only on first prompt request (saves startup time).
- **Worker isolation**: STT and LLM run as `ELECTRON_RUN_AS_NODE=1` child processes — crash-safe, main survives worker failures.
- **Security**: Context isolation on, node integration off, minimal preload API via contextBridge, sandbox disabled (required for preload Node access).

## Native Dependencies (ASAR-unpacked)

- `sherpa-onnx-node` — Prebuilt binaries, no rebuild needed
- `node-llama-cpp` — llama.cpp Node bindings
- `better-sqlite3` — SQLite C++ bindings
