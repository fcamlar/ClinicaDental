import type { Prisma, PrismaClient } from '@prisma/client';
import type { identity } from '@castellar/core';

type TenantRepo = identity.TenantRepository;

/**
 * Implementación Prisma de TenantRepository.
 *
 * `createTenantWithOwner` ocurre FUERA del contexto tenant (estamos creando
 * uno nuevo). Para eso recibimos `migrateClient`: un PrismaClient conectado
 * con el rol superuser que bypasea RLS. La operación completa va en una
 * sola transacción.
 *
 * El resto de operaciones se realizan con el cliente tenant-scoped que
 * `withTenant` inyecta.
 */
export class PrismaTenantRepository implements TenantRepo {
  constructor(
    private readonly tx: PrismaClient | Prisma.TransactionClient,
    private readonly migrateClient: PrismaClient,
  ) {}

  async createTenantWithOwner({
    tenant,
    owner,
  }: Parameters<TenantRepo['createTenantWithOwner']>[0]) {
    return this.migrateClient.$transaction(async (tx) => {
      const t = await tx.tenant.create({ data: tenant });
      const u = await tx.user.create({
        data: {
          tenantId: t.id,
          supabaseUserId: owner.supabaseUserId,
          email: owner.email,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
      return {
        tenant: {
          id: t.id,
          name: t.name,
          country: t.country,
          locale: t.locale,
          plan: t.plan,
          createdAt: t.createdAt,
        },
        owner: {
          id: u.id,
          tenantId: u.tenantId,
          supabaseUserId: u.supabaseUserId,
          email: u.email,
          role: u.role,
          status: u.status,
          createdAt: u.createdAt,
        },
      };
    });
  }

  async findById(id: string) {
    const t = await this.tx.tenant.findUnique({ where: { id } });
    return t
      ? {
          id: t.id,
          name: t.name,
          country: t.country,
          locale: t.locale,
          plan: t.plan,
          createdAt: t.createdAt,
        }
      : null;
  }

  async update(id: string, patch: { name?: string; locale?: string }) {
    const t = await this.tx.tenant.update({ where: { id }, data: patch });
    return {
      id: t.id,
      name: t.name,
      country: t.country,
      locale: t.locale,
      plan: t.plan,
      createdAt: t.createdAt,
    };
  }
}
