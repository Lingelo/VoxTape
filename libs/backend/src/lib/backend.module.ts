import { Module } from '@nestjs/common';
import { SttModule } from './stt/stt.module.js';
import { AudioModule } from './audio/audio.module.js';
import { LlmModule } from './llm/llm.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ExportModule } from './export/export.module.js';
import { ConfigModule } from './config/config.module.js';
import { ModelManagerModule } from './model-manager/model-manager.module.js';

@Module({
  imports: [SttModule, AudioModule, LlmModule, DatabaseModule, ExportModule, ConfigModule, ModelManagerModule],
  exports: [SttModule, AudioModule, LlmModule, DatabaseModule, ExportModule, ConfigModule, ModelManagerModule],
})
export class BackendModule {}
