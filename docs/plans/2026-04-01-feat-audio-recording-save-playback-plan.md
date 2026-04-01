---
title: "feat: Audio recording save, playback & re-transcription"
type: feat
status: active
date: 2026-04-01
---

# feat: Audio Recording Save, Playback & Re-transcription

## Overview

Save audio recordings alongside each session, enable playback in the session detail view, and allow re-transcription with a different STT provider/model. Audio is written as WAV during recording (zero encoding overhead) and compressed to Opus after the session ends.

## Problem Statement

Audio chunks currently flow from mic/system capture to STT and are discarded. Users who switch to a better STT provider later cannot re-transcribe past meetings. Saving audio also enables playback for review.

## Proposed Solution

Add an `AudioRecorderService` in the backend that receives the same audio chunks as `SttService`, writes them to a WAV file in real time, and compresses to Opus on stop. A global setting controls whether audio is saved (on by default). The renderer gets a playback UI and a "Re-transcribe" button.

## Technical Approach

### Architecture

```
AudioService.handleAudioChunk(samples)
  ├── SttService.feedAudioChunk()        [existing — transcription]
  ├── DiarizationService.feedAudioChunk() [existing — speaker ID]
  └── AudioRecorderService.writeChunk()   [NEW — save to WAV]

AudioService.handleSystemAudioChunk(samples)
  ├── SttService.feedAudioChunk()        [existing]
  └── AudioRecorderService.writeMixedChunk() [NEW — mix + save]

Recording stops:
  → AudioRecorderService.finalize()
  → WAV file closed with correct header
  → Background: compress WAV → Opus, delete WAV
  → Store audio_path in sessions table
```

### Storage

- **Location:** `~/Library/Application Support/VoxTape/recordings/{sessionId}.wav` (then `.opus`)
- **Size:** WAV ~1.9 MB/min, Opus ~0.1 MB/min at 16kHz mono
- **1-hour meeting:** ~6 MB in Opus

### Implementation Phases

#### Phase 1: AudioRecorderService + WAV Writing

**Goal:** Save raw audio to WAV file during recording.

**Tasks:**

- [ ] Create `AudioRecorderService` (`libs/backend/src/lib/audio-recorder/`)
  - `audio-recorder.service.ts`: NestJS injectable
  - `start(sessionId: string, recordingsDir: string): void` — open WAV file, write header placeholder
  - `writeChunk(samples: Int16Array): void` — append PCM data
  - `stop(): Promise<string>` — finalize WAV header (update data size), return file path
  - `audio-recorder.module.ts`: NestJS module
- [ ] Create WAV header utility (`libs/backend/src/lib/audio-recorder/wav-header.ts`)
  - `createWavHeader(sampleRate: number, channels: number, bitsPerSample: number, dataSize: number): Buffer`
  - `updateWavHeaderSize(fd: number, dataSize: number): void`
- [ ] Inject `AudioRecorderService` into `AudioService`
  - In `handleAudioChunk()`: forward mic samples to recorder
  - In `handleSystemAudioChunk()`: mix with latest mic chunk using `mixAudioChannels()`, forward to recorder
  - In `startRecording()`: call `audioRecorderService.start(sessionId, recordingsDir)`
  - In `stopRecording()`: call `audioRecorderService.stop()`
- [ ] Add `audio.saveRecordings` to `VoxTapeConfig` (default: `true`)
- [ ] Add to config whitelists (main.ts + security-utils.ts)
- [ ] Set recordings dir in `bootstrapNest()`: `join(userData, 'recordings')`
- [ ] Pass `sessionId` from main.ts recording start to AudioService

**Files to create:**
- `libs/backend/src/lib/audio-recorder/audio-recorder.service.ts`
- `libs/backend/src/lib/audio-recorder/audio-recorder.module.ts`
- `libs/backend/src/lib/audio-recorder/wav-header.ts`

**Files to modify:**
- `libs/backend/src/lib/audio/audio.service.ts` — inject recorder, forward chunks
- `libs/backend/src/lib/audio/audio.module.ts` — import AudioRecorderModule
- `libs/backend/src/lib/backend.module.ts` — import AudioRecorderModule
- `libs/backend/src/index.ts` — export new module/service
- `libs/backend/src/lib/config/config.service.ts` — add `audio.saveRecordings`
- `libs/shared-types/src/lib/security-utils.ts` — whitelist new key
- `apps/electron-shell/src/main.ts` — whitelist + pass sessionId/recordingsDir

#### Phase 2: Database + Session Integration

**Goal:** Track audio file path in database, clean up on session delete.

**Tasks:**

- [ ] Add `audio_path` column to sessions table (migration in `database.service.ts`)
- [ ] Update `saveSession()` to accept and store `audioPath`
- [ ] Update `getSession()` to return `audioPath`
- [ ] Update `deleteSession()` to delete audio file from disk
- [ ] Add `audioPath` to session save payload from main.ts after recording stops
- [ ] Add IPC handler `session:audio-path` to return audio file path for a session
- [ ] Add `audioPath` to preload API

**Files to modify:**
- `libs/backend/src/lib/database/database.service.ts`
- `apps/electron-shell/src/main.ts`
- `apps/electron-shell/src/preload.ts`
- `libs/shared-types/src/ipc-channels.ts`

#### Phase 3: Opus Compression (Background)

**Goal:** Compress WAV to Opus after recording ends, delete WAV.

**Tasks:**

- [ ] Add Opus encoding via `ffmpeg` or `opusenc` CLI (shipped with macOS via Homebrew, or bundle a static binary)
  - Alternative: use `node-opus` or write raw Opus via WebAssembly — evaluate complexity
  - Simplest: spawn `ffmpeg -i input.wav -c:a libopus -b:a 32k output.opus` as child process
- [ ] In `AudioRecorderService.stop()`: after WAV finalized, spawn background compression
- [ ] On compression complete: update `audio_path` in database from `.wav` to `.opus`, delete `.wav`
- [ ] If compression fails: keep WAV, log warning
- [ ] Add `ffmpeg` availability check at startup (optional dependency)

**Files to modify:**
- `libs/backend/src/lib/audio-recorder/audio-recorder.service.ts`

#### Phase 4: Playback UI

**Goal:** HTML audio player in session detail view.

**Tasks:**

- [ ] Add audio player component (`apps/renderer/src/app/layout/session-detail/audio-player/`)
  - Load audio via `session:audio-path` IPC → use `file://` protocol or serve via custom protocol
  - Play/pause button, seek bar, current time / total time display
  - Retro pixel styling matching existing theme
- [ ] Show player only when `audioPath` exists for the session
- [ ] Register Electron protocol handler for `voxtape-audio://` to serve audio files securely
- [ ] Add i18n keys: `audio.play`, `audio.pause`, `audio.noRecording`

**Files to create:**
- `apps/renderer/src/app/layout/session-detail/audio-player/audio-player.component.ts`
- `apps/renderer/src/app/layout/session-detail/audio-player/audio-player.component.html`
- `apps/renderer/src/app/layout/session-detail/audio-player/audio-player.component.scss`

**Files to modify:**
- Session detail component (add `<sdn-audio-player>`)
- `apps/electron-shell/src/main.ts` — register protocol handler
- `apps/renderer/src/assets/i18n/en.json`, `fr.json`

#### Phase 5: Re-transcribe

**Goal:** Button to re-run STT on saved audio with current provider config.

**Tasks:**

- [ ] Add "Re-transcribe" button in session detail (visible when audio exists)
- [ ] Add IPC handler `session:retranscribe` in main.ts
  - Load audio file from disk
  - Read chunks (decode WAV/Opus to PCM)
  - Feed chunks to SttService sequentially (simulating real-time feed)
  - Collect new segments
  - Replace existing segments in database
  - Send updated segments to renderer
- [ ] Show progress indicator during re-transcription
- [ ] Add i18n keys: `session.retranscribe`, `session.retranscribing`

**Files to modify:**
- Session detail component
- `apps/electron-shell/src/main.ts`
- `libs/shared-types/src/ipc-channels.ts`
- `apps/renderer/src/assets/i18n/en.json`, `fr.json`

#### Phase 6: Settings UI + Cleanup

**Tasks:**

- [ ] Add "Save audio recordings" toggle in Settings (Audio section)
- [ ] Add "Delete all recordings" button in Settings (with size display)
- [ ] Calculate total recordings size for display
- [ ] Add i18n keys for settings labels
- [ ] Clean up recordings when app is reset (`config:reset` handler)

## Acceptance Criteria

- [ ] Audio saved as WAV during recording when setting is enabled
- [ ] WAV compressed to Opus in background after recording ends
- [ ] Audio file path stored in sessions table
- [ ] Audio deleted when session is deleted
- [ ] Playback UI shows in session detail when audio exists
- [ ] Play/pause, seek, and time display work correctly
- [ ] Re-transcribe button feeds saved audio to current STT provider
- [ ] Re-transcription replaces existing segments
- [ ] Global setting to enable/disable audio saving (default: on)
- [ ] All UI bilingual (FR/EN)
- [ ] No audio saved when setting is disabled
- [ ] Opus compression handles failure gracefully (keeps WAV)

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| Opus encoding dependency (ffmpeg) | Check availability at startup; fall back to keeping WAV if ffmpeg absent |
| Disk space usage | Show recording size in settings; provide "Delete all" button |
| Large audio files in memory during re-transcribe | Stream from disk in chunks, don't load entire file |
| Electron file:// protocol security | Use custom `voxtape-audio://` protocol with session ID validation |

## References

- Audio service: `libs/backend/src/lib/audio/audio.service.ts`
- Audio mixer: `libs/backend/src/lib/stt/audio-mixer.ts`
- Database schema: `libs/backend/src/lib/database/database.service.ts`
- Config service: `libs/backend/src/lib/config/config.service.ts`
- Session service: `apps/renderer/src/app/services/session.service.ts`
- Main process IPC: `apps/electron-shell/src/main.ts`
- Brainstorm: `docs/brainstorms/2026-04-01-audio-recording-save-playback-brainstorm.md`
