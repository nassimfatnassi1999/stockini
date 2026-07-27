import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions, Roles } from '../auth/decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AlertsService } from './alerts.service';
import { AlertQueryDto, CreateAlertDto, UpdateAlertDto } from './dto/alert.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @RequirePermissions('alerts.create')
  @Post()
  create(@Body() dto: CreateAlertDto) {
    return this.alertsService.create(dto);
  }

  @RequirePermissions('alerts.view')
  @Get()
  findAll(@Query() query: AlertQueryDto) {
    return this.alertsService.findAll(query);
  }

  @RequirePermissions('alerts.mark_read')
  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.alertsService.markRead(id);
  }

  @RequirePermissions('alerts.update')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAlertDto) {
    return this.alertsService.update(id, dto);
  }

  @RequirePermissions('alerts.delete')
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin')
  @Delete('all')
  removeAll() {
    return this.alertsService.removeAll();
  }

  @RequirePermissions('alerts.delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.alertsService.remove(id);
  }
}
