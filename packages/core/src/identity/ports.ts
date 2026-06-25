import type {
  AuditEntry,
  Clinic,
  ClinicMembership,
  Invitation,
  Role,
  Tenant,
  User,
  UserSecurity,
} from './entities.js';

/**
 * Puertos del bounded context identity.
 *
 * Los repositorios viven en `packages/db` (Prisma). Los servicios externos
 * (envío de email, integración Supabase Auth) viven en `apps/api` o en
 * paquetes específicos.
 *
 * El dominio (este paquete) solo conoce los puertos.
 */

// -------- Repositorios -----------------------------------------------------

export interface TenantRepository {
  /**
   * Crea un tenant + owner en una sola transacción. Esta operación ocurre
   * FUERA del contexto tenant (es el momento de provisionar uno nuevo) y
   * por tanto requiere bypass de RLS — el repositorio debe usar el rol
   * de migración o desactivar RLS para la transacción.
   */
  createTenantWithOwner(args: {
    tenant: Omit<Tenant, 'id' | 'createdAt'>;
    owner: {
      supabaseUserId: string;
      email: string;
    };
  }): Promise<{ tenant: Tenant; owner: User }>;

  findById(id: string): Promise<Tenant | null>;
  update(id: string, patch: Partial<Pick<Tenant, 'name' | 'locale'>>): Promise<Tenant>;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findBySupabaseId(supabaseUserId: string): Promise<User | null>;
  list(): Promise<User[]>;
  create(args: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  update(id: string, patch: Partial<Pick<User, 'role' | 'status' | 'email'>>): Promise<User>;
}

export interface ClinicRepository {
  list(): Promise<Clinic[]>;
  findById(id: string): Promise<Clinic | null>;
  create(args: Omit<Clinic, 'id'>): Promise<Clinic>;
  update(id: string, patch: Partial<Omit<Clinic, 'id' | 'tenantId'>>): Promise<Clinic>;
}

export interface ClinicMemberRepository {
  list(clinicId: string): Promise<ClinicMembership[]>;
  listForUser(userId: string): Promise<ClinicMembership[]>;
  assign(args: ClinicMembership): Promise<void>;
  remove(args: { userId: string; clinicId: string }): Promise<void>;
}

export interface InvitationRepository {
  findByToken(token: string): Promise<Invitation | null>;
  findByEmail(email: string): Promise<Invitation | null>;
  create(
    args: Omit<Invitation, 'id' | 'createdAt' | 'acceptedAt'>,
  ): Promise<Invitation>;
  markAccepted(id: string, at: Date): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface UserSecurityRepository {
  get(userId: string): Promise<UserSecurity | null>;
  upsert(args: UserSecurity): Promise<UserSecurity>;
  markMfaEnrolled(userId: string, at: Date): Promise<void>;
  markLogin(userId: string, at: Date, ip: string | null): Promise<void>;
}

export interface AuditLogRepository {
  /** Append-only. No devuelve nada — el ID se asigna en BD. */
  write(entry: AuditEntry): Promise<void>;
  /** Lectura paginada para el panel de auditoría del Sprint 7. */
  list(args: {
    resourceType?: string;
    resourceId?: string;
    actorId?: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: Array<AuditEntry & { id: string; at: Date }>; nextCursor: string | null }>;
}

// -------- Servicios externos ----------------------------------------------

export interface InvitationMailer {
  sendInvitation(args: {
    email: string;
    inviterEmail: string;
    tenantName: string;
    role: Role;
    acceptUrl: string;
  }): Promise<void>;
}

export interface SupabaseAdminClient {
  /**
   * Crea un usuario en Supabase Auth con email. Por defecto NO confirmado;
   * Supabase enviará un email de confirmación.
   */
  inviteUserByEmail(email: string): Promise<{ supabaseUserId: string }>;

  /**
   * Borra un usuario de Supabase Auth. Solo se invoca al rechazar una
   * invitación creada pero no aceptada.
   */
  deleteUser(supabaseUserId: string): Promise<void>;
}
