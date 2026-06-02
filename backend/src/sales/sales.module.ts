import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { CustomersModule } from '../customers/customers.module';
import { ReferencesModule } from '../references/references.module';
import { SettingsModule } from '../settings/settings.module';
import { StockModule } from '../stock/stock.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [StockModule, ReferencesModule, SettingsModule, CaisseModule, CustomersModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
