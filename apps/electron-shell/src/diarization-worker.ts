/**
 * Diarization Worker — runs as a child process with ELECTRON_RUN_AS_NODE=1
 *
 * Uses sherpa-onnx-node for offline speaker diarization:
 * - pyannote-segmentation-3.0 for speaker segmentation
 * - 3dspeaker for speaker embeddings
 *
 * Optimized for long sessions (1-2 hours):
 * - Processes audio in chunks (every 10 minutes)
 * - Uses overlap (1 minute) to match speaker IDs across chunks
 * - Clears processed audio to minimize memory usage (~58MB max)
 * - Accumulates results and sends merged output at the end
 */

import { join } from 'path';
import { existsSync } from 'fs';

let diarizer: any = null;
let isReady = false;
let isRecording = false;
let sampleRate = 16000;

// Audio buffer - only holds current chunk + overlap
let audioBuffer: Float32Array = new Float32Array(0);

// Chunked processing settings (balance between speed and accuracy)
const CHUNK_DURATION_SEC = 180; // Process every 3 minutes
const OVERLAP_DURATION_SEC = 30; // 30 seconds overlap for speaker matching

// Accumulated results across all chunks
interface DiarizationSegment {
  startMs: number;
  endMs: number;
  speaker: number;
}

let accumulatedResults: DiarizationSegment[] = [];
let totalProcessedMs = 0; // Total audio time processed so far (excluding current buffer)
let chunkIndex = 0;

// Speaker ID mapping: maps (chunkIndex, localSpeakerId) -> globalSpeakerId
let speakerMapping: Map<string, number> = new Map();
let nextGlobalSpeakerId = 0;

// Previous chunk's overlap data for speaker matching
let previousOverlapSegments: DiarizationSegment[] = [];

// Track last added segment end time to avoid duplicates
let lastAddedEndMs = 0;

/** Search for a model file. */
function findModel(relativePath: string): string | null {
  const dirs = [
    process.env.SOURDINE_MODELS_DIR,
    join(__dirname, '..', '..', '..', 'models'),
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    const full = join(dir, relativePath);
    if (existsSync(full)) return full;
  }
  return null;
}

async function initialize(): Promise<void> {
  try {
    console.log('[diarization-worker] Loading sherpa-onnx-node...');
    const sherpaOnnx = require('sherpa-onnx-node');
    console.log('[diarization-worker] sherpa-onnx-node loaded');

    const segmentationModel = findModel(join('diarization', 'sherpa-onnx-pyannote-segmentation-3-0', 'model.onnx'));
    if (!segmentationModel) {
      console.log('[diarization-worker] Segmentation model not found, diarization disabled');
      process.send?.({ type: 'not-available', data: 'Segmentation model not found' });
      return;
    }
    console.log('[diarization-worker] Segmentation model:', segmentationModel);

    const embeddingModel = findModel(join('diarization', '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'));
    if (!embeddingModel) {
      console.log('[diarization-worker] Embedding model not found, diarization disabled');
      process.send?.({ type: 'not-available', data: 'Embedding model not found' });
      return;
    }
    console.log('[diarization-worker] Embedding model:', embeddingModel);

    const config = {
      segmentation: {
        pyannote: {
          model: segmentationModel,
        },
      },
      embedding: {
        model: embeddingModel,
      },
      clustering: {
        numClusters: -1,
        threshold: 0.5,
      },
      minDurationOn: 0.3,
      minDurationOff: 0.5,
    };

    console.log('[diarization-worker] Creating OfflineSpeakerDiarization...');
    diarizer = new sherpaOnnx.OfflineSpeakerDiarization(config);
    sampleRate = diarizer.sampleRate || 16000;
    console.log('[diarization-worker] Diarizer created, sampleRate:', sampleRate);

    isReady = true;
    process.send?.({ type: 'ready' });
  } catch (err: any) {
    const message = err?.message || err?.toString?.() || 'Unknown initialization error';
    console.error('[diarization-worker] Init error:', message);
    if (err?.stack) console.error('[diarization-worker] Stack:', err.stack);
    process.send?.({ type: 'error', data: message });
  }
}

function appendAudio(samples: number[]): void {
  if (!isRecording) return;

  // Convert Int16 to Float32
  const float32Samples = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    float32Samples[i] = samples[i] / 32768.0;
  }

  // Append to buffer
  const newBuffer = new Float32Array(audioBuffer.length + float32Samples.length);
  newBuffer.set(audioBuffer);
  newBuffer.set(float32Samples, audioBuffer.length);
  audioBuffer = newBuffer;

  // Check if we should process a chunk (every 10 minutes)
  const bufferDurationSec = audioBuffer.length / sampleRate;
  if (isReady && bufferDurationSec >= CHUNK_DURATION_SEC) {
    processChunk();
  }
}

/**
 * Process current audio chunk and accumulate results.
 * Keeps overlap audio for speaker matching with next chunk.
 */
function processChunk(): void {
  if (!diarizer || !isReady || audioBuffer.length < sampleRate) return;

  const chunkDurationSec = audioBuffer.length / sampleRate;
  console.log(`[diarization-worker] Processing chunk ${chunkIndex} (${Math.round(chunkDurationSec)}s, total: ${Math.round(totalProcessedMs / 1000)}s)`);
  const startTime = Date.now();

  try {
    const segments = diarizer.process(audioBuffer);
    const elapsedMs = Date.now() - startTime;
    console.log(`[diarization-worker] Chunk ${chunkIndex} done in ${elapsedMs}ms, found ${segments.length} segments`);

    // Convert to our format with absolute timestamps
    const chunkResults: DiarizationSegment[] = segments.map((seg: any) => ({
      startMs: totalProcessedMs + seg.start * 1000,
      endMs: totalProcessedMs + seg.end * 1000,
      speaker: seg.speaker,
    }));

    // Map local speaker IDs to global IDs
    const mappedResults = mapSpeakerIds(chunkResults, chunkIndex);

    // Calculate overlap boundary
    const overlapStartMs = totalProcessedMs + (chunkDurationSec - OVERLAP_DURATION_SEC) * 1000;

    // Add ALL results up to overlap midpoint to avoid gaps
    // Overlap zone will be re-processed in next chunk for better accuracy
    const cutoffMs = overlapStartMs + (OVERLAP_DURATION_SEC * 500); // midpoint of overlap
    const resultsToAdd = mappedResults.filter(seg => seg.endMs <= cutoffMs);
    accumulatedResults.push(...resultsToAdd);

    // Store overlap segments for speaker matching with next chunk
    previousOverlapSegments = mappedResults.filter(seg => seg.startMs >= overlapStartMs);

    // Update total processed time (excluding overlap that stays in buffer)
    const processedDurationSec = chunkDurationSec - OVERLAP_DURATION_SEC;
    totalProcessedMs += processedDurationSec * 1000;

    // Track where we stopped adding results (to avoid duplicates in final chunk)
    lastAddedEndMs = cutoffMs;

    // Trim buffer to keep only overlap
    const overlapSamples = Math.floor(OVERLAP_DURATION_SEC * sampleRate);
    audioBuffer = audioBuffer.slice(-overlapSamples);

    chunkIndex++;

    console.log(`[diarization-worker] Buffer trimmed to ${audioBuffer.length} samples (${OVERLAP_DURATION_SEC}s overlap), accumulated ${accumulatedResults.length} segments`);
  } catch (err: any) {
    console.error('[diarization-worker] Chunk processing error:', err.message);
  }
}

/**
 * Map local speaker IDs from a chunk to global speaker IDs.
 * Uses overlap with previous chunk to match speakers.
 */
function mapSpeakerIds(segments: DiarizationSegment[], chunk: number): DiarizationSegment[] {
  if (chunk === 0) {
    // First chunk: create new global IDs for all speakers
    const localToGlobal = new Map<number, number>();
    return segments.map(seg => {
      if (!localToGlobal.has(seg.speaker)) {
        localToGlobal.set(seg.speaker, nextGlobalSpeakerId++);
      }
      return { ...seg, speaker: localToGlobal.get(seg.speaker)! };
    });
  }

  // Match speakers using overlap with previous chunk
  const localToGlobal = new Map<number, number>();

  // Find segments in the overlap zone
  const overlapStartMs = totalProcessedMs; // Start of current overlap zone
  const overlapEndMs = totalProcessedMs + OVERLAP_DURATION_SEC * 1000;
  const currentOverlapSegments = segments.filter(
    seg => seg.startMs < overlapEndMs && seg.endMs > overlapStartMs
  );

  // Match current speakers to previous speakers based on time overlap
  for (const currSeg of currentOverlapSegments) {
    if (localToGlobal.has(currSeg.speaker)) continue;

    // Find best matching previous speaker (most time overlap)
    let bestMatch = -1;
    let bestOverlap = 0;

    for (const prevSeg of previousOverlapSegments) {
      const overlapStart = Math.max(currSeg.startMs, prevSeg.startMs);
      const overlapEnd = Math.min(currSeg.endMs, prevSeg.endMs);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = prevSeg.speaker;
      }
    }

    if (bestMatch >= 0 && bestOverlap > 100) { // At least 100ms overlap
      localToGlobal.set(currSeg.speaker, bestMatch);
      console.log(`[diarization-worker] Matched speaker ${currSeg.speaker} -> global ${bestMatch} (${bestOverlap}ms overlap)`);
    }
  }

  // Assign new global IDs to unmatched speakers
  return segments.map(seg => {
    if (!localToGlobal.has(seg.speaker)) {
      localToGlobal.set(seg.speaker, nextGlobalSpeakerId++);
      console.log(`[diarization-worker] New speaker ${seg.speaker} -> global ${localToGlobal.get(seg.speaker)}`);
    }
    return { ...seg, speaker: localToGlobal.get(seg.speaker)! };
  });
}

/**
 * Process final chunk and send all accumulated results.
 * Handles all durations: 2 min, 5 min, 30 min, 4 hours.
 */
function finalizeDiarization(): void {
  if (!diarizer || !isReady) {
    process.send?.({ type: 'diarization-result', data: { segments: accumulatedResults } });
    return;
  }

  // Process remaining audio if any (at least 1 second)
  if (audioBuffer.length >= sampleRate) {
    const finalDurationSec = audioBuffer.length / sampleRate;
    const isFirstChunk = chunkIndex === 0;
    console.log(`[diarization-worker] Processing final chunk (${Math.round(finalDurationSec)}s, isFirst: ${isFirstChunk})`);
    const startTime = Date.now();

    try {
      const segments = diarizer.process(audioBuffer);
      const elapsedMs = Date.now() - startTime;
      console.log(`[diarization-worker] Final chunk done in ${elapsedMs}ms, found ${segments.length} segments`);

      const chunkResults: DiarizationSegment[] = segments.map((seg: any) => ({
        startMs: totalProcessedMs + seg.start * 1000,
        endMs: totalProcessedMs + seg.end * 1000,
        speaker: seg.speaker,
      }));

      const mappedResults = mapSpeakerIds(chunkResults, chunkIndex);

      if (isFirstChunk) {
        // Short session (< 10 min): no previous chunks, add everything
        accumulatedResults.push(...mappedResults);
      } else {
        // Long session: avoid duplicates with previously added segments
        const newResults = mappedResults.filter(seg => seg.startMs >= lastAddedEndMs - 500); // 500ms tolerance
        accumulatedResults.push(...newResults);
      }
    } catch (err: any) {
      console.error('[diarization-worker] Final chunk error:', err.message);
    }
  }

  // Sort by start time to ensure correct order
  accumulatedResults.sort((a, b) => a.startMs - b.startMs);

  console.log(`[diarization-worker] Diarization complete: ${accumulatedResults.length} segments, ${nextGlobalSpeakerId} speakers`);
  process.send?.({ type: 'diarization-result', data: { segments: accumulatedResults } });
}

function resetState(): void {
  audioBuffer = new Float32Array(0);
  accumulatedResults = [];
  totalProcessedMs = 0;
  chunkIndex = 0;
  speakerMapping.clear();
  nextGlobalSpeakerId = 0;
  previousOverlapSegments = [];
  lastAddedEndMs = 0;
}

function startRecording(): void {
  isRecording = true;
  resetState();
  console.log('[diarization-worker] Recording started, state reset');
}

function stopRecording(): void {
  isRecording = false;
  console.log('[diarization-worker] Recording stopped, finalizing...');
  // Signal that processing is starting
  process.send?.({ type: 'processing', data: true });
  finalizeDiarization();
  // Signal that processing is done
  process.send?.({ type: 'processing', data: false });
  // Don't reset state here - keep results for potential re-queries
}

// Message handler
process.on('message', (msg: any) => {
  switch (msg.type) {
    case 'audio-chunk':
      appendAudio(msg.data);
      break;

    case 'start-recording':
      startRecording();
      break;

    case 'stop-recording':
      stopRecording();
      break;

    case 'run-diarization':
      finalizeDiarization();
      break;

    case 'shutdown':
      isRecording = false;
      resetState();
      diarizer = null;
      process.exit(0);
      break;
  }
});

// Bootstrap
initialize();
