import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { ReferencesModule } from '../references/references.module';
import { SettingsModule } from '../settings/settings.module';
import { StockModule } from '../stock/stock.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [StockModule, ReferencesModule, SettingsModule, CaisseModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
