import type { Prisma, PrismaClient } from '@prisma/client';
import { portal } from '@castellar/core';

type PortalToken = portal.PortalToken;

/**
 * Repositorio de tokens del portal.
 *
 * El canjeo del token es PÚBLICO: ocurre antes de que se establezca el
 * contexto tenant. Por eso `findByHash` debe recibir un cliente Prisma sin
 * RLS activa (el `migrateClient` del services module).
 */
export class PrismaPortalTokenRepository implements portal.PortalTokenRepository {
  constructor(
    private readonly tx: PrismaClient | Prisma.TransactionClient,
    private readonly migrateClient: PrismaClient,
  ) {}

  async findByHash(tokenHash: string): Promise<PortalToken | null> {
    const t = await this.migrateClient.portalAccessToken.findUnique({
      where: { tokenHash },
    });
    return t ? this.toEntity(t) : null;
  }

  async create(args: Omit<PortalToken, 'id' | 'createdAt' | 'lastUsedAt' | 'revokedAt'>) {
    const t = await this.tx.portalAccessToken.create({ data: args });
    return this.toEntity(t);
  }

  async consume(id: string, at: Date) {
    // Decremento atómico: UPDATE WHERE uses_left > 0 RETURNING.
    await this.migrateClient.$executeRaw`
      UPDATE portal_access_tokens
         SET uses_left = uses_left - 1,
             last_used_at = ${at}
       WHERE id = ${id}::uuid
         AND uses_left > 0
    `;
  }

  async revoke(id: string, at: Date) {
    await this.tx.portalAccessToken.update({ where: { id }, data: { revokedAt: at } });
  }

  private toEntity(t: {
    id: string;
    tenantId: string;
    patientId: string;
    tokenHash: string;
    expiresAt: Date;
    usesLeft: number;
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }): PortalToken {
    return {
      id: t.id,
      tenantId: t.tenantId,
      patientId: t.patientId,
      tokenHash: t.tokenHash,
      expiresAt: t.expiresAt,
      usesLeft: t.usesLeft,
      lastUsedAt: t.lastUsedAt,
      revokedAt: t.revokedAt,
      createdAt: t.createdAt,
    };
  }
}
