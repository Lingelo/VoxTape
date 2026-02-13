/**
 * STT Worker — runs as a child process with ELECTRON_RUN_AS_NODE=1
 *
 * Loads Silero VAD + Parakeet TDT v3 via sherpa-onnx-node (native bindings).
 * Receives audio chunks from the main process, runs VAD, and transcribes
 * complete utterances.
 */

import { join } from 'path';
import { existsSync } from 'fs';

let recognizer: any = null;
let vad: any = null;
let isRecording = false;
let segmentCounter = 0;

/** Search for a model file across multiple directories */
function findModel(relativePath: string): string | null {
  const dirs = [
    process.env.SOURDINE_MODELS_DIR,
    join(__dirname, '..', '..', '..', 'models'),          // dev (project/models)
    join(__dirname, '..', '..', 'resources', 'models'),   // prod (app.asar.unpacked)
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

    // Initialize Silero VAD (native)
    console.log('[stt-worker] Creating VAD...');
    vad = new sherpaOnnx.Vad(
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
    console.log('[stt-worker] VAD created');

    // Create offline recognizer (native)
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

let wasSpeaking = false;

function processAudioChunk(samples: number[]): void {
  if (!isRecording || !recognizer || !vad) return;

  // Convert Int16 -> Float32 for VAD and recognizer
  const float32Samples = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    float32Samples[i] = samples[i] / 32768.0;
  }

  // Feed audio to Silero VAD
  vad.acceptWaveform(float32Samples);

  const isSpeaking = vad.isDetected();

  if (isSpeaking && !wasSpeaking) {
    process.send?.({ type: 'speech-detected', data: true });
    wasSpeaking = true;
  } else if (!isSpeaking && wasSpeaking) {
    process.send?.({ type: 'speech-detected', data: false });
    wasSpeaking = false;
  }

  // Process completed speech segments from VAD
  while (!vad.isEmpty()) {
    const segment = vad.front(false);
    vad.pop();
    transcribeSegment(segment.samples, segment.start);
  }
}

function transcribeSegment(samples: Float32Array, startSample: number): void {
  if (!recognizer || samples.length === 0) return;

  try {
    const stream = recognizer.createStream();
    // sherpa-onnx-node uses { samples, sampleRate } object
    stream.acceptWaveform({ samples, sampleRate: 16000 });
    recognizer.decode(stream);

    const result = recognizer.getResult(stream);
    const text = result.text?.trim();

    if (text) {
      const durationMs = (samples.length / 16000) * 1000;
      const startTimeMs = (startSample / 16000) * 1000;
      const endTimeMs = startTimeMs + durationMs;

      segmentCounter++;
      process.send?.({
        type: 'segment',
        data: {
          id: `seg-${segmentCounter}`,
          text,
          startTimeMs: Math.max(0, startTimeMs),
          endTimeMs,
          isFinal: true,
        },
      });
    }
  } catch (err: any) {
    console.error('[stt-worker] Transcription error:', err.message);
  }
}

// Message handler
process.on('message', (msg: any) => {
  switch (msg.type) {
    case 'audio-chunk':
      processAudioChunk(msg.data);
      break;
    case 'start-recording':
      isRecording = true;
      wasSpeaking = false;
      segmentCounter = 0;
      vad?.reset();
      break;
    case 'stop-recording':
      if (vad) {
        vad.flush();
        while (!vad.isEmpty()) {
          const segment = vad.front(false);
          vad.pop();
          transcribeSegment(segment.samples, segment.start);
        }
      }
      isRecording = false;
      wasSpeaking = false;
      process.send?.({ type: 'speech-detected', data: false });
      break;
    case 'shutdown':
      isRecording = false;
      recognizer = null;
      vad = null;
      process.exit(0);
      break;
  }
});

// Bootstrap
initialize();
