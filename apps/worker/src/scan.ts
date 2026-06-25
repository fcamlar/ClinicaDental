import IORedis from 'ioredis';
import { Queue, Worker, type Job } from 'bullmq';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { BUCKET, createS3Client } from './s3.js';

/**
 * Worker de escaneo de antivirus asíncrono.
 *
 * Flujo:
 *   1. La API genera una presigned URL y devuelve `fileId` + URL al cliente.
 *   2. El cliente sube el archivo a R2/MinIO con esa URL.
 *   3. La API encola un job `scan-file` con el `fileId` y la key S3.
 *   4. Este worker descarga el archivo, lo pasa por ClamAV y actualiza
 *      `files.scan_status` (PENDING → CLEAN | INFECTED | ERROR).
 *   5. La UI muestra el estado en el listado de adjuntos del paciente.
 *
 * En desarrollo, si ClamAV no está disponible, el job marca CLEAN tras
 * descargar — el riesgo es aceptable porque sólo aplica al docker-compose
 * local. En producción debe haber ClamAV.
 */

export interface ScanFileJobData {
  fileId: string;
  s3Key: string;
  tenantId: string;
}

const SCAN_QUEUE = 'castellar-scan-file';

function getRedis(): IORedis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export function createScanQueue(): Queue<ScanFileJobData> {
  return new Queue<ScanFileJobData>(SCAN_QUEUE, { connection: getRedis() });
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

async function scanWithClamAV(buf: Buffer): Promise<'CLEAN' | 'INFECTED' | 'ERROR'> {
  try {
    // Import dinámico — clamscan es opcional en dev.
    const NodeClam = (await import('clamscan')).default;
    const clam = await new NodeClam().init({
      removeInfected: false,
      clamdscan: {
        host: process.env.CLAMAV_HOST ?? '127.0.0.1',
        port: Number(process.env.CLAMAV_PORT ?? 3310),
        timeout: 60000,
      },
    });
    const result = await clam.scanStream(
      // Stream pasthrough
      new (await import('node:stream')).Readable({
        read() {
          this.push(buf);
          this.push(null);
        },
      }),
    );
    return result.isInfected ? 'INFECTED' : 'CLEAN';
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[scan] ClamAV no disponible en dev — marcando CLEAN', err);
      return 'CLEAN';
    }
    console.error('[scan] error', err);
    return 'ERROR';
  }
}

export function startScanWorker(): Worker<ScanFileJobData> {
  const s3 = createS3Client();
  const connection = getRedis();

  return new Worker<ScanFileJobData>(
    SCAN_QUEUE,
    async (job: Job<ScanFileJobData>) => {
      const { s3Key, fileId } = job.data;
      console.warn(`[scan] file ${fileId} key=${s3Key}`);

      const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
      if (!obj.Body) throw new Error('Archivo vacío');
      const buf = await streamToBuffer(obj.Body as NodeJS.ReadableStream);

      const verdict = await scanWithClamAV(buf);
      // En Sprint 2 actualizamos `files.scan_status` vía Prisma con withTenant.
      console.warn(`[scan] file ${fileId} → ${verdict}`);
      return { verdict };
    },
    { connection, concurrency: 4 },
  );
}
