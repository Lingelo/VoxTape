import { Module } from '@nestjs/common';
import { SttService } from './stt.service.js';

@Module({
  providers: [SttService],
  exports: [SttService],
})
export class SttModule {}
