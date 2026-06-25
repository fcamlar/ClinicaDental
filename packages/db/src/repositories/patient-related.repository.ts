import type { Prisma, PrismaClient } from '@prisma/client';
import type { patients } from '@castellar/core';

export class PrismaConsentRepository implements patients.ConsentRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async listForPatient(patientId: string) {
    const items = await this.tx.consent.findMany({
      where: { patientId },
      orderBy: { signedAt: 'desc' },
    });
    return items.map((c) => this.toEntity(c));
  }
  async findById(id: string) {
    const c = await this.tx.consent.findUnique({ where: { id } });
    return c ? this.toEntity(c) : null;
  }
  async create(args: Omit<patients.Consent, 'id' | 'revokedAt'>) {
    const c = await this.tx.consent.create({ data: args });
    return this.toEntity(c);
  }
  async revoke(id: string, at: Date) {
    await this.tx.consent.update({ where: { id }, data: { revokedAt: at } });
  }
  private toEntity(c: patients.Consent | Awaited<ReturnType<PrismaClient['consent']['findUnique']>>): patients.Consent {
    const e = c as patients.Consent;
    return {
      id: e.id,
      tenantId: e.tenantId,
      patientId: e.patientId,
      type: e.type,
      text: e.text,
      textHash: e.textHash,
      signedAt: e.signedAt,
      ip: e.ip,
      recordedById: e.recordedById,
      documentFileId: e.documentFileId,
      revokedAt: e.revokedAt,
    };
  }
}

export class PrismaMedicalAlertRepository implements patients.MedicalAlertRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async listForPatient(patientId: string) {
    const items = await this.tx.medicalAlert.findMany({
      where: { patientId, resolvedAt: null },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });
    return items.map((a) => ({
      id: a.id,
      tenantId: a.tenantId,
      patientId: a.patientId,
      severity: a.severity,
      category: a.category,
      label: a.label,
      details: a.details,
      createdById: a.createdById,
      createdAt: a.createdAt,
      resolvedAt: a.resolvedAt,
    }));
  }
  async create(args: Omit<patients.MedicalAlert, 'id' | 'createdAt' | 'resolvedAt'>) {
    const a = await this.tx.medicalAlert.create({ data: args });
    return {
      id: a.id,
      tenantId: a.tenantId,
      patientId: a.patientId,
      severity: a.severity,
      category: a.category,
      label: a.label,
      details: a.details,
      createdById: a.createdById,
      createdAt: a.createdAt,
      resolvedAt: a.resolvedAt,
    };
  }
  async resolve(id: string, at: Date) {
    await this.tx.medicalAlert.update({ where: { id }, data: { resolvedAt: at } });
  }
  async delete(id: string) {
    await this.tx.medicalAlert.delete({ where: { id } });
  }
}

export class PrismaFileRepository implements patients.FileRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async listForOwner(ownerType: patients.FileEntity['ownerType'], ownerId: string) {
    const items = await this.tx.file.findMany({
      where: { ownerType, ownerId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' },
    });
    return items.map((f) => this.toEntity(f));
  }
  async findById(id: string) {
    const f = await this.tx.file.findUnique({ where: { id } });
    return f ? this.toEntity(f) : null;
  }
  async createPending(
    args: Omit<patients.FileEntity, 'id' | 'uploadedAt' | 'scanResult' | 'deletedAt' | 'scanStatus'>,
  ) {
    const f = await this.tx.file.create({ data: { ...args, scanStatus: 'PENDING' } });
    return this.toEntity(f);
  }
  async updateScanStatus(
    id: string,
    status: patients.FileEntity['scanStatus'],
    result: string | null,
  ) {
    await this.tx.file.update({ where: { id }, data: { scanStatus: status, scanResult: result } });
  }
  async softDelete(id: string, at: Date) {
    await this.tx.file.update({ where: { id }, data: { deletedAt: at } });
  }

  private toEntity(f: patients.FileEntity | Awaited<ReturnType<PrismaClient['file']['findUnique']>>): patients.FileEntity {
    const e = f as patients.FileEntity;
    return {
      id: e.id,
      tenantId: e.tenantId,
      ownerType: e.ownerType,
      ownerId: e.ownerId,
      s3Key: e.s3Key,
      mime: e.mime,
      size: e.size,
      filename: e.filename,
      uploadedById: e.uploadedById,
      scanStatus: e.scanStatus,
      scanResult: e.scanResult,
      uploadedAt: e.uploadedAt,
      deletedAt: e.deletedAt,
    };
  }
}
