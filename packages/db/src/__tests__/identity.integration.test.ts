import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { identity, fixedClock } from '@castellar/core';
import {
  cryptoTokenGenerator,
  makeIdentityRepositories,
  withTenant,
} from '../index.js';
import { FakeMailer, FakeSupabaseAdmin } from '@castellar/core/identity/__tests__/fakes.js';

/**
 * Tests de integración del bounded context identity.
 *
 * Ejercitan los repositorios Prisma reales contra Postgres + RLS. Verifican:
 *  - flujo end-to-end: crear tenant → invitar → aceptar → listar.
 *  - aislamiento cross-tenant: tenant A no ve usuarios ni clínicas de B.
 *  - auditoría: cada acción significativa deja entrada en audit_log.
 *
 * Requiere docker-compose dev arriba o Supabase configurada.
 */

let migrateClient: PrismaClient;

const NOW = new Date('2026-06-25T10:00:00Z');

beforeAll(async () => {
  migrateClient = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATE_URL });
});

beforeEach(async () => {
  await migrateClient.$executeRawUnsafe(`DELETE FROM audit_log`);
  await migrateClient.$executeRawUnsafe(`DELETE FROM invitations`);
  await migrateClient.$executeRawUnsafe(`DELETE FROM user_security`);
  await migrateClient.$executeRawUnsafe(`DELETE FROM clinic_members`);
  await migrateClient.$executeRawUnsafe(`DELETE FROM users`);
  await migrateClient.$executeRawUnsafe(`DELETE FROM clinics`);
  await migrateClient.$executeRawUnsafe(`DELETE FROM tenants`);
});

afterAll(async () => {
  await migrateClient.$disconnect();
});

function buildDeps(tx: Parameters<typeof makeIdentityRepositories>[0]) {
  const repos = makeIdentityRepositories(tx, migrateClient);
  return {
    ...repos,
    supabase: new FakeSupabaseAdmin(),
    mailer: new FakeMailer(),
  };
}

describe('identity / integración', () => {
  it('crea tenant, invita usuario, acepta invitación, lista usuarios', async () => {
    // Crear tenant (operación pública, usa migrateClient internamente).
    const publicDeps = buildDeps(migrateClient);
    const createTenant = identity.makeCreateTenantUseCase({
      tenantRepo: publicDeps.tenantRepo,
      clinicRepo: publicDeps.clinicRepo,
      memberRepo: publicDeps.memberRepo,
      securityRepo: publicDeps.securityRepo,
      audit: publicDeps.audit,
      clock: fixedClock(NOW),
    });

    const { tenant, owner } = await createTenant(
      {
        tenantName: 'Castellar Integración',
        country: 'ES',
        locale: 'es-ES',
        ownerEmail: 'owner@castellar.test',
        ownerSupabaseUserId: '11111111-1111-1111-1111-111111111111',
      },
      '127.0.0.1',
    );

    expect(tenant.name).toBe('Castellar Integración');
    expect(owner.role).toBe('OWNER');

    // Operaciones tenant-scoped: dentro de withTenant.
    await withTenant(tenant.id, async (tx) => {
      const deps = buildDeps(tx);
      const invite = identity.makeInviteUserUseCase({
        userRepo: deps.userRepo,
        invitationRepo: deps.invitationRepo,
        securityRepo: deps.securityRepo,
        audit: deps.audit,
        supabase: deps.supabase,
        mailer: deps.mailer,
        clock: fixedClock(NOW),
        tokens: cryptoTokenGenerator,
        acceptUrlFor: (t) => `https://demo/accept?token=${t}`,
      });
      const { user, invitation } = await invite({
        tenantId: tenant.id,
        actorId: owner.id,
        actorEmail: owner.email,
        actorRole: 'OWNER',
        tenantName: tenant.name,
        input: { email: 'dentista@castellar.test', role: 'DENTIST' },
        ip: '127.0.0.1',
      });
      expect(user.status).toBe('INVITED');
      expect(invitation.token.length).toBeGreaterThan(16);
    });

    // Aceptar invitación (operación pública).
    const acceptDeps = buildDeps(migrateClient);
    const accept = identity.makeAcceptInvitationUseCase({
      invitationRepo: acceptDeps.invitationRepo,
      userRepo: acceptDeps.userRepo,
      audit: acceptDeps.audit,
      clock: fixedClock(NOW),
    });

    const inviteRow = await migrateClient.invitation.findFirstOrThrow({
      where: { email: 'dentista@castellar.test' },
    });
    const userRow = await migrateClient.user.findFirstOrThrow({
      where: { email: 'dentista@castellar.test' },
    });
    const activated = await accept(
      { token: inviteRow.token, supabaseUserId: userRow.supabaseUserId },
      null,
    );
    expect(activated.status).toBe('ACTIVE');

    // Listar usuarios dentro del tenant.
    await withTenant(tenant.id, async (tx) => {
      const deps = buildDeps(tx);
      const users = await deps.userRepo.list();
      expect(users.map((u) => u.email).sort()).toEqual(
        ['owner@castellar.test', 'dentista@castellar.test'].sort(),
      );
    });

    // Auditoría tiene al menos: tenant.create, user.invite, user.accept_invitation.
    const audit = await migrateClient.auditLog.findMany({ where: { tenantId: tenant.id } });
    const actions = audit.map((a) => a.action).sort();
    expect(actions).toContain('tenant.create');
    expect(actions).toContain('user.invite');
    expect(actions).toContain('user.accept_invitation');
  });

  it('aísla usuarios y clínicas entre dos tenants', async () => {
    const publicDeps = buildDeps(migrateClient);
    const createTenant = identity.makeCreateTenantUseCase({
      tenantRepo: publicDeps.tenantRepo,
      clinicRepo: publicDeps.clinicRepo,
      memberRepo: publicDeps.memberRepo,
      securityRepo: publicDeps.securityRepo,
      audit: publicDeps.audit,
      clock: fixedClock(NOW),
    });

    const { tenant: alfa, owner: ownerA } = await createTenant(
      {
        tenantName: 'Alfa',
        country: 'ES',
        locale: 'es-ES',
        ownerEmail: 'a@demo.test',
        ownerSupabaseUserId: '11111111-1111-1111-1111-111111111111',
      },
      null,
    );
    const { tenant: beta, owner: ownerB } = await createTenant(
      {
        tenantName: 'Beta',
        country: 'ES',
        locale: 'es-ES',
        ownerEmail: 'b@demo.test',
        ownerSupabaseUserId: '22222222-2222-2222-2222-222222222222',
      },
      null,
    );

    // Crear clínicas en cada uno.
    await withTenant(alfa.id, async (tx) => {
      const deps = buildDeps(tx);
      const useCase = identity.makeCreateClinicUseCase({
        clinicRepo: deps.clinicRepo,
        memberRepo: deps.memberRepo,
        audit: deps.audit,
      });
      await useCase({
        tenantId: alfa.id,
        actorId: ownerA.id,
        actorRole: 'OWNER',
        input: { name: 'Sede Alfa', timezone: 'Europe/Madrid' },
        ip: null,
      });
    });
    await withTenant(beta.id, async (tx) => {
      const deps = buildDeps(tx);
      const useCase = identity.makeCreateClinicUseCase({
        clinicRepo: deps.clinicRepo,
        memberRepo: deps.memberRepo,
        audit: deps.audit,
      });
      await useCase({
        tenantId: beta.id,
        actorId: ownerB.id,
        actorRole: 'OWNER',
        input: { name: 'Sede Beta', timezone: 'Europe/Madrid' },
        ip: null,
      });
    });

    // Dentro de Alfa: solo ver Alfa.
    await withTenant(alfa.id, async (tx) => {
      const deps = buildDeps(tx);
      const clinics = await deps.clinicRepo.list();
      expect(clinics.map((c) => c.name)).toEqual(['Sede Alfa']);
      const users = await deps.userRepo.list();
      expect(users.map((u) => u.email)).toEqual(['a@demo.test']);
    });

    // Dentro de Beta: solo ver Beta.
    await withTenant(beta.id, async (tx) => {
      const deps = buildDeps(tx);
      const clinics = await deps.clinicRepo.list();
      expect(clinics.map((c) => c.name)).toEqual(['Sede Beta']);
      const users = await deps.userRepo.list();
      expect(users.map((u) => u.email)).toEqual(['b@demo.test']);
    });
  });
});
