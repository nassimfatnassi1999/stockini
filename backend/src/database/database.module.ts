import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MulterModule } from '@nestjs/platform-express';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { DocumentsModule } from '../documents/documents.module';
import { DatabaseController } from './database.controller';
import { DatabaseService } from './database.service';
import { BackupStorageService } from './backup-storage.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    // Small spreadsheet imports keep the default memory storage. The backup
    // endpoint overrides this with dedicated disk storage and a configurable limit.
    MulterModule.register({ limits: { fileSize: 50 * 1024 * 1024 } }),
    AuditLogsModule,
    DocumentsModule,
  ],
  controllers: [DatabaseController],
  providers: [DatabaseService, BackupStorageService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
