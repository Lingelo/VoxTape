import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter } from 'events';
import { AudioService } from '../audio/audio.service.js';

@Injectable()
export class SystemAudioService extends EventEmitter implements OnModuleDestroy {
  private capturing = false;

  constructor(@Inject(AudioService) private readonly audioService: AudioService) {
    super();
  }

  get isCapturing(): boolean {
    return this.capturing;
  }

  isSupported(): boolean {
    try {
      const nativeAudio = require('@voxtape/native-audio-capture');
      return nativeAudio.isSupported();
    } catch {
      return false;
    }
  }

  start(): void {
    if (this.capturing) return;

    let nativeAudio: typeof import('@voxtape/native-audio-capture');
    try {
      nativeAudio = require('@voxtape/native-audio-capture');
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
    const self = this;
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

        // Calculate RMS level and emit every 5 chunks (~150ms)
        if (chunkCount % 5 === 0) {
          let sum = 0;
          for (let i = 0; i < samples.length; i++) {
            sum += samples[i] * samples[i];
          }
          const rms = Math.sqrt(sum / samples.length);
          const level = Math.min(1, rms / 10000); // Normalize to 0-1
          self.emit('level', level);
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
      const nativeAudio = require('@voxtape/native-audio-capture');
      nativeAudio.stopCapture();
    } catch (err) {
      console.error('[SystemAudio] Failed to stop capture:', err);
    }

    this.capturing = false;
    this.emit('level', 0);
    console.log('[SystemAudio] Capture stopped');
  }

  onModuleDestroy(): void {
    this.stop();
  }
}
