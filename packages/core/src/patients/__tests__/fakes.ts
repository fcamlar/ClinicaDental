import { randomUUID } from 'node:crypto';
import type {
  ConsentRepository,
  FileRepository,
  MedicalAlertRepository,
  PatientRepository,
} from '../ports.js';
import type {
  Consent,
  FileEntity,
  MedicalAlert,
  Patient,
} from '../entities.js';

export class FakePatientRepo implements PatientRepository {
  patients = new Map<string, Patient>();

  findById(id: string) {
    return Promise.resolve(this.patients.get(id) ?? null);
  }
  findByCode(code: string) {
    for (const p of this.patients.values()) if (p.code === code) return Promise.resolve(p);
    return Promise.resolve(null);
  }
  findByNationalIdHash(hash: string) {
    for (const p of this.patients.values())
      if (p.nationalIdHash === hash) return Promise.resolve(p);
    return Promise.resolve(null);
  }
  search({ query, limit }: { query: string; limit: number }) {
    const q = query.toLowerCase();
    const items = [...this.patients.values()]
      .filter((p) => !p.deletedAt)
      .filter(
        (p) =>
          p.firstName.toLowerCase().includes(q) ||
          p.lastName.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q),
      )
      .slice(0, limit);
    return Promise.resolve(items);
  }
  list({ limit, includeDeleted }: { limit: number; cursor?: string; includeDeleted?: boolean }) {
    const items = [...this.patients.values()]
      .filter((p) => (includeDeleted ? true : !p.deletedAt))
      .slice(0, limit);
    return Promise.resolve({ items, nextCursor: null });
  }
  create(args: Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>) {
    const p: Patient = { ...args, id: randomUUID(), createdAt: new Date(), updatedAt: new Date() };
    this.patients.set(p.id, p);
    return Promise.resolve(p);
  }
  update(id: string, patch: Partial<Omit<Patient, 'id' | 'tenantId' | 'createdAt'>>) {
    const p = this.patients.get(id);
    if (!p) throw new Error('not found');
    const next: Patient = { ...p, ...patch, updatedAt: new Date() };
    this.patients.set(id, next);
    return Promise.resolve(next);
  }
  softDelete(id: string, at: Date) {
    const p = this.patients.get(id);
    if (!p) throw new Error('not found');
    this.patients.set(id, { ...p, deletedAt: at });
    return Promise.resolve();
  }
}

export class FakeConsentRepo implements ConsentRepository {
  consents: Consent[] = [];
  listForPatient(patientId: string) {
    return Promise.resolve(this.consents.filter((c) => c.patientId === patientId));
  }
  findById(id: string) {
    return Promise.resolve(this.consents.find((c) => c.id === id) ?? null);
  }
  create(args: Omit<Consent, 'id' | 'revokedAt'>) {
    const c: Consent = { ...args, id: randomUUID(), revokedAt: null };
    this.consents.push(c);
    return Promise.resolve(c);
  }
  revoke(id: string, at: Date) {
    const i = this.consents.findIndex((c) => c.id === id);
    if (i === -1) throw new Error('not found');
    this.consents[i] = { ...this.consents[i]!, revokedAt: at };
    return Promise.resolve();
  }
}

export class FakeAlertRepo implements MedicalAlertRepository {
  alerts: MedicalAlert[] = [];
  listForPatient(patientId: string) {
    return Promise.resolve(this.alerts.filter((a) => a.patientId === patientId));
  }
  create(args: Omit<MedicalAlert, 'id' | 'createdAt' | 'resolvedAt'>) {
    const a: MedicalAlert = {
      ...args,
      id: randomUUID(),
      createdAt: new Date(),
      resolvedAt: null,
    };
    this.alerts.push(a);
    return Promise.resolve(a);
  }
  resolve(id: string, at: Date) {
    const i = this.alerts.findIndex((a) => a.id === id);
    if (i === -1) throw new Error('not found');
    this.alerts[i] = { ...this.alerts[i]!, resolvedAt: at };
    return Promise.resolve();
  }
  delete(id: string) {
    this.alerts = this.alerts.filter((a) => a.id !== id);
    return Promise.resolve();
  }
}

export class FakeFileRepo implements FileRepository {
  files = new Map<string, FileEntity>();
  listForOwner(ownerType: FileEntity['ownerType'], ownerId: string) {
    return Promise.resolve(
      [...this.files.values()].filter(
        (f) => f.ownerType === ownerType && f.ownerId === ownerId && !f.deletedAt,
      ),
    );
  }
  findById(id: string) {
    return Promise.resolve(this.files.get(id) ?? null);
  }
  createPending(args: Omit<FileEntity, 'id' | 'uploadedAt' | 'scanResult' | 'deletedAt' | 'scanStatus'>) {
    const f: FileEntity = {
      ...args,
      id: randomUUID(),
      uploadedAt: new Date(),
      scanStatus: 'PENDING',
      scanResult: null,
      deletedAt: null,
    };
    this.files.set(f.id, f);
    return Promise.resolve(f);
  }
  updateScanStatus(id: string, status: FileEntity['scanStatus'], result: string | null) {
    const f = this.files.get(id);
    if (!f) throw new Error('not found');
    this.files.set(id, { ...f, scanStatus: status, scanResult: result });
    return Promise.resolve();
  }
  softDelete(id: string, at: Date) {
    const f = this.files.get(id);
    if (!f) throw new Error('not found');
    this.files.set(id, { ...f, deletedAt: at });
    return Promise.resolve();
  }
}
