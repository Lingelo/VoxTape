import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { AudioService } from '../audio/audio.service.js';

@Injectable()
export class SystemAudioService implements OnModuleDestroy {
  private capturing = false;

  constructor(@Inject(AudioService) private readonly audioService: AudioService) {}

  get isCapturing(): boolean {
    return this.capturing;
  }

  isSupported(): boolean {
    try {
      const nativeAudio = require('@sourdine/native-audio-capture');
      return nativeAudio.isSupported();
    } catch {
      return false;
    }
  }

  start(): void {
    if (this.capturing) return;

    let nativeAudio: typeof import('@sourdine/native-audio-capture');
    try {
      nativeAudio = require('@sourdine/native-audio-capture');
    } catch (err) {
      console.error('[SystemAudio] Failed to load native module:', err);
      return;
    }

    if (!nativeAudio.isSupported()) {
      console.warn('[SystemAudio] macOS 14.2+ required for system audio capture');
      return;
    }

    console.log('[SystemAudio] Requesting audio capture permission via ScreenCaptureKit...');
    const sckGranted = nativeAudio.requestAudioCapturePermission();
    console.log(`[SystemAudio] SCK permission granted: ${sckGranted}`);

    const audioService = this.audioService;
    let chunkCount = 0;
    try {
      nativeAudio.startCapture((err: Error | null, chunk: Buffer) => {
        if (err || !chunk) return;
        chunkCount++;
        const samples = new Int16Array(
          chunk.buffer,
          chunk.byteOffset,
          chunk.length / 2,
        );
        if (chunkCount % 100 === 1) {
          const maxAbs = samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0);
          console.log(`[SystemAudio] chunk #${chunkCount}: ${samples.length} samples, peak=${maxAbs}`);
        }
        // Route to AudioService mixer instead of directly to STT
        audioService.handleSystemAudioChunk(samples);
      });
      this.capturing = true;
      console.log('[SystemAudio] Capture started');
    } catch (err) {
      console.error('[SystemAudio] Failed to start capture:', err);
    }
  }

  stop(): void {
    if (!this.capturing) return;

    try {
      const nativeAudio = require('@sourdine/native-audio-capture');
      nativeAudio.stopCapture();
    } catch (err) {
      console.error('[SystemAudio] Failed to stop capture:', err);
    }

    this.capturing = false;
    console.log('[SystemAudio] Capture stopped');
  }

  onModuleDestroy(): void {
    this.stop();
  }
}
