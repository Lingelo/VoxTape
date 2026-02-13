import { Module } from '@nestjs/common';
import { ExportService } from './export.service.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}
