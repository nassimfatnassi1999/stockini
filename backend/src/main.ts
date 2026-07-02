import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { MinioService } from './documents/minio.service';

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
];

function validateEnv() {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error('ERROR: Missing required environment variables:');
    missing.forEach((key) => console.error(`  - ${key}`));
    console.error('Copy .env.example to .env and fill in the values.');
    process.exit(1);
  }
}

function maskedDatabaseUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '<invalid DATABASE_URL>';
  }
}

async function logDependencyDiagnostics(app: Awaited<ReturnType<typeof NestFactory.create>>) {
  const logger = new Logger('StartupDiagnostics');
  logger.log(`DATABASE_URL=${maskedDatabaseUrl(process.env.DATABASE_URL ?? '')}`);
  logger.log(`MINIO_ENDPOINT=${process.env.MINIO_ENDPOINT ?? '<missing>'}`);
  logger.log(`MINIO_PORT=${process.env.MINIO_PORT ?? '9000'}`);

  try {
    await app.get(PrismaService).$queryRaw`SELECT 1`;
    logger.log('PostgreSQL ping: OK');
  } catch (error) {
    logger.error(`PostgreSQL ping failed: ${(error as Error).message}`);
  }

  try {
    await app.get(MinioService).ping();
    logger.log('MinIO ping: OK');
  } catch (error) {
    logger.warn(`MinIO ping failed: ${(error as Error).message}`);
  }
}

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create(AppModule);
  const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.BACKEND_PORT ?? process.env.PORT ?? 4000);
  // Diagnostics run after listen and cannot hold up application availability.
  void logDependencyDiagnostics(app);
}
void bootstrap();
