import { Module } from '@nestjs/common';
import { ReferencesModule } from '../references/references.module';
import { SettingsModule } from '../settings/settings.module';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [ReferencesModule, SettingsModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
