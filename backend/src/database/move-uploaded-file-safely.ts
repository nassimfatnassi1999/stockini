import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import { dirname } from 'node:path';

export const uploadedFileFs = {
  stat: fs.stat.bind(fs),
  mkdir: fs.mkdir.bind(fs),
  rename: fs.rename.bind(fs),
  copyFile: fs.copyFile.bind(fs),
  unlink: fs.unlink.bind(fs),
  rm: fs.rm.bind(fs),
};

/**
 * Atomically prepares a Multer upload for later use, including when the upload
 * and backup directories are mounted on different filesystems.
 */
export async function moveUploadedFileSafely(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  let sourceStat;
  try {
    sourceStat = await uploadedFileFs.stat(sourcePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new BadRequestException('Le fichier importé est absent.');
    throw new InternalServerErrorException(
      'Impossible de préparer le fichier importé.',
    );
  }

  if (!sourceStat.isFile() || sourceStat.size <= 0)
    throw new BadRequestException('Le fichier importé est vide ou invalide.');

  try {
    await uploadedFileFs.mkdir(dirname(destinationPath), {
      recursive: true,
      mode: 0o750,
    });
    await uploadedFileFs.rename(sourcePath, destinationPath);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV')
      throw new InternalServerErrorException(
        'Impossible de préparer le fichier importé.',
      );
  }

  const copyingPath = `${destinationPath}.${randomUUID()}.copying`;
  try {
    await uploadedFileFs.copyFile(
      sourcePath,
      copyingPath,
      fsConstants.COPYFILE_EXCL,
    );
    const copiedStat = await uploadedFileFs.stat(copyingPath);
    if (!copiedStat.isFile() || copiedStat.size !== sourceStat.size)
      throw new Error('Incomplete uploaded file copy');

    // This rename stays inside the destination filesystem and is atomic.
    await uploadedFileFs.rename(copyingPath, destinationPath);
    await uploadedFileFs.unlink(sourcePath);
  } catch {
    await uploadedFileFs
      .rm(copyingPath, { force: true })
      .catch(() => undefined);
    throw new InternalServerErrorException(
      'Impossible de préparer le fichier importé.',
    );
  }
}
