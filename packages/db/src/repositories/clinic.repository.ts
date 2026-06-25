import type { Prisma, PrismaClient } from '@prisma/client';
import type { identity } from '@castellar/core';

export class PrismaClinicRepository implements identity.ClinicRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async list() {
    const items = await this.tx.clinic.findMany({ orderBy: { name: 'asc' } });
    return items.map((c) => this.toEntity(c));
  }
  async findById(id: string) {
    const c = await this.tx.clinic.findUnique({ where: { id } });
    return c ? this.toEntity(c) : null;
  }
  async create(args: Omit<identity.Clinic, 'id'>) {
    const c = await this.tx.clinic.create({ data: args });
    return this.toEntity(c);
  }
  async update(id: string, patch: Partial<Omit<identity.Clinic, 'id' | 'tenantId'>>) {
    const c = await this.tx.clinic.update({ where: { id }, data: patch });
    return this.toEntity(c);
  }

  private toEntity(c: {
    id: string;
    tenantId: string;
    name: string;
    address: string | null;
    vatId: string | null;
    timezone: string;
  }): identity.Clinic {
    return {
      id: c.id,
      tenantId: c.tenantId,
      name: c.name,
      address: c.address,
      vatId: c.vatId,
      timezone: c.timezone,
    };
  }
}

export class PrismaClinicMemberRepository implements identity.ClinicMemberRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async list(clinicId: string) {
    const members = await this.tx.clinicMember.findMany({ where: { clinicId } });
    return members.map((m) => ({ userId: m.userId, clinicId: m.clinicId, role: m.role }));
  }
  async listForUser(userId: string) {
    const members = await this.tx.clinicMember.findMany({ where: { userId } });
    return members.map((m) => ({ userId: m.userId, clinicId: m.clinicId, role: m.role }));
  }
  async assign(args: identity.ClinicMembership) {
    await this.tx.clinicMember.upsert({
      where: { userId_clinicId: { userId: args.userId, clinicId: args.clinicId } },
      create: args,
      update: { role: args.role },
    });
  }
  async remove(args: { userId: string; clinicId: string }) {
    await this.tx.clinicMember.delete({
      where: { userId_clinicId: { userId: args.userId, clinicId: args.clinicId } },
    });
  }
}
