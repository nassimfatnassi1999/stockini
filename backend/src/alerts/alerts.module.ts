import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { RetentionModule } from '../retention/retention.module';

@Module({
  imports: [SettingsModule, RetentionModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
