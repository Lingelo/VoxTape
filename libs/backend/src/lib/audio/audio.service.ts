import { Injectable, Inject } from '@nestjs/common';
import { SttService } from '../stt/stt.service.js';

@Injectable()
export class AudioService {
  constructor(@Inject(SttService) private readonly sttService: SttService) {}

  handleAudioChunk(samples: Int16Array): void {
    this.sttService.feedAudioChunk(samples);
  }

  startRecording(): void {
    this.sttService.startRecording();
  }

  stopRecording(): void {
    this.sttService.stopRecording();
  }
}
