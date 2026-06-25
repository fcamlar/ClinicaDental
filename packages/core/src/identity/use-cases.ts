import { z } from 'zod';
import { BadRequest, Conflict, Forbidden, NotFound } from '../shared/errors.js';
import type { Clock } from '../shared/clock.js';
import type { TokenGenerator } from '../shared/token.js';
import { MFA_REQUIRED_ROLES, type Role } from './entities.js';
import type {
  AuditLogRepository,
  ClinicMemberRepository,
  ClinicRepository,
  InvitationMailer,
  InvitationRepository,
  SupabaseAdminClient,
  TenantRepository,
  UserRepository,
  UserSecurityRepository,
} from './ports.js';

// ---------- Schemas Zod compartidos con la API ----------------------------

export const createTenantInput = z.object({
  tenantName: z.string().trim().min(2).max(120),
  country: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/),
  locale: z.string().min(2).max(10),
  ownerEmail: z.string().email(),
  /** El supabaseUserId del owner ya autenticado en Supabase Auth. */
  ownerSupabaseUserId: z.string().uuid(),
});
export type CreateTenantInput = z.infer<typeof createTenantInput>;

export const inviteUserInput = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN_CLINIC', 'DENTIST', 'HYGIENIST', 'RECEPTION', 'ACCOUNTING']),
});
export type InviteUserInput = z.infer<typeof inviteUserInput>;

export const acceptInvitationInput = z.object({
  token: z.string().min(16).max(128),
  supabaseUserId: z.string().uuid(),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationInput>;

export const createClinicInput = z.object({
  name: z.string().trim().min(2).max(160),
  address: z.string().max(255).optional(),
  vatId: z.string().max(32).optional(),
  timezone: z.string().min(3).max(60).default('Europe/Madrid'),
});
export type CreateClinicInput = z.infer<typeof createClinicInput>;

// ---------- Casos de uso ---------------------------------------------------

/**
 * Crea un nuevo tenant + clínica inicial + owner.
 * Operación PÚBLICA (sin tenant activo). El repositorio bypasea RLS para
 * esta única operación.
 */
export function makeCreateTenantUseCase(deps: {
  tenantRepo: TenantRepository;
  clinicRepo: ClinicRepository;
  memberRepo: ClinicMemberRepository;
  securityRepo: UserSecurityRepository;
  audit: AuditLogRepository;
  clock: Clock;
}) {
  return async function createTenant(input: CreateTenantInput, ip: string | null) {
    const { tenant, owner } = await deps.tenantRepo.createTenantWithOwner({
      tenant: {
        name: input.tenantName,
        country: input.country,
        locale: input.locale,
        plan: 'free',
      },
      owner: {
        supabaseUserId: input.ownerSupabaseUserId,
        email: input.ownerEmail,
      },
    });

    await deps.securityRepo.upsert({
      userId: owner.id,
      mfaRequired: MFA_REQUIRED_ROLES.has('OWNER'),
      mfaEnrolledAt: null,
      lastLoginAt: null,
      lastLoginIp: null,
    });

    await deps.audit.write({
      tenantId: tenant.id,
      actorId: owner.id,
      action: 'tenant.create',
      resourceType: 'tenant',
      resourceId: tenant.id,
      ip,
      userAgent: null,
      reason: null,
      diff: { name: tenant.name, country: tenant.country },
    });

    return { tenant, owner };
  };
}

/**
 * El owner (o admin) invita a un usuario. Crea registro en Supabase Auth,
 * persiste `User(status=INVITED)` y `Invitation` con token; envía email.
 */
export function makeInviteUserUseCase(deps: {
  userRepo: UserRepository;
  invitationRepo: InvitationRepository;
  securityRepo: UserSecurityRepository;
  audit: AuditLogRepository;
  supabase: SupabaseAdminClient;
  mailer: InvitationMailer;
  clock: Clock;
  tokens: TokenGenerator;
  acceptUrlFor: (token: string) => string;
}) {
  return async function inviteUser(args: {
    tenantId: string;
    actorId: string;
    actorEmail: string;
    actorRole: Role;
    tenantName: string;
    input: InviteUserInput;
    ip: string | null;
  }) {
    // Política RBAC: solo OWNER y ADMIN_CLINIC pueden invitar.
    if (args.actorRole !== 'OWNER' && args.actorRole !== 'ADMIN_CLINIC') {
      throw new Forbidden('Tu rol no permite invitar usuarios');
    }
    // Solo OWNER puede invitar a otro OWNER.
    if (args.input.role === 'OWNER' && args.actorRole !== 'OWNER') {
      throw new Forbidden('Solo un OWNER puede invitar a otro OWNER');
    }

    const existing = await deps.userRepo.findByEmail(args.input.email);
    if (existing) {
      throw new Conflict('Ya existe un usuario con ese email en este tenant');
    }
    const existingInvite = await deps.invitationRepo.findByEmail(args.input.email);
    if (existingInvite && !existingInvite.acceptedAt) {
      throw new Conflict('Ya hay una invitación pendiente para ese email');
    }

    const { supabaseUserId } = await deps.supabase.inviteUserByEmail(args.input.email);

    const newUser = await deps.userRepo.create({
      tenantId: args.tenantId,
      supabaseUserId,
      email: args.input.email,
      role: args.input.role,
      status: 'INVITED',
    });

    await deps.securityRepo.upsert({
      userId: newUser.id,
      mfaRequired: MFA_REQUIRED_ROLES.has(args.input.role),
      mfaEnrolledAt: null,
      lastLoginAt: null,
      lastLoginIp: null,
    });

    const token = deps.tokens.generate();
    const expiresAt = new Date(deps.clock.now().getTime() + 7 * 24 * 60 * 60 * 1000);
    const invitation = await deps.invitationRepo.create({
      tenantId: args.tenantId,
      email: args.input.email,
      role: args.input.role,
      invitedById: args.actorId,
      token,
      expiresAt,
    });

    await deps.mailer.sendInvitation({
      email: args.input.email,
      inviterEmail: args.actorEmail,
      tenantName: args.tenantName,
      role: args.input.role,
      acceptUrl: deps.acceptUrlFor(token),
    });

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'user.invite',
      resourceType: 'user',
      resourceId: newUser.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { email: args.input.email, role: args.input.role },
    });

    return { user: newUser, invitation };
  };
}

/**
 * Canjea una invitación. PÚBLICO — sin contexto tenant. El repositorio de
 * invitación lee fuera de RLS por token (la unicidad del token es la
 * autenticación).
 */
export function makeAcceptInvitationUseCase(deps: {
  invitationRepo: InvitationRepository;
  userRepo: UserRepository;
  audit: AuditLogRepository;
  clock: Clock;
}) {
  return async function acceptInvitation(input: AcceptInvitationInput, ip: string | null) {
    const invitation = await deps.invitationRepo.findByToken(input.token);
    if (!invitation) throw new NotFound('Invitación');
    if (invitation.acceptedAt) throw new BadRequest('Invitación ya canjeada');
    if (invitation.expiresAt.getTime() < deps.clock.now().getTime()) {
      throw new BadRequest('Invitación expirada');
    }

    const user = await deps.userRepo.findByEmail(invitation.email);
    if (!user) throw new NotFound('Usuario invitado');
    if (user.supabaseUserId !== input.supabaseUserId) {
      throw new Forbidden('El usuario de Supabase no coincide con la invitación');
    }

    const updated = await deps.userRepo.update(user.id, { status: 'ACTIVE' });
    await deps.invitationRepo.markAccepted(invitation.id, deps.clock.now());

    await deps.audit.write({
      tenantId: invitation.tenantId,
      actorId: user.id,
      action: 'user.accept_invitation',
      resourceType: 'user',
      resourceId: user.id,
      ip,
      userAgent: null,
      reason: null,
      diff: { role: user.role },
    });

    return updated;
  };
}

/** Crea una clínica dentro del tenant activo. */
export function makeCreateClinicUseCase(deps: {
  clinicRepo: ClinicRepository;
  memberRepo: ClinicMemberRepository;
  audit: AuditLogRepository;
}) {
  return async function createClinic(args: {
    tenantId: string;
    actorId: string;
    actorRole: Role;
    input: CreateClinicInput;
    ip: string | null;
  }) {
    if (args.actorRole !== 'OWNER' && args.actorRole !== 'ADMIN_CLINIC') {
      throw new Forbidden('Tu rol no permite crear clínicas');
    }

    const clinic = await deps.clinicRepo.create({
      tenantId: args.tenantId,
      name: args.input.name,
      address: args.input.address ?? null,
      vatId: args.input.vatId ?? null,
      timezone: args.input.timezone,
    });

    // El actor queda automáticamente asignado a la nueva clínica.
    await deps.memberRepo.assign({
      userId: args.actorId,
      clinicId: clinic.id,
      role: args.actorRole,
    });

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'clinic.create',
      resourceType: 'clinic',
      resourceId: clinic.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { name: clinic.name },
    });

    return clinic;
  };
}

/** Registra el login: actualiza last_login_at/ip. Llamado por el contexto tRPC. */
export function makeRecordLoginUseCase(deps: {
  securityRepo: UserSecurityRepository;
  audit: AuditLogRepository;
  clock: Clock;
}) {
  return async function recordLogin(args: {
    tenantId: string;
    userId: string;
    ip: string | null;
  }) {
    await deps.securityRepo.markLogin(args.userId, deps.clock.now(), args.ip);
    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.userId,
      action: 'user.login',
      resourceType: 'user',
      resourceId: args.userId,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: null,
    });
  };
}

/**
 * Comprueba si un usuario debe completar enrolamiento MFA antes de seguir.
 * Lo invoca el middleware tRPC en cada petición autenticada.
 */
export function makeRequireMfaUseCase(deps: { securityRepo: UserSecurityRepository }) {
  return async function requireMfa(userId: string): Promise<{ enrolled: boolean; required: boolean }> {
    const sec = await deps.securityRepo.get(userId);
    if (!sec) return { enrolled: false, required: false };
    return {
      required: sec.mfaRequired,
      enrolled: sec.mfaEnrolledAt !== null,
    };
  };
}
