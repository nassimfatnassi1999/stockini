import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { DocumentsModule } from '../documents/documents.module';
import { ReferencesModule } from '../references/references.module';
import { SettingsModule } from '../settings/settings.module';
import { StockModule } from '../stock/stock.module';
import { AvoirsController } from './avoirs.controller';
import { AvoirsService } from './avoirs.service';

@Module({
  imports: [
    StockModule,
    ReferencesModule,
    DocumentsModule,
    SettingsModule,
    CaisseModule,
  ],
  controllers: [AvoirsController],
  providers: [AvoirsService],
  exports: [AvoirsService],
})
export class AvoirsModule {}
