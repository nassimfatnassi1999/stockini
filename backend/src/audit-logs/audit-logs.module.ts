import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLogsService } from './audit-logs.service';
import { AuditRetentionService } from './audit-retention.service';

@Module({
  imports: [DocumentsModule],
  controllers: [AuditLogsController],
  providers: [AuditLogsService, AuditRetentionService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
