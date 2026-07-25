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
  readonly completeDirectory: string;

  constructor(config: ConfigService) {
    this.directory = path.resolve(
      config.get<string>('BACKUP_DIRECTORY')?.trim() ||
        DEFAULT_BACKUP_DIRECTORY,
    );
    this.completeDirectory = path.join(this.directory, 'complete');
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
      await mkdir(this.completeDirectory, { recursive: true, mode: 0o750 });
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
      const roots = [this.completeDirectory, this.directory];
      const located = (
        await Promise.all(
          roots.map(async (root) =>
            (await readdir(root, { withFileTypes: true })).map((entry) => ({
              entry,
              root,
            })),
          ),
        )
      ).flat();
      return await Promise.all(
        located
          .filter(
            ({ entry }) =>
              entry.isFile() &&
              entry.name.startsWith('backup-') &&
              entry.name.endsWith('.zip'),
          )
          .filter(
            ({ entry }, index, all) =>
              all.findIndex((item) => item.entry.name === entry.name) === index,
          )
          .map(async ({ entry, root }) => {
            const filePath = path.join(root, entry.name);
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
    return path.join(this.completeDirectory, filename);
  }

  async resolveExisting(filename: string): Promise<string> {
    const safeFilename = this.assertFilename(filename);
    await this.ensureAccessible();
    const candidates = [
      path.resolve(this.completeDirectory, safeFilename),
      path.resolve(this.directory, safeFilename),
    ];
    this.logger.log(`[BACKUP_STORAGE] Fichier demandé: ${safeFilename}`);
    try {
      for (const filePath of candidates) {
        try {
          const fileStat = await stat(filePath);
          if (fileStat.isFile()) {
            this.logger.log(
              `[BACKUP_STORAGE] Chemin local résolu: ${filePath}`,
            );
            return filePath;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
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

  private assertFilename(filename: string): string {
    const safeFilename = path.basename(filename);
    if (
      safeFilename !== filename ||
      !/^backup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}(?:-\d{2}(?:-\d{3})?)?\.zip$/.test(
        safeFilename,
      )
    ) {
      throw new BadRequestException('Nom de fichier invalide');
    }
    return safeFilename;
  }

  private throwDirectoryError(error: unknown): never {
    if (error instanceof InternalServerErrorException) throw error;
    this.logger.error(
      `${BACKUP_DIRECTORY_ERROR} (${this.directory}): ${(error as Error).message}`,
    );
    throw new InternalServerErrorException(BACKUP_DIRECTORY_ERROR);
  }
}
