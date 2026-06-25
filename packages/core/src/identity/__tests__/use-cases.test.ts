import { describe, expect, it, beforeEach } from 'vitest';
import { fixedClock } from '../../shared/clock.js';
import { DomainError } from '../../shared/errors.js';
import {
  makeAcceptInvitationUseCase,
  makeCreateClinicUseCase,
  makeCreateTenantUseCase,
  makeInviteUserUseCase,
  makeRequireMfaUseCase,
} from '../use-cases.js';
import {
  FakeAuditRepo,
  FakeClinicRepo,
  FakeInvitationRepo,
  FakeMailer,
  FakeMemberRepo,
  FakeSecurityRepo,
  FakeSupabaseAdmin,
  FakeTenantRepo,
  FakeUserRepo,
  FixedTokenGenerator,
} from './fakes.js';

const NOW = new Date('2026-06-25T10:00:00Z');

function setup() {
  const tenantRepo = new FakeTenantRepo();
  const userRepo = new FakeUserRepo();
  const invitationRepo = new FakeInvitationRepo();
  const clinicRepo = new FakeClinicRepo();
  const memberRepo = new FakeMemberRepo();
  const securityRepo = new FakeSecurityRepo();
  const audit = new FakeAuditRepo();
  const supabase = new FakeSupabaseAdmin();
  const mailer = new FakeMailer();
  const tokens = new FixedTokenGenerator('TOKEN-LARGUISIMO-1234567890');
  const clock = fixedClock(NOW);

  // Hilo común: el owner-repo tampoco respeta tenants entre sí en los fakes,
  // pero acoplamos manualmente la lista de users para el flujo.
  tenantRepo.users = userRepo.users;

  return {
    tenantRepo,
    userRepo,
    invitationRepo,
    clinicRepo,
    memberRepo,
    securityRepo,
    audit,
    supabase,
    mailer,
    tokens,
    clock,
  };
}

describe('identity / createTenant', () => {
  it('crea tenant y owner, escribe auditoría', async () => {
    const deps = setup();
    const useCase = makeCreateTenantUseCase(deps);

    const { tenant, owner } = await useCase(
      {
        tenantName: 'Castellar Madrid',
        country: 'ES',
        locale: 'es-ES',
        ownerEmail: 'owner@castellar.test',
        ownerSupabaseUserId: '11111111-1111-1111-1111-111111111111',
      },
      '1.2.3.4',
    );

    expect(tenant.name).toBe('Castellar Madrid');
    expect(owner.email).toBe('owner@castellar.test');
    expect(owner.role).toBe('OWNER');

    const sec = await deps.securityRepo.get(owner.id);
    expect(sec?.mfaRequired).toBe(true); // OWNER es clínico-administrativo: MFA obligatorio

    expect(deps.audit.entries).toHaveLength(1);
    expect(deps.audit.entries[0]?.action).toBe('tenant.create');
  });
});

describe('identity / inviteUser', () => {
  it('OWNER puede invitar a DENTIST', async () => {
    const deps = setup();
    const create = makeCreateTenantUseCase(deps);
    const invite = makeInviteUserUseCase({
      ...deps,
      acceptUrlFor: (t) => `https://demo/accept?token=${t}`,
    });

    const { tenant, owner } = await create(
      {
        tenantName: 'Demo',
        country: 'ES',
        locale: 'es-ES',
        ownerEmail: 'owner@demo.test',
        ownerSupabaseUserId: '11111111-1111-1111-1111-111111111111',
      },
      null,
    );

    const { user, invitation } = await invite({
      tenantId: tenant.id,
      actorId: owner.id,
      actorEmail: owner.email,
      actorRole: 'OWNER',
      tenantName: tenant.name,
      input: { email: 'doc@demo.test', role: 'DENTIST' },
      ip: null,
    });

    expect(user.status).toBe('INVITED');
    expect(invitation.token).toBe('TOKEN-LARGUISIMO-1234567890');
    expect(deps.supabase.invited).toContain('doc@demo.test');
    expect(deps.mailer.sent[0]?.acceptUrl).toMatch(/TOKEN-LARGUISIMO/);

    const sec = await deps.securityRepo.get(user.id);
    expect(sec?.mfaRequired).toBe(true); // DENTIST: MFA obligatorio
  });

  it('RECEPTION no puede invitar usuarios', async () => {
    const deps = setup();
    const invite = makeInviteUserUseCase({
      ...deps,
      acceptUrlFor: (t) => `https://demo/accept?token=${t}`,
    });

    await expect(
      invite({
        tenantId: '00000000-0000-0000-0000-000000000000',
        actorId: '11111111-1111-1111-1111-111111111111',
        actorEmail: 'r@demo.test',
        actorRole: 'RECEPTION',
        tenantName: 'Demo',
        input: { email: 'x@demo.test', role: 'DENTIST' },
        ip: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<DomainError>);
  });

  it('ADMIN_CLINIC no puede invitar a otro OWNER', async () => {
    const deps = setup();
    const invite = makeInviteUserUseCase({
      ...deps,
      acceptUrlFor: (t) => `https://demo/accept?token=${t}`,
    });

    await expect(
      invite({
        tenantId: '00000000-0000-0000-0000-000000000000',
        actorId: '11111111-1111-1111-1111-111111111111',
        actorEmail: 'a@demo.test',
        actorRole: 'ADMIN_CLINIC',
        tenantName: 'Demo',
        input: { email: 'x@demo.test', role: 'OWNER' },
        ip: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rechaza invitación duplicada', async () => {
    const deps = setup();
    const create = makeCreateTenantUseCase(deps);
    const invite = makeInviteUserUseCase({
      ...deps,
      acceptUrlFor: (t) => `https://demo/accept?token=${t}`,
    });
    const { tenant, owner } = await create(
      {
        tenantName: 'Demo',
        country: 'ES',
        locale: 'es-ES',
        ownerEmail: 'o@demo.test',
        ownerSupabaseUserId: '11111111-1111-1111-1111-111111111111',
      },
      null,
    );

    const args = {
      tenantId: tenant.id,
      actorId: owner.id,
      actorEmail: owner.email,
      actorRole: 'OWNER' as const,
      tenantName: tenant.name,
      input: { email: 'doc@demo.test', role: 'DENTIST' as const },
      ip: null,
    };
    await invite(args);
    await expect(invite(args)).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('identity / acceptInvitation', () => {
  it('canjea una invitación válida y activa al usuario', async () => {
    const deps = setup();
    const create = makeCreateTenantUseCase(deps);
    const invite = makeInviteUserUseCase({
      ...deps,
      acceptUrlFor: (t) => `https://demo/accept?token=${t}`,
    });
    const accept = makeAcceptInvitationUseCase(deps);

    const { tenant, owner } = await create(
      {
        tenantName: 'Demo',
        country: 'ES',
        locale: 'es-ES',
        ownerEmail: 'o@demo.test',
        ownerSupabaseUserId: '11111111-1111-1111-1111-111111111111',
      },
      null,
    );
    const { user, invitation } = await invite({
      tenantId: tenant.id,
      actorId: owner.id,
      actorEmail: owner.email,
      actorRole: 'OWNER',
      tenantName: tenant.name,
      input: { email: 'doc@demo.test', role: 'DENTIST' },
      ip: null,
    });

    const activated = await accept(
      { token: invitation.token, supabaseUserId: user.supabaseUserId },
      null,
    );
    expect(activated.status).toBe('ACTIVE');
  });

  it('rechaza token desconocido', async () => {
    const deps = setup();
    const accept = makeAcceptInvitationUseCase(deps);
    await expect(
      accept(
        {
          token: 'no-existe-1234567890123456',
          supabaseUserId: '11111111-1111-1111-1111-111111111111',
        },
        null,
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('identity / createClinic', () => {
  it('OWNER crea clínica y queda asignado como miembro', async () => {
    const deps = setup();
    const tenantCase = makeCreateTenantUseCase(deps);
    const clinicCase = makeCreateClinicUseCase(deps);

    const { tenant, owner } = await tenantCase(
      {
        tenantName: 'Demo',
        country: 'ES',
        locale: 'es-ES',
        ownerEmail: 'o@demo.test',
        ownerSupabaseUserId: '11111111-1111-1111-1111-111111111111',
      },
      null,
    );

    const clinic = await clinicCase({
      tenantId: tenant.id,
      actorId: owner.id,
      actorRole: 'OWNER',
      input: { name: 'Sede Castellar', timezone: 'Europe/Madrid' },
      ip: null,
    });

    expect(clinic.tenantId).toBe(tenant.id);
    const members = await deps.memberRepo.list(clinic.id);
    expect(members.map((m) => m.userId)).toContain(owner.id);
  });
});

describe('identity / requireMfa', () => {
  it('detecta enrolamiento pendiente para DENTIST', async () => {
    const deps = setup();
    await deps.securityRepo.upsert({
      userId: 'u1',
      mfaRequired: true,
      mfaEnrolledAt: null,
      lastLoginAt: null,
      lastLoginIp: null,
    });
    const useCase = makeRequireMfaUseCase(deps);
    const result = await useCase('u1');
    expect(result).toEqual({ required: true, enrolled: false });
  });
});
