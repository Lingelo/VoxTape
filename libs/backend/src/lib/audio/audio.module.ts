import { Module } from '@nestjs/common';
import { AudioService } from './audio.service.js';
import { SttModule } from '../stt/stt.module.js';
import { DiarizationModule } from '../diarization/diarization.module.js';
import { AudioRecorderModule } from '../audio-recorder/audio-recorder.module.js';

@Module({
  imports: [SttModule, DiarizationModule, AudioRecorderModule],
  providers: [AudioService],
  exports: [AudioService],
})
export class AudioModule {}
