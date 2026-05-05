import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';

@Module({
  imports: [SettingsModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
