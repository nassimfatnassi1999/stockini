import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { ReferencesModule } from '../references/references.module';
import { SettingsModule } from '../settings/settings.module';
import { StockModule } from '../stock/stock.module';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
  imports: [StockModule, ReferencesModule, SettingsModule, CaisseModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
