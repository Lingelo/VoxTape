import { Injectable } from '@nestjs/common';
import { openSync, writeSync, closeSync, mkdirSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { createWavHeader, finalizeWavHeader } from './wav-header.js';

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

@Injectable()
export class AudioRecorderService {
  private fd: number | null = null;
  private dataSize = 0;
  private filePath = '';
  private recordingsDir = '';
  private enabled = true;
  private headerBuf: Buffer | null = null;

  setRecordingsDir(dir: string): void {
    this.recordingsDir = dir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  get isRecording(): boolean {
    return this.fd !== null;
  }

  start(sessionId: string): string | null {
    if (!this.enabled || !this.recordingsDir) return null;

    this.filePath = join(this.recordingsDir, `${sessionId}.wav`);
    this.dataSize = 0;
    this.headerBuf = createWavHeader(SAMPLE_RATE, CHANNELS, BITS_PER_SAMPLE);

    try {
      this.fd = openSync(this.filePath, 'w');
      // Write placeholder header (will be updated on stop)
      writeSync(this.fd, this.headerBuf);
    } catch (err: any) {
      console.error('[AudioRecorder] Failed to open file:', err.message);
      this.fd = null;
      return null;
    }

    console.log(`[AudioRecorder] Recording to ${this.filePath}`);
    return this.filePath;
  }

  writeChunk(samples: Int16Array): void {
    if (!this.fd) return;

    try {
      const buf = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
      writeSync(this.fd, buf);
      this.dataSize += buf.byteLength;
    } catch (err: any) {
      console.error('[AudioRecorder] Write error:', err.message);
    }
  }

  stop(): string | null {
    if (!this.fd || !this.headerBuf) {
      this.fd = null;
      return null;
    }

    try {
      // Rewrite the header with correct data size
      const finalHeader = finalizeWavHeader(this.headerBuf, this.dataSize);
      writeFileSync(this.filePath, finalHeader, { flag: 'r+' });
      closeSync(this.fd);
    } catch (err: any) {
      console.error('[AudioRecorder] Finalize error:', err.message);
    }

    const path = this.filePath;
    this.fd = null;
    this.headerBuf = null;
    this.dataSize = 0;
    this.filePath = '';

    console.log(`[AudioRecorder] Saved ${path} (${(this.dataSize / 1024 / 1024).toFixed(1)} MB)`);
    return path;
  }

  /**
   * Compress WAV to Opus in background. Returns the Opus path on success, or the original WAV path on failure.
   */
  compressToOpus(wavPath: string): Promise<string> {
    const opusPath = wavPath.replace(/\.wav$/, '.opus');
    return new Promise((resolve) => {
      execFile('ffmpeg', ['-i', wavPath, '-c:a', 'libopus', '-b:a', '32k', '-y', opusPath], (err) => {
        if (err) {
          console.warn('[AudioRecorder] ffmpeg not available or failed, keeping WAV:', err.message);
          resolve(wavPath);
          return;
        }
        // Delete WAV, return Opus path
        try {
          unlinkSync(wavPath);
        } catch {
          // WAV cleanup failed, not critical
        }
        console.log(`[AudioRecorder] Compressed to ${opusPath}`);
        resolve(opusPath);
      });
    });
  }

  deleteRecording(filePath: string): void {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (err: any) {
      console.error('[AudioRecorder] Delete error:', err.message);
    }
  }
}
