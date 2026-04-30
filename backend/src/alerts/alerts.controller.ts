import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/alert.dto';

@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Post()
  create(@Body() dto: CreateAlertDto) {
    return this.alertsService.create(dto);
  }

  @Get()
  findAll(@Query('isRead') isRead?: string) {
    return this.alertsService.findAll(isRead);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.alertsService.markRead(id);
  }
}
