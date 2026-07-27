import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { DocumentsModule } from '../documents/documents.module';
import { DatabaseController } from './database.controller';
import { DatabaseService } from './database.service';
import { BackupStorageService } from './backup-storage.service';
import { IndependentExportsService } from './independent-exports.service';

@Module({
  imports: [
    // Small spreadsheet imports keep the default memory storage. The backup
    // endpoint overrides this with dedicated disk storage and a configurable limit.
    MulterModule.register({ limits: { fileSize: 50 * 1024 * 1024 } }),
    AuditLogsModule,
    DocumentsModule,
  ],
  controllers: [DatabaseController],
  providers: [DatabaseService, BackupStorageService, IndependentExportsService],
  exports: [DatabaseService, IndependentExportsService],
})
export class DatabaseModule {}
