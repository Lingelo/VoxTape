import { Module } from '@nestjs/common';
import { SttModule } from './stt/stt.module.js';
import { AudioModule } from './audio/audio.module.js';
import { LlmModule } from './llm/llm.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ExportModule } from './export/export.module.js';
import { ConfigModule } from './config/config.module.js';
import { ModelManagerModule } from './model-manager/model-manager.module.js';
import { SystemAudioModule } from './system-audio/system-audio.module.js';
import { DiarizationModule } from './diarization/diarization.module.js';

@Module({
  imports: [SttModule, AudioModule, LlmModule, DatabaseModule, ExportModule, ConfigModule, ModelManagerModule, SystemAudioModule, DiarizationModule],
  exports: [SttModule, AudioModule, LlmModule, DatabaseModule, ExportModule, ConfigModule, ModelManagerModule, SystemAudioModule, DiarizationModule],
})
export class BackendModule {}
