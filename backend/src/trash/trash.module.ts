import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { DocumentsModule } from '../documents/documents.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReferencesModule } from '../references/references.module';
import { SettingsModule } from '../settings/settings.module';
import { StockModule } from '../stock/stock.module';
import { TrashController } from './trash.controller';
import { TrashService } from './trash.service';

@Module({
  imports: [PrismaModule, StockModule, CaisseModule, ReferencesModule, SettingsModule, DocumentsModule],
  controllers: [TrashController],
  providers: [TrashService],
})
export class TrashModule {}
