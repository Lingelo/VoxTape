import { Module } from '@nestjs/common';
import { ModelManagerService } from './model-manager.service.js';

@Module({
  providers: [ModelManagerService],
  exports: [ModelManagerService],
})
export class ModelManagerModule {}
