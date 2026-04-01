# Audio Recording Save & Playback

**Date:** 2026-04-01
**Status:** Brainstorm

## What We're Building

Save audio recordings alongside each session so users can play back meetings and re-run STT with different providers/models. Audio is saved as WAV during recording (fast, no encoding overhead), then compressed to Opus/OGG after the session ends (smaller storage). A playback UI in the session detail view allows listening back. A "Re-transcribe" button lets users re-run STT on saved audio with a different provider or model.

## Why This Approach

Currently, audio chunks are streamed directly to STT and discarded. Users who switch to a better STT provider later can't re-transcribe past meetings. Saving audio also enables playback for review, which is a common feature in meeting note apps (Granola, Otter, etc.).

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Audio saving | Global setting (on by default) | Users expect recording apps to save audio. Can disable in Settings for privacy. |
| Audio sources | Mix mic + system into one file | Single file, simpler, matches what a listener would hear |
| Format | WAV during recording, compress to Opus after | WAV is fast to write (no encoding). Opus post-processing saves ~95% storage. |
| Playback | In-app player in session detail view | Play/pause, seek bar, timestamp display |
| Re-transcribe | Button in session detail | Re-runs STT on saved audio with current provider/model config |
| Storage location | `~/Library/Application Support/VoxTape/recordings/{sessionId}.opus` | Alongside models and config in userData |

## Design Sketch

### Audio Save Flow

```
AudioService.handleAudioChunk(samples)
  → SttService.feedAudioChunk() [existing — transcription]
  → AudioRecorderService.writeChunk() [NEW — append to WAV buffer]

AudioService.handleSystemAudioChunk(samples)
  → SttService.feedAudioChunk() [existing]
  → AudioRecorderService.writeChunk() [NEW — mix with mic]

Recording stops:
  → AudioRecorderService.finalize()
  → Write WAV header
  → Spawn background Opus compression
  → Delete WAV after Opus is ready
  → Save audio path in sessions table
```

### Playback UI

```
┌─────────────────────────────────────┐
│ ▶  ━━━━━━━●━━━━━━━━━━  03:42/15:20 │
└─────────────────────────────────────┘
```

Simple HTML `<audio>` element styled to match the retro theme. Positioned in the session detail view header area.

### Re-transcribe Flow

```
User clicks "Re-transcribe" in session detail
  → Load audio file from disk
  → Feed chunks to SttService (current provider config)
  → Replace existing segments with new transcription
  → Save updated session
```

## Resolved Questions

1. **Storage impact?** WAV: ~1.9 MB/min at 16kHz mono. Opus: ~0.1 MB/min. A 1-hour meeting = ~6 MB in Opus. Manageable.

2. **What if user disables audio saving mid-session?** Setting only takes effect for new sessions. Current recording continues saving.

3. **Can user delete audio for a specific session?** Yes — add a "Delete audio" option per session. Transcript stays, audio is removed.

4. **How to mix mic + system during recording?** Use the same `mixAudioChannels` utility from the cloud STT feature. If only mic is active, save mic-only.

5. **Opus encoding dependency?** Use `@penfold/opus-encoder` or `opusenc` via a worker process to avoid blocking the main thread. Alternatively, use the simpler approach of keeping WAV and compressing lazily.
