import { ArgumentsHost } from '@nestjs/common';
import { MulterError } from 'multer';
import { BackupUploadFilter } from './backup-upload.filter';

describe('BackupUploadFilter', () => {
  function responseHarness() {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  }

  it('maps an interrupted multipart upload to 499', () => {
    const { host, status, json } = responseHarness();
    new BackupUploadFilter().catch(new Error('Request aborted'), host);
    expect(status).toHaveBeenCalledWith(499);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'BACKUP_UPLOAD_ABORTED' }),
    );
  });

  it('maps the Multer file size limit to 413', () => {
    const { host, status, json } = responseHarness();
    new BackupUploadFilter().catch(new MulterError('LIMIT_FILE_SIZE'), host);
    expect(status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'BACKUP_FILE_TOO_LARGE' }),
    );
  });

  it('maps an exhausted upload volume to 507', () => {
    const { host, status, json } = responseHarness();
    const error = Object.assign(new Error('no space left on device'), {
      code: 'ENOSPC',
    });
    new BackupUploadFilter().catch(error, host);
    expect(status).toHaveBeenCalledWith(507);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'BACKUP_DISK_SPACE_INSUFFICIENT' }),
    );
  });
});
