import { BadRequestException } from '@nestjs/common';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  moveUploadedFileSafely,
  uploadedFileFs,
} from './move-uploaded-file-safely';

describe('moveUploadedFileSafely', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'stockini-upload-move-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it('renames a normal upload', async () => {
    const source = path.join(root, 'upload');
    const destination = path.join(root, 'temporary', 'file.dump');
    await writeFile(source, 'content');

    await moveUploadedFileSafely(source, destination);

    await expect(readFile(destination, 'utf8')).resolves.toBe('content');
    await expect(readFile(source)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('copies, validates and removes the source after EXDEV', async () => {
    const source = path.join(root, 'upload');
    const destination = path.join(root, 'temporary', 'file.zip');
    await writeFile(source, 'zip-content');
    const realRename = uploadedFileFs.rename;
    jest
      .spyOn(uploadedFileFs, 'rename')
      .mockRejectedValueOnce(
        Object.assign(new Error('cross-device'), { code: 'EXDEV' }),
      )
      .mockImplementation(realRename);

    await moveUploadedFileSafely(source, destination);

    await expect(readFile(destination, 'utf8')).resolves.toBe('zip-content');
    await expect(readFile(source)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps the source and cleans .copying when copying fails', async () => {
    const source = path.join(root, 'upload');
    const destinationDir = path.join(root, 'temporary');
    const destination = path.join(destinationDir, 'file.zip');
    await writeFile(source, 'zip-content');
    jest
      .spyOn(uploadedFileFs, 'rename')
      .mockRejectedValueOnce(
        Object.assign(new Error('cross-device'), { code: 'EXDEV' }),
      );
    jest
      .spyOn(uploadedFileFs, 'copyFile')
      .mockRejectedValueOnce(new Error('I/O'));

    await expect(moveUploadedFileSafely(source, destination)).rejects.toThrow(
      'Impossible de préparer le fichier importé.',
    );

    await expect(readFile(source, 'utf8')).resolves.toBe('zip-content');
    await expect(readdir(destinationDir)).resolves.toEqual([]);
  });

  it('rejects a size mismatch and cleans the partial copy', async () => {
    const source = path.join(root, 'upload');
    const destinationDir = path.join(root, 'temporary');
    const destination = path.join(destinationDir, 'file.zip');
    await writeFile(source, 'zip-content');
    const realStat = uploadedFileFs.stat;
    jest
      .spyOn(uploadedFileFs, 'rename')
      .mockRejectedValueOnce(
        Object.assign(new Error('cross-device'), { code: 'EXDEV' }),
      );
    jest
      .spyOn(uploadedFileFs, 'stat')
      .mockImplementationOnce(realStat)
      .mockResolvedValueOnce({
        isFile: () => true,
        size: 1,
      } as Awaited<ReturnType<typeof realStat>>);

    await expect(moveUploadedFileSafely(source, destination)).rejects.toThrow(
      'Impossible de préparer le fichier importé.',
    );

    await expect(readFile(source, 'utf8')).resolves.toBe('zip-content');
    await expect(readdir(destinationDir)).resolves.toEqual([]);
  });

  it('rejects an empty source', async () => {
    const source = path.join(root, 'empty');
    await writeFile(source, '');

    await expect(
      moveUploadedFileSafely(source, path.join(root, 'destination')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
