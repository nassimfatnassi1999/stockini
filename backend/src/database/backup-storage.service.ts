import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constants, createReadStream, type ReadStream } from 'fs';
import { access, mkdir, readFile, readdir, stat, unlink } from 'fs/promises';
import * as path from 'path';

export const DEFAULT_BACKUP_DIRECTORY = '/opt/stockini/backups';
export const BACKUP_DIRECTORY_ERROR =
  'Le répertoire des sauvegardes est inaccessible.';

@Injectable()
export class BackupStorageService implements OnModuleInit {
  private readonly logger = new Logger(BackupStorageService.name);
  readonly directory: string;

  constructor(config: ConfigService) {
    this.directory = path.resolve(
      config.get<string>('BACKUP_DIRECTORY')?.trim() ||
        DEFAULT_BACKUP_DIRECTORY,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureAccessible();
      this.logger.log(`Répertoire des sauvegardes: ${this.directory}`);
    } catch (error) {
      // Keep the API alive: backup endpoints will return the explicit error.
      this.logger.error(BACKUP_DIRECTORY_ERROR, (error as Error).stack);
    }
  }

  async ensureAccessible(): Promise<void> {
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o750 });
      await access(
        this.directory,
        constants.R_OK | constants.W_OK | constants.X_OK,
      );
    } catch (error) {
      this.logger.error(
        `${BACKUP_DIRECTORY_ERROR} (${this.directory}): ${(error as Error).message}`,
      );
      throw new InternalServerErrorException(BACKUP_DIRECTORY_ERROR);
    }
  }

  async listZipFiles(): Promise<
    Array<{ filename: string; path: string; size: number; createdAt: string }>
  > {
    await this.ensureAccessible();
    try {
      const entries = await readdir(this.directory, { withFileTypes: true });
      return await Promise.all(
        entries
          .filter(
            (entry) =>
              entry.isFile() &&
              entry.name.startsWith('backup-') &&
              entry.name.endsWith('.zip'),
          )
          .map(async (entry) => {
            const filePath = path.join(this.directory, entry.name);
            const fileStat = await stat(filePath);
            return {
              filename: entry.name,
              path: filePath,
              size: fileStat.size,
              createdAt: fileStat.birthtime.toISOString(),
            };
          }),
      );
    } catch (error) {
      this.throwDirectoryError(error);
    }
  }

  async destination(filename: string): Promise<string> {
    await this.ensureAccessible();
    return path.join(this.directory, filename);
  }

  async resolveExisting(filename: string): Promise<string> {
    this.assertFilename(filename);
    await this.ensureAccessible();
    const filePath = path.join(this.directory, filename);
    try {
      const fileStat = await stat(filePath);
      if (!fileStat.isFile()) throw new Error('Not a file');
      return filePath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException('Sauvegarde introuvable');
      }
      this.throwDirectoryError(error);
    }
  }

  async read(filename: string): Promise<Buffer> {
    return readFile(await this.resolveExisting(filename));
  }

  async remove(filename: string): Promise<void> {
    await unlink(await this.resolveExisting(filename));
  }

  async fileStat(filename: string) {
    return stat(await this.resolveExisting(filename));
  }

  async openReadStream(filename: string): Promise<ReadStream> {
    return createReadStream(await this.resolveExisting(filename));
  }

  private assertFilename(filename: string): void {
    if (
      !/^backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}(?:-\d{2}(?:-\d{3})?)?\.zip$/.test(
        filename,
      )
    ) {
      throw new BadRequestException('Nom de fichier invalide');
    }
  }

  private throwDirectoryError(error: unknown): never {
    if (error instanceof InternalServerErrorException) throw error;
    this.logger.error(
      `${BACKUP_DIRECTORY_ERROR} (${this.directory}): ${(error as Error).message}`,
    );
    throw new InternalServerErrorException(BACKUP_DIRECTORY_ERROR);
  }
}
