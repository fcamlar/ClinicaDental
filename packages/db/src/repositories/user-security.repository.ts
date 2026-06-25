import type { Prisma, PrismaClient } from '@prisma/client';
import type { identity } from '@castellar/core';

export class PrismaUserSecurityRepository implements identity.UserSecurityRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async get(userId: string) {
    const s = await this.tx.userSecurity.findUnique({ where: { userId } });
    return s
      ? {
          userId: s.userId,
          mfaRequired: s.mfaRequired,
          mfaEnrolledAt: s.mfaEnrolledAt,
          lastLoginAt: s.lastLoginAt,
          lastLoginIp: s.lastLoginIp,
        }
      : null;
  }

  async upsert(args: identity.UserSecurity) {
    const s = await this.tx.userSecurity.upsert({
      where: { userId: args.userId },
      create: args,
      update: {
        mfaRequired: args.mfaRequired,
        mfaEnrolledAt: args.mfaEnrolledAt,
        lastLoginAt: args.lastLoginAt,
        lastLoginIp: args.lastLoginIp,
      },
    });
    return {
      userId: s.userId,
      mfaRequired: s.mfaRequired,
      mfaEnrolledAt: s.mfaEnrolledAt,
      lastLoginAt: s.lastLoginAt,
      lastLoginIp: s.lastLoginIp,
    };
  }

  async markMfaEnrolled(userId: string, at: Date) {
    await this.tx.userSecurity.update({
      where: { userId },
      data: { mfaEnrolledAt: at },
    });
  }

  async markLogin(userId: string, at: Date, ip: string | null) {
    await this.tx.userSecurity.update({
      where: { userId },
      data: { lastLoginAt: at, lastLoginIp: ip },
    });
  }
}
