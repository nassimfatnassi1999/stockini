import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditLogsService } from './audit-logs.service';
import { CreateAuditLogDto } from './dto/audit-log.dto';

@UseGuards(JwtAuthGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Post()
  create(@Body() dto: CreateAuditLogDto) {
    return this.auditLogsService.create(dto);
  }

  @Get()
  findAll(@Query('entity') entity?: string) {
    return this.auditLogsService.findAll(entity);
  }
}
