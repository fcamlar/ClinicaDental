import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../shared/clock.js';
import { FakeAuditRepo } from '../../identity/__tests__/fakes.js';
import {
  makeAddAddendumUseCase,
  makeAddNoteUseCase,
  makeCloseVisitUseCase,
  makeEditNoteUseCase,
  makeGetVisitUseCase,
  makeSaveOdontogramUseCase,
  makeStartVisitUseCase,
} from '../use-cases.js';
import {
  FakeNoteRepo,
  FakeOdontogramRepo,
  FakeRecordRepo,
  FakeVisitRepo,
} from './fakes.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const PATIENT = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const DENTIST = 'd0000000-0000-0000-0000-000000000003';
const OWNER = '10000000-0000-0000-0000-000000000001';
const NOW = new Date('2026-10-19T10:00:00Z');

function setup() {
  return {
    recordRepo: new FakeRecordRepo(),
    visitRepo: new FakeVisitRepo(),
    noteRepo: new FakeNoteRepo(),
    odontogramRepo: new FakeOdontogramRepo(),
    audit: new FakeAuditRepo(),
    clock: fixedClock(NOW),
  };
}

describe('clinical / startVisit', () => {
  it('idempotente: si la cita ya tiene visita, devuelve esa', async () => {
    const deps = setup();
    const start = makeStartVisitUseCase(deps);
    const a = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT, appointmentId: 'a0000000-0000-0000-0000-000000000001' },
    });
    const b = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT, appointmentId: 'a0000000-0000-0000-0000-000000000001' },
    });
    expect(a.id).toBe(b.id);
  });

  it('si hay visita OPEN para el paciente, la reutiliza', async () => {
    const deps = setup();
    const start = makeStartVisitUseCase(deps);
    const a = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT },
    });
    const b = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT },
    });
    expect(a.id).toBe(b.id);
  });

  it('RECEPTION no puede iniciar visita', async () => {
    const deps = setup();
    const start = makeStartVisitUseCase(deps);
    await expect(
      start({
        tenantId: TENANT,
        actorId: DENTIST,
        actorRole: 'RECEPTION',
        ip: null,
        input: { patientId: PATIENT },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('clinical / notes 24h rule', () => {
  it('editar antes de 24h funciona', async () => {
    const deps = setup();
    const start = makeStartVisitUseCase(deps);
    const add = makeAddNoteUseCase(deps);
    const edit = makeEditNoteUseCase(deps);
    const v = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT },
    });
    const n = await add({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { visitId: v.id, patientId: PATIENT, type: 'EVOLUTION', body: 'Original' },
    });
    const u = await edit({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { noteId: n.id, body: 'Corregido' },
    });
    expect(u.body).toBe('Corregido');
  });

  it('después de 24h rechaza edición y exige adenda', async () => {
    const deps = setup();
    const start = makeStartVisitUseCase(deps);
    const add = makeAddNoteUseCase(deps);
    const edit = makeEditNoteUseCase(deps);
    const v = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT },
    });
    const n = await add({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { visitId: v.id, patientId: PATIENT, type: 'EVOLUTION', body: 'Original' },
    });
    // Backdate de 48h.
    deps.noteRepo.backdate(n.id, new Date(NOW.getTime() - 48 * 60 * 60 * 1000));
    await expect(
      edit({
        tenantId: TENANT,
        actorId: DENTIST,
        actorRole: 'DENTIST',
        ip: null,
        input: { noteId: n.id, body: 'Tarde' },
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('addendum bloquea la original y queda enlazada', async () => {
    const deps = setup();
    const start = makeStartVisitUseCase(deps);
    const add = makeAddNoteUseCase(deps);
    const addendum = makeAddAddendumUseCase(deps);
    const v = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT },
    });
    const n = await add({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { visitId: v.id, patientId: PATIENT, type: 'EVOLUTION', body: 'A' },
    });
    const ad = await addendum({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { parentNoteId: n.id, body: 'Adenda' },
    });
    expect(ad.parentNoteId).toBe(n.id);
    const reloaded = await deps.noteRepo.findById(n.id);
    expect(reloaded?.lockedAt).not.toBeNull();
  });

  it('no permite adenda sobre una adenda', async () => {
    const deps = setup();
    const add = makeAddNoteUseCase(deps);
    const addendum = makeAddAddendumUseCase(deps);
    const start = makeStartVisitUseCase(deps);
    const v = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT },
    });
    const n = await add({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { visitId: v.id, patientId: PATIENT, type: 'EVOLUTION', body: 'A' },
    });
    const ad = await addendum({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { parentNoteId: n.id, body: 'Adenda 1' },
    });
    await expect(
      addendum({
        tenantId: TENANT,
        actorId: DENTIST,
        actorRole: 'DENTIST',
        ip: null,
        input: { parentNoteId: ad.id, body: 'No vale' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('autor distinto no puede editar (salvo OWNER)', async () => {
    const deps = setup();
    const start = makeStartVisitUseCase(deps);
    const add = makeAddNoteUseCase(deps);
    const edit = makeEditNoteUseCase(deps);
    const v = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT },
    });
    const n = await add({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { visitId: v.id, patientId: PATIENT, type: 'EVOLUTION', body: 'A' },
    });
    await expect(
      edit({
        tenantId: TENANT,
        actorId: 'd0000000-0000-0000-0000-000000000099',
        actorRole: 'DENTIST',
        ip: null,
        input: { noteId: n.id, body: 'B' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // OWNER sí puede.
    const u = await edit({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'OWNER',
      ip: null,
      input: { noteId: n.id, body: 'OK' },
    });
    expect(u.body).toBe('OK');
  });
});

describe('clinical / odontogram & visit lifecycle', () => {
  it('guarda odontograma y lo congela al cerrar visita', async () => {
    const deps = setup();
    const start = makeStartVisitUseCase(deps);
    const save = makeSaveOdontogramUseCase(deps);
    const close = makeCloseVisitUseCase(deps);
    const v = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT },
    });
    await save({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { visitId: v.id, state: { 16: { surfaces: { occlusal: { condition: 'CARIES' } } } } },
    });
    const closed = await close({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { visitId: v.id },
    });
    expect(closed.status).toBe('CLOSED');
    await expect(
      save({
        tenantId: TENANT,
        actorId: DENTIST,
        actorRole: 'DENTIST',
        ip: null,
        input: { visitId: v.id, state: { 16: {} } },
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('getVisit exige reason y audita', async () => {
    const deps = setup();
    const start = makeStartVisitUseCase(deps);
    const get = makeGetVisitUseCase(deps);
    const v = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT },
    });
    await get({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: '1.2.3.4',
      userAgent: 'vitest',
      input: { visitId: v.id, reason: 'Revisión' },
    });
    expect(deps.audit.entries.map((e) => e.action)).toContain('visit.read');
    expect(deps.audit.entries.find((e) => e.action === 'visit.read')?.reason).toBe('Revisión');
  });

  it('ACCOUNTING no puede leer historia clínica', async () => {
    const deps = setup();
    const start = makeStartVisitUseCase(deps);
    const get = makeGetVisitUseCase(deps);
    const v = await start({
      tenantId: TENANT,
      actorId: DENTIST,
      actorRole: 'DENTIST',
      ip: null,
      input: { patientId: PATIENT },
    });
    await expect(
      get({
        tenantId: TENANT,
        actorId: DENTIST,
        actorRole: 'ACCOUNTING',
        ip: null,
        userAgent: null,
        input: { visitId: v.id, reason: 'X' },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
