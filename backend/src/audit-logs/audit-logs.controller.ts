import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { AuditLogsService } from './audit-logs.service';
import { CreateAuditLogDto } from './dto/audit-log.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Post()
  create(@Body() dto: CreateAuditLogDto) {
    return this.auditLogsService.create(dto);
  }

  @RequirePermissions('audit_logs.view')
  @Get()
  findAll(@Query('entity') entity?: string) {
    return this.auditLogsService.findAll(entity);
  }
}
