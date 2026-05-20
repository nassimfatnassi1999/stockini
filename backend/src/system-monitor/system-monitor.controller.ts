import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { SystemMonitorService } from './system-monitor.service';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/system')
export class SystemMonitorController {
  constructor(private readonly monitor: SystemMonitorService) {}

  @RequirePermissions('database.view')
  @Get('infrastructure')
  getInfrastructure() {
    return this.monitor.getInfrastructureStats();
  }
}
