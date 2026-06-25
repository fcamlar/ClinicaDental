import type { Prisma, PrismaClient } from '@prisma/client';
import type { identity } from '@castellar/core';

export class PrismaAuditLogRepository implements identity.AuditLogRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async write(entry: identity.AuditEntry) {
    await this.tx.auditLog.create({
      data: {
        tenantId: entry.tenantId,
        actorId: entry.actorId,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        ip: entry.ip,
        userAgent: entry.userAgent,
        reason: entry.reason,
        diff: entry.diff as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async list(args: {
    resourceType?: string;
    resourceId?: string;
    actorId?: string;
    limit: number;
    cursor?: string;
  }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (args.resourceType) where.resourceType = args.resourceType;
    if (args.resourceId) where.resourceId = args.resourceId;
    if (args.actorId) where.actorId = args.actorId;

    const items = await this.tx.auditLog.findMany({
      where,
      orderBy: { at: 'desc' },
      take: args.limit + 1,
      ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > args.limit;
    const page = hasMore ? items.slice(0, args.limit) : items;

    return {
      items: page.map((e) => ({
        id: e.id,
        tenantId: e.tenantId,
        actorId: e.actorId,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        ip: e.ip,
        userAgent: e.userAgent,
        reason: e.reason,
        diff: e.diff,
        at: e.at,
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }
}
