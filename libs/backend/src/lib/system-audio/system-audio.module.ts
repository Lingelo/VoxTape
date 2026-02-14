import { Module } from '@nestjs/common';
import { SystemAudioService } from './system-audio.service.js';
import { AudioModule } from '../audio/audio.module.js';

@Module({
  imports: [AudioModule],
  providers: [SystemAudioService],
  exports: [SystemAudioService],
})
export class SystemAudioModule {}
