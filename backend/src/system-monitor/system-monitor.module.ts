import { Module } from '@nestjs/common';
import { SystemMonitorController } from './system-monitor.controller';
import { SystemMonitorService } from './system-monitor.service';

@Module({
  controllers: [SystemMonitorController],
  providers: [SystemMonitorService],
})
export class SystemMonitorModule {}
