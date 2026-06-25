import type { Prisma, PrismaClient } from '@prisma/client';
import type { identity } from '@castellar/core';

export class PrismaUserRepository implements identity.UserRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async findById(id: string) {
    const u = await this.tx.user.findUnique({ where: { id } });
    return u ? this.toEntity(u) : null;
  }

  async findByEmail(email: string) {
    // Usamos findFirst porque la unicidad es por (tenantId, email);
    // dentro del contexto tenant solo habrá una fila.
    const u = await this.tx.user.findFirst({ where: { email } });
    return u ? this.toEntity(u) : null;
  }

  async findBySupabaseId(supabaseUserId: string) {
    const u = await this.tx.user.findUnique({ where: { supabaseUserId } });
    return u ? this.toEntity(u) : null;
  }

  async list() {
    const users = await this.tx.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((u) => this.toEntity(u));
  }

  async create(args: Omit<identity.User, 'id' | 'createdAt'>) {
    const u = await this.tx.user.create({ data: args });
    return this.toEntity(u);
  }

  async update(id: string, patch: { role?: identity.Role; status?: identity.UserStatus; email?: string }) {
    const u = await this.tx.user.update({ where: { id }, data: patch });
    return this.toEntity(u);
  }

  private toEntity(u: {
    id: string;
    tenantId: string;
    supabaseUserId: string;
    email: string;
    role: identity.Role;
    status: identity.UserStatus;
    createdAt: Date;
  }): identity.User {
    return {
      id: u.id,
      tenantId: u.tenantId,
      supabaseUserId: u.supabaseUserId,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
    };
  }
}
