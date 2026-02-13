/**
 * PCM Capture AudioWorklet
 *
 * Downsamples from hardware sample rate to 16kHz mono.
 * Converts Float32 to Int16 PCM.
 * Buffers 1600 samples (100ms at 16kHz) then posts to main thread.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Int16Array(1600); // 100ms at 16kHz
    this._bufferOffset = 0;
    this._resampleRatio = 1; // Will be computed on first process()
    this._resampleAccumulator = 0;
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} outputs
   * @param {Record<string, Float32Array>} parameters
   * @returns {boolean}
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // Mono — first channel only
    const inputSampleRate = sampleRate; // Global from AudioWorkletGlobalScope
    const targetRate = 16000;

    if (this._resampleRatio === 1 && inputSampleRate !== targetRate) {
      this._resampleRatio = inputSampleRate / targetRate;
    }

    // Downsample using simple point-picking (sufficient for speech)
    for (let i = 0; i < channelData.length; i++) {
      this._resampleAccumulator += 1;

      if (this._resampleAccumulator >= this._resampleRatio) {
        this._resampleAccumulator -= this._resampleRatio;

        // Float32 [-1, 1] -> Int16 [-32768, 32767]
        const sample = channelData[i];
        const clamped = Math.max(-1, Math.min(1, sample));
        const int16 = clamped < 0 ? clamped * 32768 : clamped * 32767;
        this._buffer[this._bufferOffset++] = int16;

        if (this._bufferOffset >= 1600) {
          // Post 100ms buffer — transfer ownership for zero-copy
          const chunk = this._buffer.slice();
          this.port.postMessage({ type: 'pcm-chunk', samples: chunk }, [chunk.buffer]);
          this._bufferOffset = 0;
        }
      }
    }

    return true; // Keep processor alive
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor);
