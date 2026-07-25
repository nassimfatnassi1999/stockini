import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { MulterError } from 'multer';
import { BackupHttpException } from './backup-errors';

@Catch(MulterError, Error)
export class BackupUploadFilter implements ExceptionFilter {
  private readonly logger = new Logger(BackupUploadFilter.name);

  catch(error: Error, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    let mapped: BackupHttpException | null = null;

    if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
      mapped = new BackupHttpException(
        413,
        'BACKUP_FILE_TOO_LARGE',
        'Le fichier dépasse la taille maximale autorisée.',
      );
    } else if (/request aborted|aborted|ECONNRESET/i.test(error.message)) {
      // 499 is the convention used by Nginx for a client-closed request.
      mapped = new BackupHttpException(
        499,
        'BACKUP_UPLOAD_ABORTED',
        "L'envoi du backup a été interrompu. Vous pouvez le relancer.",
      );
    } else if (/ENOSPC|no space left/i.test(error.message)) {
      mapped = new BackupHttpException(
        507,
        'BACKUP_DISK_SPACE_INSUFFICIENT',
        "L'espace disque disponible est insuffisant pour recevoir le backup.",
      );
    }

    if (!mapped) {
      this.logger.error(
        JSON.stringify({
          event: 'backup_upload_failed',
          code: 'BACKUP_RESTORE_FAILED',
          error: error.message,
        }),
        error.stack,
      );
      response.status(500).json({
        success: false,
        code: 'BACKUP_RESTORE_FAILED',
        message: 'La restauration a échoué.',
      });
      return;
    }
    this.logger.error(
      JSON.stringify({
        event: 'backup_upload_failed',
        code: mapped.getResponse(),
        error: error.message,
      }),
      error.stack,
    );
    response.status(mapped.getStatus()).json(mapped.getResponse());
  }
}
