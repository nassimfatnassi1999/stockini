import { Body, Controller, Get, Patch, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators';
import { AuditLogsService } from './audit-logs.service';
import { AuditRetentionService } from './audit-retention.service';
import { AuditLogQueryDto, UpdateRetentionSettingsDto } from './dto/audit-log.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly retentionService: AuditRetentionService,
  ) {}

  // ── Lecture logs (actifs ou archives) ─────────────────────────────────────

  @RequirePermissions('audit_logs.view')
  @Get()
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditLogsService.findAll(query);
  }

  // ── Statistiques ──────────────────────────────────────────────────────────

  @RequirePermissions('audit_logs.view')
  @Get('stats')
  getStats() {
    return this.retentionService.getStats();
  }

  // ── Paramètres de rétention ───────────────────────────────────────────────

  @RequirePermissions('audit_logs.archive')
  @Get('retention-settings')
  getRetentionSettings() {
    return this.retentionService.loadSettings();
  }

  @RequirePermissions('audit_logs.archive')
  @Patch('retention-settings')
  updateRetentionSettings(@Body() dto: UpdateRetentionSettingsDto) {
    return this.retentionService.upsertSettings(dto);
  }

  // ── Archivage manuel ─────────────────────────────────────────────────────

  @RequirePermissions('audit_logs.archive')
  @Post('archive')
  triggerArchive(@Request() req: { user: { id: string } }) {
    return this.retentionService.runArchiving(req.user?.id);
  }

  // ── Liste des archives MinIO ──────────────────────────────────────────────

  @RequirePermissions('audit_logs.archive')
  @Get('archives')
  listArchives() {
    return this.retentionService.listArchives();
  }

  // ── Télécharger la dernière archive (URL présignée 1h) ────────────────────

  @RequirePermissions('audit_logs.archive')
  @Get('archives/download')
  getLastArchiveDownload() {
    return this.retentionService.getLastArchiveUrl();
  }
}
