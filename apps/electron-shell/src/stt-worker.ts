/**
 * STT Worker — runs as a child process with ELECTRON_RUN_AS_NODE=1
 *
 * Loads Silero VAD + Parakeet TDT v3 via sherpa-onnx-node (native bindings).
 * Supports two independent audio channels (mic + system), each with its own
 * VAD instance, sharing a single recognizer. This prevents audio source
 * interleaving from confusing the VAD speech detection.
 */

import { join } from 'path';
import { existsSync } from 'fs';

let recognizer: any = null;

interface ChannelState {
  vad: any;
  isRecording: boolean;
  wasSpeaking: boolean;
  segmentCounter: number;
  source: 'mic' | 'system';
}

const channels: Record<string, ChannelState> = {};

/** Search for a model file.
 * SOURDINE_MODELS_DIR is set by main.ts to userData/models before spawning workers.
 * Dev fallback searches project root/models for local development.
 */
function findModel(relativePath: string): string | null {
  const dirs = [
    process.env.SOURDINE_MODELS_DIR,                      // Primary: ~/Library/Application Support/Sourdine/models
    join(__dirname, '..', '..', '..', 'models'),          // Dev fallback: project root/models
  ];
  for (const dir of dirs) {
    if (!dir) continue;
    const full = join(dir, relativePath);
    if (existsSync(full)) return full;
  }
  return null;
}

function createVad(sherpaOnnx: any, vadModelPath: string): any {
  return new sherpaOnnx.Vad(
    {
      sileroVad: {
        model: vadModelPath,
        threshold: 0.5,
        minSilenceDuration: 0.3,
        minSpeechDuration: 0.25,
        windowSize: 512,
        maxSpeechDuration: 15,
      },
      sampleRate: 16000,
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
    },
    30 // bufferSizeInSeconds
  );
}

async function initialize(): Promise<void> {
  try {
    console.log('[stt-worker] Loading sherpa-onnx-node...');
    const sherpaOnnx = require('sherpa-onnx-node');
    console.log('[stt-worker] sherpa-onnx-node loaded. Version:', sherpaOnnx.version);

    const vadModelPath = findModel(join('vad', 'silero_vad.onnx'));
    if (!vadModelPath) {
      throw new Error(
        'VAD model not found. Run "npm run download-model" first.'
      );
    }
    console.log('[stt-worker] VAD model:', vadModelPath);

    const parakeetEncoder = findModel(join('stt', 'encoder.int8.onnx'));
    const parakeetDecoder = findModel(join('stt', 'decoder.int8.onnx'));
    const parakeetJoiner = findModel(join('stt', 'joiner.int8.onnx'));
    const parakeetTokens = findModel(join('stt', 'tokens.txt'));

    if (!parakeetEncoder || !parakeetDecoder || !parakeetJoiner || !parakeetTokens) {
      throw new Error(
        'STT model files not found. Run "npm run download-model" first.'
      );
    }
    console.log('[stt-worker] STT model:', parakeetEncoder);

    // Create two VAD instances — one per audio source
    console.log('[stt-worker] Creating VAD (mic)...');
    const micVad = createVad(sherpaOnnx, vadModelPath);
    console.log('[stt-worker] Creating VAD (system)...');
    const sysVad = createVad(sherpaOnnx, vadModelPath);
    console.log('[stt-worker] VADs created');

    channels['mic'] = {
      vad: micVad,
      isRecording: false,
      wasSpeaking: false,
      segmentCounter: 0,
      source: 'mic',
    };

    channels['system'] = {
      vad: sysVad,
      isRecording: false,
      wasSpeaking: false,
      segmentCounter: 0,
      source: 'system',
    };

    // Single shared recognizer (the expensive part: ~640MB model)
    console.log('[stt-worker] Creating offline recognizer...');
    recognizer = new sherpaOnnx.OfflineRecognizer({
      featConfig: {
        sampleRate: 16000,
        featureDim: 80,
      },
      modelConfig: {
        transducer: {
          encoder: parakeetEncoder,
          decoder: parakeetDecoder,
          joiner: parakeetJoiner,
        },
        tokens: parakeetTokens,
        numThreads: 2,
        debug: 0,
        provider: 'cpu',
      },
    });
    console.log('[stt-worker] Offline recognizer created');

    process.send?.({ type: 'ready' });
  } catch (err: any) {
    const message =
      err?.message || err?.toString?.() || JSON.stringify(err) || 'Unknown initialization error';
    console.error('[stt-worker] Init error:', message);
    if (err?.stack) console.error('[stt-worker] Stack:', err.stack);
    process.send?.({ type: 'error', data: message });
  }
}

function processAudioChunk(samples: number[], channel: string): void {
  const ch = channels[channel];
  if (!ch || !ch.isRecording || !recognizer || !ch.vad) return;

  // Convert Int16 -> Float32 for VAD and recognizer
  const float32Samples = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    float32Samples[i] = samples[i] / 32768.0;
  }

  // Feed audio to this channel's VAD
  ch.vad.acceptWaveform(float32Samples);

  const isSpeaking = ch.vad.isDetected();

  if (isSpeaking && !ch.wasSpeaking) {
    process.send?.({ type: 'speech-detected', data: true, channel });
    ch.wasSpeaking = true;
  } else if (!isSpeaking && ch.wasSpeaking) {
    process.send?.({ type: 'speech-detected', data: false, channel });
    ch.wasSpeaking = false;
  }

  // Process completed speech segments from VAD
  while (!ch.vad.isEmpty()) {
    const segment = ch.vad.front(false);
    ch.vad.pop();
    transcribeSegment(segment.samples, segment.start, ch);
  }
}

function transcribeSegment(samples: Float32Array, startSample: number, ch: ChannelState): void {
  if (!recognizer || samples.length === 0) return;

  try {
    const stream = recognizer.createStream();
    stream.acceptWaveform({ samples, sampleRate: 16000 });
    recognizer.decode(stream);

    const result = recognizer.getResult(stream);
    const text = result.text?.trim();

    if (text) {
      const durationMs = (samples.length / 16000) * 1000;
      const startTimeMs = (startSample / 16000) * 1000;
      const endTimeMs = startTimeMs + durationMs;

      ch.segmentCounter++;
      process.send?.({
        type: 'segment',
        data: {
          id: `seg-${ch.source}-${ch.segmentCounter}`,
          text,
          startTimeMs: Math.max(0, startTimeMs),
          endTimeMs,
          isFinal: true,
          source: ch.source,
        },
      });
    }
  } catch (err: any) {
    console.error('[stt-worker] Transcription error:', err.message);
  }
}

function startChannel(channel: string): void {
  const ch = channels[channel];
  if (!ch) return;
  ch.isRecording = true;
  ch.wasSpeaking = false;
  ch.segmentCounter = 0;
  ch.vad?.reset();
}

function stopChannel(channel: string): void {
  const ch = channels[channel];
  if (!ch) return;

  if (ch.vad) {
    ch.vad.flush();
    while (!ch.vad.isEmpty()) {
      const segment = ch.vad.front(false);
      ch.vad.pop();
      transcribeSegment(segment.samples, segment.start, ch);
    }
  }
  ch.isRecording = false;
  ch.wasSpeaking = false;
  process.send?.({ type: 'speech-detected', data: false, channel });
}

// Message handler
process.on('message', (msg: any) => {
  switch (msg.type) {
    case 'audio-chunk': {
      const channel = msg.channel || 'mic';
      processAudioChunk(msg.data, channel);
      break;
    }
    case 'start-recording': {
      // Start all channels (or specific one if specified)
      const ch = msg.channel;
      if (ch) {
        startChannel(ch);
      } else {
        startChannel('mic');
        startChannel('system');
      }
      break;
    }
    case 'stop-recording': {
      const ch = msg.channel;
      if (ch) {
        stopChannel(ch);
      } else {
        stopChannel('mic');
        stopChannel('system');
      }
      break;
    }
    case 'shutdown':
      for (const ch of Object.values(channels)) {
        ch.isRecording = false;
      }
      recognizer = null;
      process.exit(0);
      break;
  }
});

// Bootstrap
initialize();
