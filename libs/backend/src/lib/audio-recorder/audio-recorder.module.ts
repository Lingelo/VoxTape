import { Module } from '@nestjs/common';
import { AudioRecorderService } from './audio-recorder.service.js';

@Module({
  providers: [AudioRecorderService],
  exports: [AudioRecorderService],
})
export class AudioRecorderModule {}
