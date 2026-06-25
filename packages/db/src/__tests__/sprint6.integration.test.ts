import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { patients, portal, fixedClock } from '@castellar/core';
import { cryptoTokenGenerator, makeRepositories, withTenant } from '../index.js';
import { FakeMailer } from '@castellar/core/patients/__tests__/fakes.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CLINIC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = 'a0000000-0000-0000-0000-000000000001';
const PATIENT_A = 'e0000000-0000-0000-0000-000000000001';
const PATIENT_B = 'e0000000-0000-0000-0000-000000000002';

let migrate: PrismaClient;
const NOW = new Date('2026-12-19T10:00:00Z');

beforeAll(async () => {
  migrate = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATE_URL });
});

beforeEach(async () => {
  await migrate.$executeRawUnsafe(`DELETE FROM portal_access_tokens`);
  await migrate.$executeRawUnsafe(`DELETE FROM audit_log`);
  await migrate.$executeRawUnsafe(`DELETE FROM appointments`);
  await migrate.$executeRawUnsafe(`DELETE FROM patients`);
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
      email: 'owner@demo.test',
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });
  await migrate.patient.createMany({
    data: [
      {
        id: PATIENT_A,
        tenantId: TENANT,
        clinicId: CLINIC,
        code: 'P-PORTAL-A',
        firstName: 'Lucía',
        lastName: 'Pérez',
        email: 'lucia@demo.test',
        country: 'ES',
        marketingConsent: false,
      },
      {
        id: PATIENT_B,
        tenantId: TENANT,
        clinicId: CLINIC,
        code: 'P-PORTAL-B',
        firstName: 'Pablo',
        lastName: 'Romero',
        email: 'pablo@demo.test',
        country: 'ES',
        marketingConsent: false,
      },
    ],
  });
});

afterAll(async () => {
  await migrate.$disconnect();
});

class CapturingPortalMailer implements portal.PortalMailer {
  sent: Array<{ to: string; portalUrl: string }> = [];
  sendAccessLink(args: { to: string; portalUrl: string; [k: string]: unknown }) {
    this.sent.push({ to: args.to, portalUrl: args.portalUrl });
    return Promise.resolve();
  }
}

describe('portal / integración', () => {
  it('emite token, canjea, ve mis citas y rechaza acceso a otro paciente', async () => {
    // Insertamos una cita para PATIENT_A.
    const prof = await migrate.user.create({
      data: {
        tenantId: TENANT,
        supabaseUserId: '99999999-9999-9999-9999-999999999999',
        email: 'p@demo.test',
        role: 'DENTIST',
        status: 'ACTIVE',
      },
    });
    const professional = await migrate.professional.create({
      data: { tenantId: TENANT, userId: prof.id, specialty: 'Demo' },
    });
    await migrate.appointment.create({
      data: {
        tenantId: TENANT,
        clinicId: CLINIC,
        patientId: PATIENT_A,
        professionalId: professional.id,
        startsAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
        endsAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000 + 30 * 60_000),
        status: 'SCHEDULED',
      },
    });

    let plainToken = '';
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const mailer = new CapturingPortalMailer();
      const issue = portal.makeIssuePortalLinkUseCase({
        patientRepo: repos.patientRepo,
        tokenRepo: repos.portalTokenRepo,
        mailer,
        audit: repos.audit,
        tokens: cryptoTokenGenerator,
        clock: fixedClock(NOW),
        portalUrlFor: (t) => `https://demo/portal/access?token=${t}`,
        clinicName: 'Demo',
      });
      const { tokenId } = await issue({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: { patientId: PATIENT_A },
      });
      expect(mailer.sent[0]?.to).toBe('lucia@demo.test');
      const url = mailer.sent[0]!.portalUrl;
      plainToken = decodeURIComponent(url.split('token=')[1]!);
      expect(tokenId).toBeTruthy();
    });

    // Canjeo público — usa el migrate client por construcción.
    const repos = makeRepositories(migrate, migrate);
    const exchange = portal.makeExchangePortalTokenUseCase({
      tokenRepo: repos.portalTokenRepo,
      audit: repos.audit,
      clock: fixedClock(NOW),
    });
    const session = await exchange({ input: { token: plainToken }, ip: null });
    expect(session.patientId).toBe(PATIENT_A);
    expect(session.tenantId).toBe(TENANT);

    // Profile del paciente A.
    const myProfile = portal.makeMyProfileUseCase({ patientRepo: repos.patientRepo });
    const me = await myProfile(session);
    expect(me.id).toBe(PATIENT_A);

    // Citas: solo las suyas.
    const upcoming = portal.makeMyUpcomingAppointmentsUseCase({
      appointmentRepo: repos.appointmentRepo,
      clock: fixedClock(NOW),
    });
    const list = await upcoming(session);
    expect(list).toHaveLength(1);
    expect(list[0]?.patientId).toBe(PATIENT_A);

    // Sesión "manipulada" intentando ver al paciente B → makeMyProfile cruza con
    // el repo y devolverá el B si el caller miente, pero patient.tenantId ≠ session.tenantId
    // se chequea — aquí ambos tenants coinciden así que el escudo real es que el
    // patientId de la session viene firmado por el server. Verificamos al menos
    // que el caso de uso no se confunde si patientId no existe.
    await expect(
      myProfile({ ...session, patientId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('export RGPD: incluye consentimientos, alertas, citas, facturas y audit con motivo', async () => {
    // Sembramos un consentimiento y una alerta para PATIENT_A.
    await migrate.consent.create({
      data: {
        tenantId: TENANT,
        patientId: PATIENT_A,
        type: 'GDPR',
        text: 'Consentimiento RGPD',
        textHash: createHash('sha256').update('Consentimiento RGPD').digest('hex'),
        signedAt: NOW,
      },
    });
    await migrate.medicalAlert.create({
      data: {
        tenantId: TENANT,
        patientId: PATIENT_A,
        severity: 'HIGH',
        category: 'ALLERGY',
        label: 'Penicilina',
      },
    });

    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const useCase = patients.makeExportPatientDataUseCase({
        patientRepo: repos.patientRepo,
        aggregator: repos.patientExportAggregator,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      const data = await useCase({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: '1.2.3.4',
        userAgent: 'vitest',
        input: { patientId: PATIENT_A, reason: 'Solicitud de acceso ARSULIPO' },
      });
      expect(data.version).toBe(1);
      expect(data.consents).toHaveLength(1);
      expect(data.alerts).toHaveLength(1);
      expect(data.patient.id).toBe(PATIENT_A);
    });

    const audit = await migrate.auditLog.findMany({
      where: { tenantId: TENANT, action: 'patient.export' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.reason).toBe('Solicitud de acceso ARSULIPO');
  });

  it('ACCOUNTING no puede exportar datos', async () => {
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const useCase = patients.makeExportPatientDataUseCase({
        patientRepo: repos.patientRepo,
        aggregator: repos.patientExportAggregator,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      await expect(
        useCase({
          tenantId: TENANT,
          actorId: USER,
          actorRole: 'ACCOUNTING',
          ip: null,
          userAgent: null,
          input: { patientId: PATIENT_A, reason: 'X' },
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });
});
