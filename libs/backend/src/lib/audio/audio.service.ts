import { Injectable, Inject, Optional } from '@nestjs/common';
import { SttService } from '../stt/stt.service.js';
import { DiarizationService } from '../diarization/diarization.service.js';

/** Target chunk size for system audio: 1600 samples = 100ms at 16kHz */
const SYS_CHUNK_SIZE = 1600;

@Injectable()
export class AudioService {
  /** Accumulation buffer for system audio (avoids sending tiny 320-sample chunks) */
  private sysBuf = new Int16Array(SYS_CHUNK_SIZE);
  private sysLen = 0;

  constructor(
    @Inject(SttService) private readonly sttService: SttService,
    @Optional() @Inject(DiarizationService) private readonly diarizationService?: DiarizationService,
  ) {}

  /** Mic audio from renderer (1600 samples, 100ms) — sent directly */
  handleAudioChunk(samples: Int16Array): void {
    this.sttService.feedAudioChunk(samples, 'mic');
    // Also feed to diarization if available
    this.diarizationService?.feedAudioChunk(samples);
  }

  /** System audio from native capture (~320 samples, 20ms) — buffered to 1600 */
  handleSystemAudioChunk(samples: Int16Array): void {
    let offset = 0;
    while (offset < samples.length) {
      const space = SYS_CHUNK_SIZE - this.sysLen;
      const take = Math.min(space, samples.length - offset);
      this.sysBuf.set(samples.subarray(offset, offset + take), this.sysLen);
      this.sysLen += take;
      offset += take;

      if (this.sysLen >= SYS_CHUNK_SIZE) {
        const chunk = this.sysBuf.slice(0, SYS_CHUNK_SIZE);
        this.sttService.feedAudioChunk(chunk, 'system');
        // Also feed to diarization if available
        this.diarizationService?.feedAudioChunk(chunk);
        this.sysLen = 0;
      }
    }
  }

  startRecording(): void {
    this.sttService.startRecording();
    this.diarizationService?.startRecording();
  }

  stopRecording(): void {
    this.sttService.stopRecording();
    // Flush remaining system audio
    if (this.sysLen > 0) {
      const chunk = this.sysBuf.slice(0, this.sysLen);
      this.sttService.feedAudioChunk(chunk, 'system');
      this.diarizationService?.feedAudioChunk(chunk);
      this.sysLen = 0;
    }
    // Stop diarization (will trigger processing)
    this.diarizationService?.stopRecording();
  }
}
