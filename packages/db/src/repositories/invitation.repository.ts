import type { Prisma, PrismaClient } from '@prisma/client';
import type { identity } from '@castellar/core';

export class PrismaInvitationRepository implements identity.InvitationRepository {
  /**
   * `tx` para operaciones dentro del tenant activo.
   * `migrateClient` para `findByToken`, que es endpoint público (sin tenant
   * activo) y por tanto debe bypasear RLS. La unicidad criptográfica del
   * token es la autenticación.
   */
  constructor(
    private readonly tx: PrismaClient | Prisma.TransactionClient,
    private readonly migrateClient: PrismaClient,
  ) {}

  async findByToken(token: string) {
    const i = await this.migrateClient.invitation.findUnique({ where: { token } });
    return i ? this.toEntity(i) : null;
  }
  async findByEmail(email: string) {
    const i = await this.tx.invitation.findFirst({ where: { email } });
    return i ? this.toEntity(i) : null;
  }
  async create(args: Omit<identity.Invitation, 'id' | 'createdAt' | 'acceptedAt'>) {
    const i = await this.tx.invitation.create({ data: args });
    return this.toEntity(i);
  }
  async markAccepted(id: string, at: Date) {
    // Necesita migrateClient porque la confirmación llega sin tenant activo.
    await this.migrateClient.invitation.update({ where: { id }, data: { acceptedAt: at } });
  }
  async delete(id: string) {
    await this.tx.invitation.delete({ where: { id } });
  }

  private toEntity(i: {
    id: string;
    tenantId: string;
    email: string;
    role: identity.Role;
    invitedById: string;
    token: string;
    expiresAt: Date;
    acceptedAt: Date | null;
    createdAt: Date;
  }): identity.Invitation {
    return {
      id: i.id,
      tenantId: i.tenantId,
      email: i.email,
      role: i.role,
      invitedById: i.invitedById,
      token: i.token,
      expiresAt: i.expiresAt,
      acceptedAt: i.acceptedAt,
      createdAt: i.createdAt,
    };
  }
}
