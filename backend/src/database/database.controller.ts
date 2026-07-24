import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
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
import { RequirePermissions, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { DatabaseService } from './database.service';
import * as path from 'path';
import { BackupStorageService } from './backup-storage.service';

type MulterFile = Express.Multer.File;

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin')
@Controller('admin/database')
export class DatabaseController {
  private readonly logger = new Logger(DatabaseController.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly backupStorage: BackupStorageService,
  ) {}

  // ─── Health ───────────────────────────────────────────────────────────────────

  @RequirePermissions('database.view')
  @Get('health')
  getHealth() {
    return this.db.getHealth();
  }

  // ─── Backups ──────────────────────────────────────────────────────────────────

  @RequirePermissions('database.view')
  @Get('backups')
  async listBackups() {
    return (await this.db.listBackups()).map(
      ({ path: _path, ...backup }) => backup,
    );
  }

  @RequirePermissions('database.backup')
  @Post('backups')
  async createDatabaseBackup(@CurrentUser() user: AuthUser) {
    return this.createBackupResponse(user);
  }

  /** Legacy route retained for deployed frontends. */
  @RequirePermissions('database.backup')
  @Post('backups/create')
  createBackup(@CurrentUser() user: AuthUser) {
    return this.createBackupResponse(user);
  }

  private async createBackupResponse(user: AuthUser) {
    try {
      const result = await this.db.createDatabaseBackup(user);
      return {
        success: true,
        filename: result.filename,
        size: result.size,
        backupType: result.backupType,
        containsDatabase: result.containsDatabase,
        containsMinio: result.containsMinio,
        documentsMustBeRegenerated: result.documentsMustBeRegenerated,
      };
    } catch (error) {
      this.throwStructuredError(error, 'Backup creation failed');
    }
  }

  @RequirePermissions('database.backup')
  @Get('backups/:filename/download')
  async downloadBackup(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    this.logger.log(`[DOWNLOAD] Backup requested: ${filename}`);
    try {
      const stat = await this.backupStorage.fileStat(filename);

      if (stat.size === 0) {
        this.logger.warn(`[DOWNLOAD] File is empty: ${filename}`);
        res.status(400).json({ message: 'Fichier de sauvegarde vide' });
        return;
      }

      this.logger.log(
        `[DOWNLOAD] File exists: ${filename} (${stat.size} bytes)`,
      );
      res.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(stat.size),
      });

      const stream = await this.backupStorage.openReadStream(filename);
      stream.on('error', (err) => {
        this.logger.error(
          `[DOWNLOAD] Stream error for ${filename}: ${err.message}`,
        );
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            message: 'Download failed',
            details: err.message,
          });
        }
      });
      stream.pipe(res);
      this.logger.log(`[DOWNLOAD] Sending ZIP: ${filename}`);
    } catch (err) {
      this.logger.error(
        `[DOWNLOAD] Error for ${filename}: ${(err as Error).message}`,
      );
      if (!res.headersSent) {
        const status =
          err instanceof NotFoundException
            ? 404
            : err instanceof BadRequestException
              ? 400
              : 500;
        res.status(status).json({
          success: false,
          message: 'Download failed',
          details: (err as Error).message,
        });
      }
    }
  }

  @RequirePermissions('database.restore')
  @Post('backups/:filename/restore')
  async restoreBackupByFilename(
    @Param('filename') filename: string,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      const result = await this.db.restoreBackupByFilename(filename, user);
      return {
        success: true,
        message: 'Restauration terminée avec succès. Reconnexion requise.',
        requiresReLogin: true,
        restored: result.restored,
        backupType: result.backupType,
        containsDatabase: result.containsDatabase,
        containsMinio: result.containsMinio,
        documentsMustBeRegenerated: result.documentsMustBeRegenerated,
        ignoredLegacyFiles: result.ignoredLegacyFiles,
      };
    } catch (error) {
      this.throwStructuredError(error, 'Restore failed');
    }
  }

  @RequirePermissions('database.backup')
  @Delete('backups/:filename')
  async deleteBackup(
    @Param('filename') filename: string,
    @CurrentUser() user: AuthUser,
  ) {
    try {
      await this.db.deleteBackup(filename, user);
      return { success: true };
    } catch (error) {
      this.throwStructuredError(error, 'Backup deletion failed');
    }
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

    this.logger.log(
      `[RESTORE] File received: ${file.originalname} (${file.size} bytes, mime: ${file.mimetype})`,
    );

    try {
      const result = await this.db.restoreBackup(file.buffer, user, {
        uploadedFilename: file.originalname,
      });
      return {
        success: true,
        message: 'Restauration terminée avec succès. Reconnexion requise.',
        requiresReLogin: true,
        restored: result.restored,
        backupType: result.backupType,
        containsDatabase: result.containsDatabase,
        containsMinio: result.containsMinio,
        documentsMustBeRegenerated: result.documentsMustBeRegenerated,
        ignoredLegacyFiles: result.ignoredLegacyFiles,
      };
    } catch (error) {
      this.throwStructuredError(error, 'Restore failed');
    }
  }

  private throwStructuredError(error: unknown, message: string): never {
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const response =
      error instanceof HttpException ? error.getResponse() : undefined;
    const detail =
      typeof response === 'string'
        ? response
        : response && typeof response === 'object' && 'message' in response
          ? (response as { message: string | string[] }).message
          : error instanceof Error
            ? error.message
            : String(error);
    throw new HttpException(
      {
        success: false,
        message,
        details: Array.isArray(detail) ? detail.join(', ') : detail,
      },
      status,
    );
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

      this.logger.log(
        `[EXPORT] Sending ${entity}${ext} (${buffer.length} bytes)`,
      );
      res.set({
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${entity}-export${ext}"`,
        'Content-Length': String(buffer.length),
      });
      res.end(buffer);
    } catch (err) {
      this.logger.error(
        `[EXPORT] Error for ${entity}.${format}: ${(err as Error).message}`,
      );
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
    if (!file)
      return { inserted: 0, errors: ['Aucun fichier fourni'], duplicates: 0 };
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
