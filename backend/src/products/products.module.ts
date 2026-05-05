import { Module } from '@nestjs/common';
import { ReferencesModule } from '../references/references.module';
import { SettingsModule } from '../settings/settings.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [ReferencesModule, SettingsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
