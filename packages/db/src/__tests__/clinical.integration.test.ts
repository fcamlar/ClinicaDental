import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { clinical, fixedClock } from '@castellar/core';
import { makeRepositories, withTenant } from '../index.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CLINIC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = 'a0000000-0000-0000-0000-000000000001';
const PATIENT = 'e0000000-0000-0000-0000-000000000001';

let migrate: PrismaClient;
const NOW = new Date('2026-10-19T10:00:00Z');

beforeAll(async () => {
  migrate = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATE_URL });
});

beforeEach(async () => {
  await migrate.$executeRawUnsafe(`DELETE FROM odontograms`);
  await migrate.$executeRawUnsafe(`DELETE FROM clinical_notes`);
  await migrate.$executeRawUnsafe(`DELETE FROM visits`);
  await migrate.$executeRawUnsafe(`DELETE FROM clinical_records`);
  await migrate.$executeRawUnsafe(`DELETE FROM appointments`);
  await migrate.$executeRawUnsafe(`DELETE FROM patients`);
  await migrate.$executeRawUnsafe(`DELETE FROM clinic_members`);
  await migrate.$executeRawUnsafe(`DELETE FROM user_security`);
  await migrate.$executeRawUnsafe(`DELETE FROM users`);
  await migrate.$executeRawUnsafe(`DELETE FROM clinics`);
  await migrate.$executeRawUnsafe(`DELETE FROM tenants`);

  await migrate.tenant.create({ data: { id: TENANT, name: 'Demo' } });
  await migrate.clinic.create({
    data: { id: CLINIC, tenantId: TENANT, name: 'Sede', timezone: 'Europe/Madrid' },
  });
  await migrate.user.create({
    data: {
      id: USER,
      tenantId: TENANT,
      supabaseUserId: USER,
      email: 'dentist@demo.test',
      role: 'DENTIST',
      status: 'ACTIVE',
    },
  });
  await migrate.patient.create({
    data: {
      id: PATIENT,
      tenantId: TENANT,
      clinicId: CLINIC,
      code: 'P-INT-001',
      firstName: 'Lucía',
      lastName: 'Pérez',
      country: 'ES',
      marketingConsent: false,
    },
  });
});

afterAll(async () => {
  await migrate.$disconnect();
});

describe('clinical / integración', () => {
  it('crea record idempotente y arranca visita', async () => {
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const start = clinical.makeStartVisitUseCase({
        recordRepo: repos.clinicalRecordRepo,
        visitRepo: repos.visitRepo,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      const v1 = await start({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'DENTIST',
        ip: null,
        input: { patientId: PATIENT },
      });
      const v2 = await start({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'DENTIST',
        ip: null,
        input: { patientId: PATIENT },
      });
      expect(v1.id).toBe(v2.id);

      const recordCount = await migrate.clinicalRecord.count({ where: { tenantId: TENANT } });
      expect(recordCount).toBe(1);
    });
  });

  it('trigger BD bloquea UPDATE de body en nota locked', async () => {
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const start = clinical.makeStartVisitUseCase({
        recordRepo: repos.clinicalRecordRepo,
        visitRepo: repos.visitRepo,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      const add = clinical.makeAddNoteUseCase({
        recordRepo: repos.clinicalRecordRepo,
        visitRepo: repos.visitRepo,
        noteRepo: repos.noteRepo,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      const v = await start({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'DENTIST',
        ip: null,
        input: { patientId: PATIENT },
      });
      const n = await add({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'DENTIST',
        ip: null,
        input: { visitId: v.id, patientId: PATIENT, type: 'EVOLUTION', body: 'Original' },
      });
      // Bloqueamos manualmente.
      await repos.noteRepo.lock(n.id, NOW);
    });

    // Intentamos editar el body con migrate client (saltando dominio): debe fallar
    // por el trigger.
    const n = await migrate.clinicalNote.findFirstOrThrow();
    await expect(
      migrate.clinicalNote.update({ where: { id: n.id }, data: { body: 'Pirata' } }),
    ).rejects.toThrow(/locked/i);
  });

  it('trigger BD bloquea UPDATE de odontograma en visita CLOSED', async () => {
    let visitId = '';
    let odontoId = '';
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const start = clinical.makeStartVisitUseCase({
        recordRepo: repos.clinicalRecordRepo,
        visitRepo: repos.visitRepo,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      const v = await start({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'DENTIST',
        ip: null,
        input: { patientId: PATIENT },
      });
      visitId = v.id;
      const o = await repos.odontogramRepo.upsert({
        tenantId: TENANT,
        visitId: v.id,
        stateJson: { 26: { surfaces: { occlusal: { condition: 'CARIES' } } } },
      });
      odontoId = o.id;
      // Cerrar visita.
      await repos.visitRepo.updateStatus(v.id, 'CLOSED', NOW);
    });

    await expect(
      migrate.odontogram.update({
        where: { id: odontoId },
        data: { stateJson: { 26: {} } },
      }),
    ).rejects.toThrow(/closed/i);
  });

  it('addendum no rompe ni con el trigger (cambia solo lockedAt)', async () => {
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const start = clinical.makeStartVisitUseCase({
        recordRepo: repos.clinicalRecordRepo,
        visitRepo: repos.visitRepo,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      const add = clinical.makeAddNoteUseCase({
        recordRepo: repos.clinicalRecordRepo,
        visitRepo: repos.visitRepo,
        noteRepo: repos.noteRepo,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      const addendum = clinical.makeAddAddendumUseCase({
        noteRepo: repos.noteRepo,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      const v = await start({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'DENTIST',
        ip: null,
        input: { patientId: PATIENT },
      });
      const n = await add({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'DENTIST',
        ip: null,
        input: { visitId: v.id, patientId: PATIENT, type: 'EVOLUTION', body: 'Original' },
      });
      const ad = await addendum({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'DENTIST',
        ip: null,
        input: { parentNoteId: n.id, body: 'Adenda' },
      });
      expect(ad.parentNoteId).toBe(n.id);
    });
  });

  it('aísla historia clínica entre tenants', async () => {
    await migrate.tenant.create({ data: { id: '22222222-2222-2222-2222-222222222222', name: 'B' } });

    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const start = clinical.makeStartVisitUseCase({
        recordRepo: repos.clinicalRecordRepo,
        visitRepo: repos.visitRepo,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      await start({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'DENTIST',
        ip: null,
        input: { patientId: PATIENT },
      });
    });

    await withTenant('22222222-2222-2222-2222-222222222222', async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const list = await repos.clinicalRecordRepo.findByPatientId(PATIENT);
      expect(list).toBeNull();
    });
  });
});
