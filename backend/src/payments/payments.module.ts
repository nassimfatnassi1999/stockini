import { Module } from '@nestjs/common';
import { CaisseModule } from '../caisse/caisse.module';
import { CustomersModule } from '../customers/customers.module';
import { ReferencesModule } from '../references/references.module';
import { SettingsModule } from '../settings/settings.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ReferencesModule, SettingsModule, CaisseModule, CustomersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
