import { HttpException } from '@nestjs/common';

export type BackupErrorCode =
  | 'BACKUP_UPLOAD_ABORTED'
  | 'BACKUP_FILE_TOO_LARGE'
  | 'BACKUP_INVALID_ZIP'
  | 'BACKUP_RESTORE_IN_PROGRESS'
  | 'BACKUP_DISK_SPACE_INSUFFICIENT'
  | 'BACKUP_DATABASE_RESTORE_FAILED'
  | 'BACKUP_MINIO_RESTORE_FAILED';

export class BackupHttpException extends HttpException {
  constructor(
    status: number,
    code: BackupErrorCode,
    message: string,
    restoreId?: string,
  ) {
    super(
      { success: false, code, message, ...(restoreId ? { restoreId } : {}) },
      status,
    );
  }
}
