import { Module } from '@nestjs/common';
import { DiarizationService } from './diarization.service';

@Module({
  providers: [DiarizationService],
  exports: [DiarizationService],
})
export class DiarizationModule {}
