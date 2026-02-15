import { Module } from '@nestjs/common';
import { AudioService } from './audio.service.js';
import { SttModule } from '../stt/stt.module.js';
import { DiarizationModule } from '../diarization/diarization.module.js';

@Module({
  imports: [SttModule, DiarizationModule],
  providers: [AudioService],
  exports: [AudioService],
})
export class AudioModule {}
