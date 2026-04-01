/**
 * WAV file header utilities for 16-bit PCM mono audio.
 */

const HEADER_SIZE = 44;

/**
 * Creates a WAV file header buffer.
 * The data size is initially set to 0 and must be updated after writing all PCM data.
 */
export function createWavHeader(sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const header = Buffer.alloc(HEADER_SIZE);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(0, 4); // File size - 8 (updated on finalize)
  header.write('WAVE', 8);

  // fmt sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Sub-chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(0, 40); // Data size (updated on finalize)

  return header;
}

/**
 * Updates the WAV header with the final data size.
 * Writes both the RIFF file size and the data chunk size.
 */
export function finalizeWavHeader(headerBuf: Buffer, dataSize: number): Buffer {
  const updated = Buffer.from(headerBuf);
  updated.writeUInt32LE(dataSize + HEADER_SIZE - 8, 4); // RIFF size
  updated.writeUInt32LE(dataSize, 40); // data size
  return updated;
}
