import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { Readable } from 'stream';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.client = new Minio.Client({
      endPoint: this.config.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.config.get<string>('MINIO_PORT', '9000'), 10),
      useSSL: this.config.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'minioadmin'),
    });
    this.bucket = this.config.get<string>(
      'MINIO_BUCKET',
      'generated-documents',
    );
  }

  async onModuleInit() {
    await this.ensureBucket(this.bucket);
  }

  private async ensureBucket(bucket: string) {
    try {
      const exists = await this.client.bucketExists(bucket);
      if (!exists) {
        await this.client.makeBucket(bucket);
        this.logger.log(`Bucket "${bucket}" created`);
      }
    } catch (err) {
      this.logger.warn(`MinIO bucket init failed: ${(err as Error).message}`);
    }
  }

  async putObject(
    bucket: string,
    objectKey: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    const stream = Readable.from(buffer);
    await this.client.putObject(bucket, objectKey, stream, buffer.length, {
      'Content-Type': mimeType,
    });
  }

  async getObject(bucket: string, objectKey: string): Promise<Buffer> {
    const stream = await this.client.getObject(bucket, objectKey);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async removeObject(bucket: string, objectKey: string): Promise<void> {
    await this.client.removeObject(bucket, objectKey);
  }

  async objectExists(bucket: string, objectKey: string): Promise<boolean> {
    try {
      await this.client.statObject(bucket, objectKey);
      return true;
    } catch {
      return false;
    }
  }

  async copyObject(
    bucket: string,
    sourceKey: string,
    destKey: string,
  ): Promise<void> {
    const conditions = new Minio.CopyConditions();
    await this.client.copyObject(bucket, destKey, `/${bucket}/${sourceKey}`, conditions);
  }

  async moveObject(
    bucket: string,
    sourceKey: string,
    destKey: string,
  ): Promise<void> {
    await this.copyObject(bucket, sourceKey, destKey);
    await this.client.removeObject(bucket, sourceKey);
  }

  async presignedGetUrl(
    bucket: string,
    objectKey: string,
    expirySeconds = 3600,
  ): Promise<string> {
    return this.client.presignedGetObject(bucket, objectKey, expirySeconds);
  }
}
