import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { protectedProcedure, router } from '../trpc.js';

const OWNER_TYPES = ['PATIENT', 'CONSENT', 'BUDGET', 'INVOICE'] as const;

const ALLOWED_MIMES = [
  // Documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  // Imágenes clínicas
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  // DICOM (radiología)
  'application/dicom',
];

export const filesRouter = router({
  /**
   * Solicita una presigned URL para subir un archivo. La API:
   *   1. Crea registro `files` con `scan_status=PENDING`.
   *   2. Devuelve URL + cabeceras firmadas; el cliente sube directo a R2/MinIO.
   *   3. Tras subida, cliente llama a `confirmUpload` y la API encola scan.
   */
  createPresignedUpload: protectedProcedure
    .input(
      z.object({
        ownerType: z.enum(OWNER_TYPES),
        ownerId: z.string().uuid(),
        mime: z.string(),
        size: z.number().int().min(1).max(25 * 1024 * 1024),
        filename: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ALLOWED_MIMES.includes(input.mime)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tipo de archivo no permitido' });
      }
      return ctx.services.inTenant(async (deps) => {
        const presigned = await ctx.services.presignedUploads.createPresignedUpload({
          tenantId: ctx.tenantId,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          mime: input.mime,
          size: input.size,
          filename: input.filename,
        });
        // Persistimos el registro pendiente.
        await deps.fileRepo.createPending({
          tenantId: ctx.tenantId,
          ownerType: input.ownerType,
          ownerId: input.ownerId,
          s3Key: presigned.s3Key,
          mime: input.mime,
          size: input.size,
          filename: input.filename,
          uploadedById: ctx.user.id,
        });
        return {
          fileId: presigned.fileId,
          uploadUrl: presigned.uploadUrl,
          headers: presigned.headers,
          expiresIn: presigned.expiresIn,
        };
      });
    }),

  /**
   * Confirma que el cliente ha subido el archivo. Encola el job de scan
   * antivirus. Devuelve el File actualizado.
   */
  confirmUpload: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.services.inTenant(async (deps) => {
        const file = await deps.fileRepo.findById(input.fileId);
        if (!file) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Archivo no encontrado' });
        }
        await ctx.services.presignedUploads.enqueueScan(file.id, file.s3Key, ctx.tenantId);
        await deps.audit.write({
          tenantId: ctx.tenantId,
          actorId: ctx.user.id,
          action: 'file.upload',
          resourceType: 'file',
          resourceId: file.id,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          reason: null,
          diff: {
            ownerType: file.ownerType,
            ownerId: file.ownerId,
            mime: file.mime,
            size: file.size,
          },
        });
        return file;
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        ownerType: z.enum(OWNER_TYPES),
        ownerId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant((deps) =>
        deps.fileRepo.listForOwner(input.ownerType, input.ownerId),
      );
    }),
});
