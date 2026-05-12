import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { EmailService } from './email.service';
import { MinioService } from './minio.service';
import { PdfService } from './pdf.service';

@Module({
  imports: [SettingsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, MinioService, PdfService, EmailService],
})
export class DocumentsModule {}
