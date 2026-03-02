/**
 * PCM Capture AudioWorklet
 *
 * Downsamples from hardware sample rate to 16kHz mono using FIR anti-aliasing.
 * Converts Float32 to Int16 PCM.
 * Buffers 1600 samples (100ms at 16kHz) then posts to main thread.
 *
 * FIR filter: 15-tap Hamming window low-pass (matches Rust resampler in resampler.rs).
 * Decimation factor: Math.round(inputSampleRate / 16000) — integer decimation.
 */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Int16Array(1600); // 100ms at 16kHz
    this._bufferOffset = 0;
    this._decimationFactor = 0; // Computed on first process()

    // 15-tap FIR low-pass filter coefficients (Hamming window)
    // Identical to libs/native-audio-capture/src/resampler.rs
    this._firCoeffs = new Float32Array([
      0.0024, 0.0060, 0.0177, 0.0393, 0.0694,
      0.1013, 0.1268, 0.1372, 0.1268, 0.1013,
      0.0694, 0.0393, 0.0177, 0.0060, 0.0024,
    ]);
    this._firLen = this._firCoeffs.length;

    // Delay line for FIR convolution (persists between process() calls)
    this._delayLine = new Float32Array(this._firLen);
    this._delayIndex = 0;

    // Counter for integer decimation
    this._sampleCounter = 0;
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} _outputs - Unused
   * @param {Record<string, Float32Array>} _parameters - Unused
   * @returns {boolean}
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  process(inputs, _outputs, _parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // Mono — first channel only
    const inputSampleRate = sampleRate; // Global from AudioWorkletGlobalScope

    // Compute decimation factor once
    if (this._decimationFactor === 0) {
      this._decimationFactor = Math.round(inputSampleRate / 16000);
      if (this._decimationFactor < 1) this._decimationFactor = 1;
    }

    for (let i = 0; i < channelData.length; i++) {
      // Push sample into circular delay line
      this._delayLine[this._delayIndex] = channelData[i];
      this._delayIndex = (this._delayIndex + 1) % this._firLen;

      this._sampleCounter++;

      // Decimate: output one sample every _decimationFactor input samples
      if (this._sampleCounter >= this._decimationFactor) {
        this._sampleCounter = 0;

        // FIR convolution
        let filtered = 0;
        for (let j = 0; j < this._firLen; j++) {
          const idx = (this._delayIndex + j) % this._firLen;
          filtered += this._delayLine[idx] * this._firCoeffs[j];
        }

        // Float32 [-1, 1] -> Int16 [-32768, 32767]
        const clamped = Math.max(-1, Math.min(1, filtered));
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
