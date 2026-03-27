/**
 * Circular audio buffer holding the last N seconds of audio chunks.
 * Used for failover: replay buffered audio to local STT when cloud STT fails.
 */
export class AudioBuffer {
  private chunks: Int16Array[] = [];
  private totalSamples = 0;
  private readonly maxSamples: number;

  /**
   * @param maxSeconds Maximum seconds of audio to buffer
   * @param sampleRate Audio sample rate (default 16000 Hz)
   */
  constructor(maxSeconds = 30, sampleRate = 16000) {
    this.maxSamples = maxSeconds * sampleRate;
  }

  push(chunk: Int16Array): void {
    this.chunks.push(chunk);
    this.totalSamples += chunk.length;

    // Trim old chunks if buffer exceeds max
    while (this.totalSamples > this.maxSamples && this.chunks.length > 1) {
      const removed = this.chunks.shift()!;
      this.totalSamples -= removed.length;
    }
  }

  drain(): Int16Array[] {
    const result = [...this.chunks];
    this.chunks = [];
    this.totalSamples = 0;
    return result;
  }

  clear(): void {
    this.chunks = [];
    this.totalSamples = 0;
  }

  get size(): number {
    return this.chunks.length;
  }

  get durationSeconds(): number {
    return this.totalSamples / 16000;
  }
}
