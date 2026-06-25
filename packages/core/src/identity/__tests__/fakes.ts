import { randomUUID } from 'node:crypto';
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
} from '../ports.js';
import type {
  AuditEntry,
  Clinic,
  ClinicMembership,
  Invitation,
  Tenant,
  User,
  UserSecurity,
} from '../entities.js';
import type { TokenGenerator } from '../../shared/token.js';

/**
 * Fakes in-memory. Implementan los puertos sin tocar BD.
 * Útiles para tests unitarios de casos de uso del dominio.
 */

export class FakeTenantRepo implements TenantRepository {
  tenants = new Map<string, Tenant>();
  users = new Map<string, User>();

  async createTenantWithOwner({
    tenant,
    owner,
  }: Parameters<TenantRepository['createTenantWithOwner']>[0]) {
    const t: Tenant = { ...tenant, id: randomUUID(), createdAt: new Date() };
    this.tenants.set(t.id, t);
    const u: User = {
      id: randomUUID(),
      tenantId: t.id,
      supabaseUserId: owner.supabaseUserId,
      email: owner.email,
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: new Date(),
    };
    this.users.set(u.id, u);
    return Promise.resolve({ tenant: t, owner: u });
  }

  findById(id: string) {
    return Promise.resolve(this.tenants.get(id) ?? null);
  }
  update(id: string, patch: Partial<Pick<Tenant, 'name' | 'locale'>>) {
    const t = this.tenants.get(id);
    if (!t) throw new Error('not found');
    const updated = { ...t, ...patch };
    this.tenants.set(id, updated);
    return Promise.resolve(updated);
  }
}

export class FakeUserRepo implements UserRepository {
  users = new Map<string, User>();

  findById(id: string) {
    return Promise.resolve(this.users.get(id) ?? null);
  }
  findByEmail(email: string) {
    for (const u of this.users.values()) if (u.email === email) return Promise.resolve(u);
    return Promise.resolve(null);
  }
  findBySupabaseId(supabaseUserId: string) {
    for (const u of this.users.values())
      if (u.supabaseUserId === supabaseUserId) return Promise.resolve(u);
    return Promise.resolve(null);
  }
  list() {
    return Promise.resolve([...this.users.values()]);
  }
  create(args: Omit<User, 'id' | 'createdAt'>) {
    const u: User = { ...args, id: randomUUID(), createdAt: new Date() };
    this.users.set(u.id, u);
    return Promise.resolve(u);
  }
  update(id: string, patch: Partial<Pick<User, 'role' | 'status' | 'email'>>) {
    const u = this.users.get(id);
    if (!u) throw new Error('not found');
    const updated = { ...u, ...patch };
    this.users.set(id, updated);
    return Promise.resolve(updated);
  }
}

export class FakeInvitationRepo implements InvitationRepository {
  invites = new Map<string, Invitation>();

  findByToken(token: string) {
    for (const i of this.invites.values()) if (i.token === token) return Promise.resolve(i);
    return Promise.resolve(null);
  }
  findByEmail(email: string) {
    for (const i of this.invites.values()) if (i.email === email) return Promise.resolve(i);
    return Promise.resolve(null);
  }
  create(args: Omit<Invitation, 'id' | 'createdAt' | 'acceptedAt'>) {
    const i: Invitation = {
      ...args,
      id: randomUUID(),
      createdAt: new Date(),
      acceptedAt: null,
    };
    this.invites.set(i.id, i);
    return Promise.resolve(i);
  }
  markAccepted(id: string, at: Date) {
    const i = this.invites.get(id);
    if (!i) throw new Error('not found');
    this.invites.set(id, { ...i, acceptedAt: at });
    return Promise.resolve();
  }
  delete(id: string) {
    this.invites.delete(id);
    return Promise.resolve();
  }
}

export class FakeClinicRepo implements ClinicRepository {
  clinics = new Map<string, Clinic>();
  list() {
    return Promise.resolve([...this.clinics.values()]);
  }
  findById(id: string) {
    return Promise.resolve(this.clinics.get(id) ?? null);
  }
  create(args: Omit<Clinic, 'id'>) {
    const c: Clinic = { ...args, id: randomUUID() };
    this.clinics.set(c.id, c);
    return Promise.resolve(c);
  }
  update(id: string, patch: Partial<Omit<Clinic, 'id' | 'tenantId'>>) {
    const c = this.clinics.get(id);
    if (!c) throw new Error('not found');
    const updated = { ...c, ...patch };
    this.clinics.set(id, updated);
    return Promise.resolve(updated);
  }
}

export class FakeMemberRepo implements ClinicMemberRepository {
  members: ClinicMembership[] = [];
  list(clinicId: string) {
    return Promise.resolve(this.members.filter((m) => m.clinicId === clinicId));
  }
  listForUser(userId: string) {
    return Promise.resolve(this.members.filter((m) => m.userId === userId));
  }
  assign(args: ClinicMembership) {
    this.members.push(args);
    return Promise.resolve();
  }
  remove(args: { userId: string; clinicId: string }) {
    this.members = this.members.filter(
      (m) => !(m.userId === args.userId && m.clinicId === args.clinicId),
    );
    return Promise.resolve();
  }
}

export class FakeSecurityRepo implements UserSecurityRepository {
  store = new Map<string, UserSecurity>();
  get(userId: string) {
    return Promise.resolve(this.store.get(userId) ?? null);
  }
  upsert(args: UserSecurity) {
    this.store.set(args.userId, args);
    return Promise.resolve(args);
  }
  markMfaEnrolled(userId: string, at: Date) {
    const s = this.store.get(userId);
    if (!s) throw new Error('not found');
    this.store.set(userId, { ...s, mfaEnrolledAt: at });
    return Promise.resolve();
  }
  markLogin(userId: string, at: Date, ip: string | null) {
    const s = this.store.get(userId);
    if (!s) throw new Error('not found');
    this.store.set(userId, { ...s, lastLoginAt: at, lastLoginIp: ip });
    return Promise.resolve();
  }
}

export class FakeAuditRepo implements AuditLogRepository {
  entries: Array<AuditEntry & { id: string; at: Date }> = [];
  write(entry: AuditEntry) {
    this.entries.push({ ...entry, id: randomUUID(), at: new Date() });
    return Promise.resolve();
  }
  list() {
    return Promise.resolve({ items: this.entries, nextCursor: null });
  }
}

export class FakeSupabaseAdmin implements SupabaseAdminClient {
  invited: string[] = [];
  deleted: string[] = [];
  inviteUserByEmail(email: string) {
    this.invited.push(email);
    return Promise.resolve({ supabaseUserId: randomUUID() });
  }
  deleteUser(supabaseUserId: string) {
    this.deleted.push(supabaseUserId);
    return Promise.resolve();
  }
}

export class FakeMailer implements InvitationMailer {
  sent: Array<{ email: string; acceptUrl: string }> = [];
  sendInvitation(args: { email: string; acceptUrl: string; [k: string]: unknown }) {
    this.sent.push({ email: args.email, acceptUrl: args.acceptUrl });
    return Promise.resolve();
  }
}

export class FixedTokenGenerator implements TokenGenerator {
  constructor(private readonly value: string) {}
  generate() {
    return this.value;
  }
}
