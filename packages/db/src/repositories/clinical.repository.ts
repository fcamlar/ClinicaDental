import type { Prisma, PrismaClient } from '@prisma/client';
import { clinical } from '@castellar/core';

type ClinicalRecord = clinical.ClinicalRecord;
type Visit = clinical.Visit;
type VisitStatus = clinical.VisitStatus;
type ClinicalNote = clinical.ClinicalNote;
type NoteType = clinical.NoteType;
type Odontogram = clinical.Odontogram;

export class PrismaClinicalRecordRepository implements clinical.ClinicalRecordRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async findByPatientId(patientId: string) {
    const r = await this.tx.clinicalRecord.findUnique({ where: { patientId } });
    return r ? this.toEntity(r) : null;
  }

  async ensureForPatient({ tenantId, patientId }: { tenantId: string; patientId: string }) {
    const existing = await this.tx.clinicalRecord.findUnique({ where: { patientId } });
    if (existing) return this.toEntity(existing);
    const created = await this.tx.clinicalRecord.create({
      data: { tenantId, patientId },
    });
    return this.toEntity(created);
  }

  private toEntity(r: {
    id: string;
    tenantId: string;
    patientId: string;
    openedAt: Date;
  }): ClinicalRecord {
    return { id: r.id, tenantId: r.tenantId, patientId: r.patientId, openedAt: r.openedAt };
  }
}

export class PrismaVisitRepository implements clinical.VisitRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async findById(id: string) {
    const v = await this.tx.visit.findUnique({ where: { id } });
    return v ? this.toEntity(v) : null;
  }
  async findByAppointmentId(appointmentId: string) {
    const v = await this.tx.visit.findUnique({ where: { appointmentId } });
    return v ? this.toEntity(v) : null;
  }
  async listForRecord(recordId: string) {
    const items = await this.tx.visit.findMany({
      where: { recordId },
      orderBy: { startedAt: 'desc' },
    });
    return items.map((v) => this.toEntity(v));
  }
  async findOpenForPatient(patientId: string) {
    const v = await this.tx.visit.findFirst({
      where: { patientId, status: 'OPEN' },
      orderBy: { startedAt: 'desc' },
    });
    return v ? this.toEntity(v) : null;
  }
  async create(args: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>) {
    const v = await this.tx.visit.create({ data: args });
    return this.toEntity(v);
  }
  async updateStatus(id: string, status: VisitStatus, closedAt: Date | null) {
    const v = await this.tx.visit.update({
      where: { id },
      data: { status, closedAt },
    });
    return this.toEntity(v);
  }
  private toEntity(v: {
    id: string;
    tenantId: string;
    recordId: string;
    patientId: string;
    professionalId: string | null;
    appointmentId: string | null;
    startedAt: Date;
    closedAt: Date | null;
    motive: string | null;
    status: VisitStatus;
    createdAt: Date;
    updatedAt: Date;
  }): Visit {
    return {
      id: v.id,
      tenantId: v.tenantId,
      recordId: v.recordId,
      patientId: v.patientId,
      professionalId: v.professionalId,
      appointmentId: v.appointmentId,
      startedAt: v.startedAt,
      closedAt: v.closedAt,
      motive: v.motive,
      status: v.status,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    };
  }
}

export class PrismaClinicalNoteRepository implements clinical.ClinicalNoteRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async findById(id: string) {
    const n = await this.tx.clinicalNote.findUnique({ where: { id } });
    return n ? this.toEntity(n) : null;
  }
  async listForVisit(visitId: string) {
    const items = await this.tx.clinicalNote.findMany({
      where: { visitId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((n) => this.toEntity(n));
  }
  async listForRecord(recordId: string, limit: number) {
    const items = await this.tx.clinicalNote.findMany({
      where: { recordId, parentNoteId: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return items.map((n) => this.toEntity(n));
  }
  async create(args: Omit<ClinicalNote, 'id' | 'createdAt' | 'updatedAt' | 'lockedAt'>) {
    const n = await this.tx.clinicalNote.create({ data: args });
    return this.toEntity(n);
  }
  async updateBody(id: string, body: string, type: NoteType) {
    const n = await this.tx.clinicalNote.update({
      where: { id },
      data: { body, type },
    });
    return this.toEntity(n);
  }
  async lock(id: string, at: Date) {
    await this.tx.clinicalNote.updateMany({
      where: { id, lockedAt: null },
      data: { lockedAt: at },
    });
  }
  private toEntity(n: {
    id: string;
    tenantId: string;
    recordId: string;
    visitId: string | null;
    authorId: string;
    type: NoteType;
    body: string;
    parentNoteId: string | null;
    lockedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ClinicalNote {
    return {
      id: n.id,
      tenantId: n.tenantId,
      recordId: n.recordId,
      visitId: n.visitId,
      authorId: n.authorId,
      type: n.type,
      body: n.body,
      parentNoteId: n.parentNoteId,
      lockedAt: n.lockedAt,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }
}

export class PrismaOdontogramRepository implements clinical.OdontogramRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async findByVisitId(visitId: string) {
    const o = await this.tx.odontogram.findUnique({ where: { visitId } });
    return o ? this.toEntity(o) : null;
  }
  async upsert(args: { tenantId: string; visitId: string; stateJson: unknown }) {
    const o = await this.tx.odontogram.upsert({
      where: { visitId: args.visitId },
      create: {
        tenantId: args.tenantId,
        visitId: args.visitId,
        stateJson: args.stateJson as Prisma.InputJsonValue,
      },
      update: {
        stateJson: args.stateJson as Prisma.InputJsonValue,
      },
    });
    return this.toEntity(o);
  }
  private toEntity(o: {
    id: string;
    tenantId: string;
    visitId: string;
    stateJson: Prisma.JsonValue;
    snapshotAt: Date;
    updatedAt: Date;
  }): Odontogram {
    return {
      id: o.id,
      tenantId: o.tenantId,
      visitId: o.visitId,
      stateJson: o.stateJson,
      snapshotAt: o.snapshotAt,
      updatedAt: o.updatedAt,
    };
  }
}
