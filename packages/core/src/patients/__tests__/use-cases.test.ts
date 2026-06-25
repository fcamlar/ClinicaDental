import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../shared/clock.js';
import { FakeAuditRepo } from '../../identity/__tests__/fakes.js';
import {
  makeAddMedicalAlertUseCase,
  makeCreatePatientUseCase,
  makeGetPatientUseCase,
  makeSignConsentUseCase,
  makeSoftDeletePatientUseCase,
  makeUpdatePatientUseCase,
} from '../use-cases.js';
import {
  FakeAlertRepo,
  FakeConsentRepo,
  FakeFileRepo,
  FakePatientRepo,
} from './fakes.js';

const NOW = new Date('2026-06-27T10:00:00Z');
const TENANT = '11111111-1111-1111-1111-111111111111';
const CLINIC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OWNER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function setup() {
  return {
    patientRepo: new FakePatientRepo(),
    consentRepo: new FakeConsentRepo(),
    alertRepo: new FakeAlertRepo(),
    fileRepo: new FakeFileRepo(),
    audit: new FakeAuditRepo(),
    clock: fixedClock(NOW),
  };
}

describe('patients / createPatient', () => {
  it('crea paciente con consentimiento GDPR + alerta de auditoría', async () => {
    const deps = setup();
    const create = makeCreatePatientUseCase(deps);

    const patient = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'RECEPTION',
      ip: '1.2.3.4',
      input: {
        firstName: 'Lucía',
        lastName: 'Pérez Gómez',
        nationalId: '12345678Z',
        clinicId: CLINIC,
        country: 'ES',
        gdprConsent: true,
        gdprConsentText:
          'Consiento expresamente el tratamiento de mis datos personales para gestión clínica.',
        marketingConsent: false,
      },
    });

    expect(patient.firstName).toBe('Lucía');
    expect(patient.nationalId).toBe('12345678Z');
    expect(patient.nationalIdHash).toMatch(/^[0-9a-f]{64}$/);
    expect(patient.gdprConsentAt).toEqual(NOW);
    expect(deps.consentRepo.consents).toHaveLength(1);
    expect(deps.consentRepo.consents[0]?.type).toBe('GDPR');
    expect(deps.audit.entries.map((e) => e.action)).toContain('patient.create');
  });

  it('rechaza DNI inválido', async () => {
    const deps = setup();
    const create = makeCreatePatientUseCase(deps);
    await expect(
      create({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'RECEPTION',
        ip: null,
        input: {
          firstName: 'X',
          lastName: 'Y',
          nationalId: '00000000A',
          clinicId: CLINIC,
          country: 'ES',
          gdprConsent: false,
          marketingConsent: false,
        },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rechaza paciente duplicado por nationalIdHash', async () => {
    const deps = setup();
    const create = makeCreatePatientUseCase(deps);
    const args = {
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'RECEPTION' as const,
      ip: null,
      input: {
        firstName: 'Lucía',
        lastName: 'Pérez',
        nationalId: '12345678Z',
        clinicId: CLINIC,
        country: 'ES',
        gdprConsent: false,
        marketingConsent: false,
      },
    };
    await create(args);
    await expect(create(args)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('exige texto si se marca gdprConsent', async () => {
    const deps = setup();
    const create = makeCreatePatientUseCase(deps);
    await expect(
      create({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'RECEPTION',
        ip: null,
        input: {
          firstName: 'Lucía',
          lastName: 'Pérez',
          clinicId: CLINIC,
          country: 'ES',
          gdprConsent: true,
          marketingConsent: false,
        },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('ACCOUNTING no puede crear pacientes', async () => {
    const deps = setup();
    const create = makeCreatePatientUseCase(deps);
    await expect(
      create({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'ACCOUNTING',
        ip: null,
        input: {
          firstName: 'X',
          lastName: 'Y',
          clinicId: CLINIC,
          country: 'ES',
          gdprConsent: false,
          marketingConsent: false,
        },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('patients / getPatient', () => {
  it('lee paciente y deja una entrada de auditoría con motivo', async () => {
    const deps = setup();
    const create = makeCreatePatientUseCase(deps);
    const get = makeGetPatientUseCase(deps);
    const p = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'DENTIST',
      ip: null,
      input: {
        firstName: 'Lucía',
        lastName: 'Pérez',
        clinicId: CLINIC,
        country: 'ES',
        gdprConsent: false,
        marketingConsent: false,
      },
    });

    const { patient } = await get({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'DENTIST',
      input: { patientId: p.id, reason: 'Revisión semestral' },
      ip: null,
      userAgent: null,
    });
    expect(patient.id).toBe(p.id);

    const readEntries = deps.audit.entries.filter((e) => e.action === 'patient.read');
    expect(readEntries).toHaveLength(1);
    expect(readEntries[0]?.reason).toBe('Revisión semestral');
  });

  it('no devuelve pacientes soft-deleted', async () => {
    const deps = setup();
    const create = makeCreatePatientUseCase(deps);
    const get = makeGetPatientUseCase(deps);
    const del = makeSoftDeletePatientUseCase(deps);

    const p = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'OWNER',
      ip: null,
      input: {
        firstName: 'X',
        lastName: 'Y',
        clinicId: CLINIC,
        country: 'ES',
        gdprConsent: false,
        marketingConsent: false,
      },
    });
    await del({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'OWNER',
      patientId: p.id,
      ip: null,
    });

    await expect(
      get({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'OWNER',
        input: { patientId: p.id, reason: 'Acceso post-borrado' },
        ip: null,
        userAgent: null,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('patients / consents', () => {
  it('firma consentimiento y audita', async () => {
    const deps = setup();
    const create = makeCreatePatientUseCase(deps);
    const sign = makeSignConsentUseCase(deps);
    const p = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'OWNER',
      ip: null,
      input: {
        firstName: 'Lucía',
        lastName: 'Pérez',
        clinicId: CLINIC,
        country: 'ES',
        gdprConsent: false,
        marketingConsent: false,
      },
    });
    const c = await sign({
      tenantId: TENANT,
      actorId: OWNER,
      ip: '1.2.3.4',
      input: {
        patientId: p.id,
        type: 'IMPLANT',
        text: 'Consentimiento informado para implante dental con riesgos explicados.',
      },
    });
    expect(c.textHash).toMatch(/^[0-9a-f]{64}$/);
    expect(deps.audit.entries.map((e) => e.action)).toContain('consent.sign');
  });
});

describe('patients / alerts', () => {
  it('añade alerta clínica', async () => {
    const deps = setup();
    const create = makeCreatePatientUseCase(deps);
    const add = makeAddMedicalAlertUseCase(deps);
    const p = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'OWNER',
      ip: null,
      input: {
        firstName: 'Lucía',
        lastName: 'Pérez',
        clinicId: CLINIC,
        country: 'ES',
        gdprConsent: false,
        marketingConsent: false,
      },
    });
    const a = await add({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'DENTIST',
      ip: null,
      input: {
        patientId: p.id,
        severity: 'HIGH',
        category: 'ALLERGY',
        label: 'Penicilina',
      },
    });
    expect(a.label).toBe('Penicilina');
    expect(deps.audit.entries.map((e) => e.action)).toContain('patient.alert.add');
  });

  it('RECEPTION no puede añadir alertas', async () => {
    const deps = setup();
    const create = makeCreatePatientUseCase(deps);
    const add = makeAddMedicalAlertUseCase(deps);
    const p = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'OWNER',
      ip: null,
      input: {
        firstName: 'X',
        lastName: 'Y',
        clinicId: CLINIC,
        country: 'ES',
        gdprConsent: false,
        marketingConsent: false,
      },
    });
    await expect(
      add({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'RECEPTION',
        ip: null,
        input: {
          patientId: p.id,
          severity: 'LOW',
          category: 'OTHER',
          label: 'Algo',
        },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('patients / update', () => {
  it('actualiza datos administrativos y audita', async () => {
    const deps = setup();
    const create = makeCreatePatientUseCase(deps);
    const update = makeUpdatePatientUseCase(deps);
    const p = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'OWNER',
      ip: null,
      input: {
        firstName: 'Lucía',
        lastName: 'Pérez',
        clinicId: CLINIC,
        country: 'ES',
        gdprConsent: false,
        marketingConsent: false,
      },
    });
    const u = await update({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'RECEPTION',
      ip: null,
      input: { patientId: p.id, phone: '+34 600 000 000' },
    });
    expect(u.phone).toBe('+34 600 000 000');
  });
});
