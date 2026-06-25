import { Injectable, Module } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { randomUUID, createHash } from 'node:crypto';

const BUCKET = process.env.S3_BUCKET ?? 'castellar-dev';

interface PresignedUploadParams {
  tenantId: string;
  ownerType: 'PATIENT' | 'BUDGET' | 'INVOICE' | 'CONSENT';
  ownerId: string;
  mime: string;
  size: number;
  filename: string;
}

interface PresignedUpload {
  fileId: string;
  uploadUrl: string;
  s3Key: string;
  /** Cabeceras que el cliente DEBE enviar en el PUT — coinciden con la firma. */
  headers: Record<string, string>;
  expiresIn: number;
}

@Injectable()
export class FilesService {
  private readonly s3 = new S3Client({
    region: process.env.S3_REGION ?? 'eu-west-1',
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? '',
      secretAccessKey: process.env.S3_SECRET_KEY ?? '',
    },
  });

  private readonly scanQueue = new Queue('castellar:scan-file', {
    connection: new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    }),
  });

  /**
   * Devuelve una presigned URL para subida directa cliente → S3.
   *
   * Reglas:
   *  - El s3Key incluye tenantId como prefijo, lo que evita que un cliente
   *    pueda especular con keys ajenas. La policy del bucket también limita
   *    por prefijo.
   *  - Cabeceras Content-Type y Content-Length van firmadas: el cliente no
   *    puede subir un archivo mayor o de tipo distinto al declarado.
   *  - Tras subir, el cliente llama a `confirmUpload(fileId)` y la API
   *    encola el scan.
   */
  async createPresignedUpload(params: PresignedUploadParams): Promise<PresignedUpload> {
    if (params.size > 25 * 1024 * 1024) {
      throw new Error('Archivo demasiado grande (máximo 25 MB en MVP)');
    }

    const fileId = randomUUID();
    // El s3Key embebe tenantId y un hash de filename para evitar colisiones
    // y a la vez no exponer el nombre original en el bucket.
    const safeName = createHash('sha256')
      .update(`${fileId}:${params.filename}`)
      .digest('hex')
      .slice(0, 16);
    const s3Key = `${params.tenantId}/${params.ownerType.toLowerCase()}/${params.ownerId}/${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: params.mime,
      ContentLength: params.size,
      Metadata: {
        'castellar-file-id': fileId,
        'castellar-tenant': params.tenantId,
        'castellar-owner-type': params.ownerType,
        'castellar-owner-id': params.ownerId,
      },
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 600 });

    return {
      fileId,
      uploadUrl,
      s3Key,
      headers: {
        'Content-Type': params.mime,
        'Content-Length': String(params.size),
      },
      expiresIn: 600,
    };
  }

  /**
   * Encola el scan de antivirus tras una subida confirmada por el cliente.
   * La API marca `files.scan_status = PENDING`; el worker lo mueve a CLEAN/INFECTED.
   */
  async enqueueScan(fileId: string, s3Key: string, tenantId: string): Promise<void> {
    await this.scanQueue.add(
      'scan',
      { fileId, s3Key, tenantId },
      {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 1000 },
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    );
  }
}

@Module({
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
