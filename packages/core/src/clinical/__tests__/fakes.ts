import { randomUUID } from 'node:crypto';
import type {
  ClinicalNote,
  ClinicalRecord,
  NoteType,
  Odontogram,
  Visit,
  VisitStatus,
} from '../entities.js';
import type {
  ClinicalNoteRepository,
  ClinicalRecordRepository,
  OdontogramRepository,
  VisitRepository,
} from '../ports.js';

export class FakeRecordRepo implements ClinicalRecordRepository {
  records = new Map<string, ClinicalRecord>();
  findByPatientId(patientId: string) {
    for (const r of this.records.values()) if (r.patientId === patientId) return Promise.resolve(r);
    return Promise.resolve(null);
  }
  ensureForPatient({ tenantId, patientId }: { tenantId: string; patientId: string }) {
    for (const r of this.records.values()) {
      if (r.patientId === patientId) return Promise.resolve(r);
    }
    const r: ClinicalRecord = {
      id: randomUUID(),
      tenantId,
      patientId,
      openedAt: new Date(),
    };
    this.records.set(r.id, r);
    return Promise.resolve(r);
  }
}

export class FakeVisitRepo implements VisitRepository {
  visits = new Map<string, Visit>();
  findById(id: string) {
    return Promise.resolve(this.visits.get(id) ?? null);
  }
  findByAppointmentId(appointmentId: string) {
    for (const v of this.visits.values())
      if (v.appointmentId === appointmentId) return Promise.resolve(v);
    return Promise.resolve(null);
  }
  listForRecord(recordId: string) {
    return Promise.resolve(
      [...this.visits.values()]
        .filter((v) => v.recordId === recordId)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime()),
    );
  }
  findOpenForPatient(patientId: string) {
    for (const v of this.visits.values()) {
      if (v.patientId === patientId && v.status === 'OPEN') return Promise.resolve(v);
    }
    return Promise.resolve(null);
  }
  create(args: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>) {
    const v: Visit = {
      ...args,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.visits.set(v.id, v);
    return Promise.resolve(v);
  }
  updateStatus(id: string, status: VisitStatus, closedAt: Date | null) {
    const v = this.visits.get(id);
    if (!v) return Promise.reject(new Error('not found'));
    const next: Visit = { ...v, status, closedAt, updatedAt: new Date() };
    this.visits.set(id, next);
    return Promise.resolve(next);
  }
}

export class FakeNoteRepo implements ClinicalNoteRepository {
  notes = new Map<string, ClinicalNote>();
  findById(id: string) {
    return Promise.resolve(this.notes.get(id) ?? null);
  }
  listForVisit(visitId: string) {
    return Promise.resolve([...this.notes.values()].filter((n) => n.visitId === visitId));
  }
  listForRecord(recordId: string, limit: number) {
    return Promise.resolve(
      [...this.notes.values()]
        .filter((n) => n.recordId === recordId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit),
    );
  }
  create(args: Omit<ClinicalNote, 'id' | 'createdAt' | 'updatedAt' | 'lockedAt'>) {
    const now = new Date();
    const n: ClinicalNote = {
      ...args,
      id: randomUUID(),
      lockedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.notes.set(n.id, n);
    return Promise.resolve(n);
  }
  updateBody(id: string, body: string, type: NoteType) {
    const n = this.notes.get(id);
    if (!n) return Promise.reject(new Error('not found'));
    if (n.lockedAt) return Promise.reject(new Error('locked'));
    const next: ClinicalNote = { ...n, body, type, updatedAt: new Date() };
    this.notes.set(id, next);
    return Promise.resolve(next);
  }
  lock(id: string, at: Date) {
    const n = this.notes.get(id);
    if (!n) return Promise.reject(new Error('not found'));
    if (!n.lockedAt) this.notes.set(id, { ...n, lockedAt: at });
    return Promise.resolve();
  }
  /** Helper para tests: backdating del createdAt. */
  backdate(id: string, at: Date) {
    const n = this.notes.get(id);
    if (!n) throw new Error('not found');
    this.notes.set(id, { ...n, createdAt: at });
  }
}

export class FakeOdontogramRepo implements OdontogramRepository {
  store = new Map<string, Odontogram>();
  findByVisitId(visitId: string) {
    for (const o of this.store.values()) if (o.visitId === visitId) return Promise.resolve(o);
    return Promise.resolve(null);
  }
  upsert(args: { tenantId: string; visitId: string; stateJson: unknown }) {
    const existing = [...this.store.values()].find((o) => o.visitId === args.visitId);
    const now = new Date();
    if (existing) {
      const next: Odontogram = { ...existing, stateJson: args.stateJson, updatedAt: now };
      this.store.set(existing.id, next);
      return Promise.resolve(next);
    }
    const o: Odontogram = {
      id: randomUUID(),
      tenantId: args.tenantId,
      visitId: args.visitId,
      stateJson: args.stateJson,
      snapshotAt: now,
      updatedAt: now,
    };
    this.store.set(o.id, o);
    return Promise.resolve(o);
  }
}
