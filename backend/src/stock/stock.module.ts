import { Module } from '@nestjs/common';
import { ReferencesModule } from '../references/references.module';
import { SettingsModule } from '../settings/settings.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [ReferencesModule, SettingsModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService],
})
export class StockModule {}
