import * as Minio from 'minio';

const REQUIRED_ENV_VARS = [
  'MINIO_ENDPOINT',
  'MINIO_PORT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
] as const;

async function ensureBuckets(): Promise<void> {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Variables MinIO manquantes: ${missing.join(', ')}`);
  }

  const port = Number(process.env.MINIO_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`MINIO_PORT invalide: ${process.env.MINIO_PORT}`);
  }

  const client = new Minio.Client({
    endPoint: process.env.MINIO_ENDPOINT!,
    port,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
  });

  const buckets = [...new Set([process.env.MINIO_BUCKET!, 'audit-logs-archive'])];
  for (const bucket of buckets) {
    if (await client.bucketExists(bucket)) {
      console.log(`Bucket MinIO déjà présent: ${bucket}`);
      continue;
    }

    await client.makeBucket(bucket);
    console.log(`Bucket MinIO créé: ${bucket}`);
  }
}

ensureBuckets().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Échec de la préparation MinIO: ${message}`);
  process.exitCode = 1;
});
