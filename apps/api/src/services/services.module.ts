import { Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import { randomUUID, createHash } from 'node:crypto';
import {
  cryptoTokenGenerator,
  makeRepositories,
  type Repositories,
} from '@castellar/db';
import { systemClock, type identity } from '@castellar/core';
import type {
  PresignedUploadService,
  TenantDeps,
  PublicDeps,
  TrpcServices,
} from '@castellar/api-contracts';
import { SupabaseAdminAdapter } from './supabase-admin.js';
import { ResendInvitationMailer } from './mailer.js';

const BUCKET = process.env.S3_BUCKET ?? 'castellar-dev';

/**
 * PresignedUploadService — emite URLs presigned y encola scans.
 *
 * Reglas:
 *  - El s3Key empieza por `tenantId/`. La policy del bucket debe limitar
 *    el access key del API al prefijo del tenant correspondiente (en MVP
 *    confiamos en la app; en Sprint 7 endurecemos con políticas IAM).
 *  - Tamaño máximo 25 MB.
 *  - Las cabeceras `Content-Type` y `Content-Length` van firmadas: el
 *    cliente no puede subir un archivo mayor o de tipo distinto.
 */
class PresignedUploadAdapter implements PresignedUploadService {
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

  async createPresignedUpload(args: {
    tenantId: string;
    ownerType: 'PATIENT' | 'CONSENT' | 'BUDGET' | 'INVOICE';
    ownerId: string;
    mime: string;
    size: number;
    filename: string;
  }) {
    const fileId = randomUUID();
    const safeName = createHash('sha256')
      .update(`${fileId}:${args.filename}`)
      .digest('hex')
      .slice(0, 16);
    const s3Key = `${args.tenantId}/${args.ownerType.toLowerCase()}/${args.ownerId}/${safeName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      ContentType: args.mime,
      ContentLength: args.size,
      Metadata: {
        'castellar-file-id': fileId,
        'castellar-tenant': args.tenantId,
        'castellar-owner-type': args.ownerType,
        'castellar-owner-id': args.ownerId,
      },
    });

    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 600 });
    return {
      fileId,
      uploadUrl,
      s3Key,
      headers: {
        'Content-Type': args.mime,
        'Content-Length': String(args.size),
      },
      expiresIn: 600,
    };
  }

  async enqueueScan(fileId: string, s3Key: string, tenantId: string) {
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

@Injectable()
export class ServicesProvider implements OnModuleDestroy {
  private readonly appClient: PrismaClient;
  private readonly migrateClient: PrismaClient;
  private readonly supabase: identity.SupabaseAdminClient;
  private readonly mailer: identity.InvitationMailer;
  private readonly presignedUploads: PresignedUploadService;

  constructor() {
    const appUrl = process.env.DATABASE_URL;
    const migrateUrl = process.env.DATABASE_MIGRATE_URL;
    if (!appUrl || !migrateUrl) {
      throw new Error('DATABASE_URL y DATABASE_MIGRATE_URL son obligatorias');
    }
    this.appClient = new PrismaClient({ datasourceUrl: appUrl });
    this.migrateClient = new PrismaClient({ datasourceUrl: migrateUrl });
    this.supabase = new SupabaseAdminAdapter();
    this.mailer = new ResendInvitationMailer();
    this.presignedUploads = new PresignedUploadAdapter();
  }

  async onModuleDestroy() {
    await this.appClient.$disconnect();
    await this.migrateClient.$disconnect();
  }

  buildServices(tenantId: string | null): TrpcServices {
    const appUrl = process.env.APP_URL ?? 'http://localhost:3000';
    return {
      clock: systemClock,
      tokens: cryptoTokenGenerator,
      acceptUrlFor: (token) => `${appUrl}/accept-invite?token=${encodeURIComponent(token)}`,
      appUrl,
      presignedUploads: this.presignedUploads,

      inTenant: <T>(fn: (deps: TenantDeps) => Promise<T>): Promise<T> => {
        if (!tenantId) {
          throw new Error('inTenant llamado sin tenantId activo');
        }
        return this.appClient.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SELECT set_config('app.current_tenant_id', $1, true)`,
            tenantId,
          );
          const repos = makeRepositories(tx, this.migrateClient);
          return fn({
            ...repos,
            supabase: this.supabase,
            mailer: this.mailer,
            resolveTimezone: async (clinicId: string) => {
              const clinic = await repos.clinicRepo.findById(clinicId);
              return clinic?.timezone ?? 'Europe/Madrid';
            },
          });
        });
      },

      asPublic: <T>(fn: (deps: PublicDeps) => Promise<T>): Promise<T> => {
        return Promise.resolve(
          (async (): Promise<T> => {
            const repos = makeRepositories(this.appClient, this.migrateClient);
            return fn({
              ...repos,
              supabase: this.supabase,
              mailer: this.mailer,
              resolveTimezone: async (clinicId: string) => {
                const clinic = await repos.clinicRepo.findById(clinicId);
                return clinic?.timezone ?? 'Europe/Madrid';
              },
            });
          })(),
        );
      },
    };
  }

  buildPlatformRepos(): Repositories {
    return makeRepositories(this.appClient, this.migrateClient);
  }
}

@Module({
  providers: [ServicesProvider],
  exports: [ServicesProvider],
})
export class ServicesModule {}
