import { S3Client } from '@aws-sdk/client-s3';

/**
 * Cliente S3 compatible. Funciona con:
 *  - MinIO local en dev (path-style, endpoint http://localhost:9000)
 *  - Cloudflare R2 en producción (virtual-hosted style)
 *  - AWS S3 EU si llega el caso
 *
 * Las credenciales y el endpoint vienen de las variables de entorno.
 */
export function createS3Client(): S3Client {
  return new S3Client({
    region: process.env.S3_REGION ?? 'eu-west-1',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
  });
}

export const BUCKET = process.env.S3_BUCKET ?? 'castellar-dev';
