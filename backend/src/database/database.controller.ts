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
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import { RequirePermissions, Roles } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { DatabaseService } from './database.service';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { BackupStorageService } from './backup-storage.service';
import { BackupUploadFilter } from './backup-upload.filter';
import { BackupHttpException } from './backup-errors';
import { IndependentExportsService } from './independent-exports.service';
import {
  MinioRestoreDto,
  PostgresRestoreDto,
  RecreateExportDto,
} from './dto/independent-export.dto';

type MulterFile = Express.Multer.File;

const restoreUploadDirectory = () =>
  process.env.UPLOAD_DIRECTORY?.trim() ||
  process.env.BACKUP_UPLOAD_DIRECTORY?.trim() ||
  '/app/uploads';
const restoreUploadLimit = () => {
  const configured = Number(process.env.BACKUP_MAX_UPLOAD_BYTES);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : 2 * 1024 * 1024 * 1024;
};
const restoreUploadOptions = {
  storage: diskStorage({
    destination: (_request, _file, callback) => {
      const directory = restoreUploadDirectory();
      try {
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        callback(null, directory);
      } catch (error) {
        callback(error as Error, directory);
      }
    },
    filename: (_request, _file, callback) =>
      callback(null, `${randomUUID()}.zip.upload`),
  }),
  limits: { fileSize: restoreUploadLimit(), files: 1 },
  fileFilter: (
    _request: unknown,
    file: Express.Multer.File,
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const allowedMimes = new Set([
      'application/zip',
      'application/x-zip-compressed',
      'application/x-zip',
      'application/octet-stream',
    ]);
    const accepted =
      path.extname(file.originalname).toLowerCase() === '.zip' &&
      allowedMimes.has(file.mimetype);
    callback(
      accepted
        ? null
        : new BackupHttpException(
            400,
            'BACKUP_INVALID_ZIP',
            "Le fichier sélectionné n'est pas un ZIP accepté.",
          ),
      accepted,
    );
  },
};

const independentUploadOptions = {
  storage: diskStorage({
    destination: (_request, _file, callback) => {
      const directory = restoreUploadDirectory();
      try {
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        callback(null, directory);
      } catch (error) {
        callback(error as Error, directory);
      }
    },
    filename: (_request, _file, callback) =>
      callback(null, `${randomUUID()}.independent-upload`),
  }),
  limits: { fileSize: restoreUploadLimit(), files: 1 },
};

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Roles('ADMIN', 'SUPER_ADMIN', 'admin', 'super_admin')
@Controller('admin/database')
export class DatabaseController {
  private readonly logger = new Logger(DatabaseController.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly backupStorage: BackupStorageService,
    private readonly independentExports: IndependentExportsService,
  ) {}

  // ─── Independent PostgreSQL exports ─────────────────────────────────────────

  @RequirePermissions('database.backup')
  @Post('exports/postgresql')
  createPostgresqlExport(
    @CurrentUser() user: AuthUser,
    @Body() _dto: RecreateExportDto,
  ) {
    return this.independentExports.createPostgresExport('MANUAL', user);
  }

  @RequirePermissions('database.view')
  @Get('exports/postgresql')
  listPostgresqlExports() {
    return this.independentExports.listPostgresExports();
  }

  @RequirePermissions('database.backup')
  @Get('exports/postgresql/download')
  downloadPostgresqlExport(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const filePath = this.independentExports.postgresDownloadPath();
    return this.streamFixedExport(
      filePath,
      'application/octet-stream',
      user,
      'database.postgresql.export.downloaded',
      res,
    );
  }

  @RequirePermissions('database.restore')
  @Post('imports/postgresql')
  @UseFilters(BackupUploadFilter)
  @UseInterceptors(FileInterceptor('file', independentUploadOptions))
  async importPostgresql(
    @UploadedFile() file: MulterFile,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Aucun dump fourni.');
    return this.independentExports.importPostgres(
      file.path,
      file.originalname,
      user,
    );
  }

  @RequirePermissions('database.restore')
  @Post('restores/postgresql')
  restorePostgresql(
    @Body() dto: PostgresRestoreDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.independentExports.restorePostgres(
      dto.source,
      dto.confirmation,
      user,
      dto.importId,
    );
  }

  // ─── Independent MinIO exports ──────────────────────────────────────────────

  @RequirePermissions('database.backup')
  @Post('exports/minio')
  createMinioExport(
    @CurrentUser() user: AuthUser,
    @Body() _dto: RecreateExportDto,
  ) {
    return this.independentExports.createMinioExport(user);
  }

  @RequirePermissions('database.view')
  @Get('exports/minio')
  listMinioExports() {
    return this.independentExports.listMinioExports();
  }

  @RequirePermissions('database.view')
  @Get('exports/minio/manifest')
  getMinioManifest() {
    return this.independentExports.getMinioManifest();
  }

  @RequirePermissions('database.backup')
  @Get('exports/minio/download')
  downloadMinioExport(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const filePath = this.independentExports.minioDownloadPath();
    return this.streamFixedExport(
      filePath,
      'application/zip',
      user,
      'database.minio.export.downloaded',
      res,
    );
  }

  @RequirePermissions('database.restore')
  @Post('imports/minio')
  @UseFilters(BackupUploadFilter)
  @UseInterceptors(FileInterceptor('file', independentUploadOptions))
  async importMinio(
    @UploadedFile() file: MulterFile,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Aucun export ZIP fourni.');
    return this.independentExports.importMinio(
      file.path,
      file.originalname,
      user,
    );
  }

  @RequirePermissions('database.restore')
  @Post('restores/minio')
  restoreMinio(@Body() dto: MinioRestoreDto, @CurrentUser() user: AuthUser) {
    return this.independentExports.restoreMinio(
      dto.source,
      dto.mode,
      dto.confirmation,
      user,
      dto.importId,
    );
  }

  @RequirePermissions('database.view')
  @Get('coherence')
  coherenceInformation() {
    return {
      destructive: false,
      description:
        'Compare les références documentaires PostgreSQL aux objets MinIO sans supprimer de données.',
    };
  }

  @RequirePermissions('database.backup')
  @Post('coherence/check')
  checkCoherence(@CurrentUser() user: AuthUser) {
    return this.independentExports.checkCoherence(user);
  }

  private async streamFixedExport(
    filePath: string,
    contentType: string,
    user: AuthUser,
    auditAction: string,
    res: Response,
  ): Promise<void> {
    const stat = fs.statSync(filePath);
    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${path.basename(filePath)}"`,
      'Content-Length': String(stat.size),
    });
    await this.independentExports.auditDownload(
      user,
      auditAction,
      path.basename(filePath),
      stat.size,
    );
    fs.createReadStream(filePath).pipe(res);
  }

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
        minioFileCount: result.minioFileCount,
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
  @UseFilters(BackupUploadFilter)
  @UseInterceptors(FileInterceptor('file', restoreUploadOptions))
  async restoreBackup(
    @UploadedFile() file: MulterFile,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) {
      throw new BadRequestException('Aucun fichier ZIP fourni');
    }

    if (!file.path || file.size === 0) {
      throw new BadRequestException('Le fichier ZIP est vide');
    }

    this.logger.log(
      `[RESTORE] File received: ${file.originalname} (${file.size} bytes, mime: ${file.mimetype})`,
    );

    try {
      const result = await this.db.restoreBackupFile(file.path, user, {
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
    } finally {
      await fs.promises.rm(file.path, { force: true }).catch(() => undefined);
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
    const original =
      response && typeof response === 'object' ? response : undefined;
    const safeDetail =
      status >= 500 && !(original && 'code' in original)
        ? 'Une erreur serveur est survenue. Consultez les logs.'
        : Array.isArray(detail)
          ? detail.join(', ')
          : detail;
    throw new HttpException(
      {
        success: false,
        message: original && 'message' in original ? original.message : message,
        ...(original && 'code' in original ? { code: original.code } : {}),
        ...(original && 'restoreId' in original
          ? { restoreId: original.restoreId }
          : {}),
        details: safeDetail,
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
