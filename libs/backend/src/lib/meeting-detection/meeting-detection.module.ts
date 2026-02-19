import { Module } from '@nestjs/common';
import { MeetingDetectionService } from './meeting-detection.service.js';
import { BrowserUrlService } from './browser-url.service.js';

@Module({
  providers: [MeetingDetectionService, BrowserUrlService],
  exports: [MeetingDetectionService, BrowserUrlService],
})
export class MeetingDetectionModule {}
