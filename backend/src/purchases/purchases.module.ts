import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { CaisseModule } from '../caisse/caisse.module';
import { ReferencesModule } from '../references/references.module';
import { SettingsModule } from '../settings/settings.module';
import { StockModule } from '../stock/stock.module';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [StockModule, ReferencesModule, SettingsModule, CaisseModule, AuditLogsModule, DocumentsModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
