import { Injectable, Inject } from '@nestjs/common';
import { SttService } from '../stt/stt.service.js';

/** Target chunk size for system audio: 1600 samples = 100ms at 16kHz */
const SYS_CHUNK_SIZE = 1600;

@Injectable()
export class AudioService {
  /** Accumulation buffer for system audio (avoids sending tiny 320-sample chunks) */
  private sysBuf = new Int16Array(SYS_CHUNK_SIZE);
  private sysLen = 0;

  constructor(@Inject(SttService) private readonly sttService: SttService) {}

  /** Mic audio from renderer (1600 samples, 100ms) — sent directly */
  handleAudioChunk(samples: Int16Array): void {
    this.sttService.feedAudioChunk(samples, 'mic');
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
        this.sttService.feedAudioChunk(this.sysBuf.slice(0, SYS_CHUNK_SIZE), 'system');
        this.sysLen = 0;
      }
    }
  }

  startRecording(): void {
    this.sttService.startRecording();
  }

  stopRecording(): void {
    this.sttService.stopRecording();
    // Flush remaining system audio
    if (this.sysLen > 0) {
      this.sttService.feedAudioChunk(this.sysBuf.slice(0, this.sysLen), 'system');
      this.sysLen = 0;
    }
  }
}
