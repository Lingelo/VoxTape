import { Module } from '@nestjs/common';
import { AudioService } from './audio.service.js';
import { SttModule } from '../stt/stt.module.js';

@Module({
  imports: [SttModule],
  providers: [AudioService],
  exports: [AudioService],
})
export class AudioModule {}
