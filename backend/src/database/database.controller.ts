import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { Multer } from 'multer';
import { RequirePermissions } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { DatabaseService } from './database.service';
import * as fs from 'fs';
import * as path from 'path';

type MulterFile = Express.Multer.File;

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/database')
export class DatabaseController {
  private readonly logger = new Logger(DatabaseController.name);

  constructor(private readonly db: DatabaseService) {}

  // ─── Health ───────────────────────────────────────────────────────────────────

  @RequirePermissions('database.view')
  @Get('health')
  getHealth() {
    return this.db.getHealth();
  }

  // ─── Backups ──────────────────────────────────────────────────────────────────

  @RequirePermissions('database.view')
  @Get('backups')
  listBackups() {
    return this.db.listBackups();
  }

  @RequirePermissions('database.backup')
  @Post('backup')
  async createBackup(@CurrentUser() user: AuthUser) {
    const result = await this.db.createBackup(user);
    return { success: true, filename: result.filename, size: result.size };
  }

  @RequirePermissions('database.backup')
  @Get('backups/:filename/download')
  async downloadBackup(@Param('filename') filename: string, @Res() res: Response) {
    this.logger.log(`[DOWNLOAD] Backup requested: ${filename}`);
    try {
      const filePath = this.db.getBackupPath(filename);
      const stat = fs.statSync(filePath);

      if (stat.size === 0) {
        this.logger.warn(`[DOWNLOAD] File is empty: ${filename}`);
        res.status(400).json({ message: 'Fichier de sauvegarde vide' });
        return;
      }

      this.logger.log(`[DOWNLOAD] File exists: ${filePath} (${stat.size} bytes)`);
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(stat.size),
      });

      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => {
        this.logger.error(`[DOWNLOAD] Stream error for ${filename}: ${err.message}`);
        if (!res.headersSent) {
          res.status(500).json({ message: 'Erreur lecture du fichier' });
        }
      });
      stream.pipe(res);
      this.logger.log(`[DOWNLOAD] Sending ZIP: ${filename}`);
    } catch (err) {
      this.logger.error(`[DOWNLOAD] Error for ${filename}: ${(err as Error).message}`);
      if (!res.headersSent) {
        const status =
          err instanceof NotFoundException ? 404
          : err instanceof BadRequestException ? 400
          : 500;
        res.status(status).json({ message: (err as Error).message });
      }
    }
  }

  @RequirePermissions('database.restore')
  @Post('backups/:filename/restore')
  async restoreBackupByFilename(
    @Param('filename') filename: string,
    @CurrentUser() user: AuthUser,
  ) {
    const result = await this.db.restoreBackupByFilename(filename, user);
    return { success: true, restored: result.restored };
  }

  @RequirePermissions('database.backup')
  @Delete('backups/:filename')
  async deleteBackup(
    @Param('filename') filename: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.db.deleteBackup(filename, user);
    return { success: true };
  }

  // ─── Restore ─────────────────────────────────────────────────────────────────

  @RequirePermissions('database.restore')
  @Post('restore')
  @UseInterceptors(FileInterceptor('file'))
  async restoreBackup(
    @UploadedFile() file: MulterFile,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier ZIP fourni');
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.zip') {
      throw new BadRequestException('Le fichier doit être un ZIP (.zip)');
    }

    const allowedMimes = [
      'application/zip',
      'application/x-zip-compressed',
      'application/x-zip',
      'application/octet-stream',
    ];
    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(`Type MIME non accepté : ${file.mimetype}`);
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Le fichier ZIP est vide');
    }

    this.logger.log(`[RESTORE] File received: ${file.originalname} (${file.size} bytes, mime: ${file.mimetype})`);

    const result = await this.db.restoreBackup(file.buffer, user);
    return { success: true, restored: result.restored };
  }

  // ─── Export ───────────────────────────────────────────────────────────────────

  @RequirePermissions('database.export')
  @Get('export/:entity')
  async exportEntity(
    @Param('entity') entity: string,
    @Query('format') format: 'xlsx' | 'csv' = 'xlsx',
    @Query('dateFrom') dateFrom: string,
    @Query('dateTo') dateTo: string,
    @Res() res: Response,
  ) {
    this.logger.log(`[EXPORT] Generating ${entity}.${format}`);
    try {
      const filters: Record<string, string> = {};
      if (dateFrom) filters.dateFrom = dateFrom;
      if (dateTo) filters.dateTo = dateTo;

      const buffer = await this.db.exportEntity(entity, format, filters);

      if (!buffer || buffer.length === 0) {
        this.logger.warn(`[EXPORT] Empty buffer for ${entity}.${format}`);
        res.status(400).json({ message: 'Aucune donnée à exporter' });
        return;
      }

      const mimeTypes: Record<string, string> = {
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        csv: 'text/csv; charset=utf-8',
      };
      const extensions: Record<string, string> = { xlsx: '.xlsx', csv: '.csv' };
      const ext = extensions[format] ?? '';
      const mime = mimeTypes[format] ?? 'application/octet-stream';

      this.logger.log(`[EXPORT] Sending ${entity}${ext} (${buffer.length} bytes)`);
      res.set({
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${entity}-export${ext}"`,
        'Content-Length': String(buffer.length),
      });
      res.end(buffer);
    } catch (err) {
      this.logger.error(`[EXPORT] Error for ${entity}.${format}: ${(err as Error).message}`);
      if (!res.headersSent) {
        const status = err instanceof BadRequestException ? 400 : 500;
        res.status(status).json({ message: (err as Error).message });
      }
    }
  }

  // ─── Import ───────────────────────────────────────────────────────────────────

  @RequirePermissions('database.import')
  @Post('import/:entity/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewImport(
    @Param('entity') entity: string,
    @UploadedFile() file: MulterFile,
  ) {
    if (!file) return { rows: [], errors: ['Aucun fichier fourni'] };
    return this.db.previewImport(entity, file.buffer, file.mimetype);
  }

  @RequirePermissions('database.import')
  @Post('import/:entity')
  @UseInterceptors(FileInterceptor('file'))
  async importEntity(
    @Param('entity') entity: string,
    @UploadedFile() file: MulterFile,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) return { inserted: 0, errors: ['Aucun fichier fourni'], duplicates: 0 };
    return this.db.importEntity(entity, file.buffer, file.mimetype, user);
  }

  // ─── Maintenance ─────────────────────────────────────────────────────────────

  @RequirePermissions('database.maintenance')
  @Post('maintenance/:action')
  async runMaintenance(
    @Param('action') action: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.db.runMaintenance(action, user);
  }
}
