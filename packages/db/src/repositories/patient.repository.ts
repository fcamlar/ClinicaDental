import type { Prisma, PrismaClient } from '@prisma/client';
import type { patients } from '@castellar/core';

export class PrismaPatientRepository implements patients.PatientRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async findById(id: string) {
    const p = await this.tx.patient.findUnique({ where: { id } });
    return p ? this.toEntity(p) : null;
  }

  async findByCode(code: string) {
    const p = await this.tx.patient.findFirst({ where: { code } });
    return p ? this.toEntity(p) : null;
  }

  async findByNationalIdHash(hash: string) {
    const p = await this.tx.patient.findFirst({ where: { nationalIdHash: hash } });
    return p ? this.toEntity(p) : null;
  }

  /**
   * Búsqueda libre con pg_trgm. La similitud se aplica sobre `first_name`,
   * `last_name` y `code` con un umbral bajo para tolerar errores tipográficos.
   *
   * El operador `%` usa el índice GIN creado en la migración Sprint 0.
   */
  async search({ query, limit }: { query: string; limit: number }) {
    const q = query.trim();
    if (!q) return [];
    // Usamos $queryRaw para aprovechar pg_trgm. RLS sigue activa porque
    // la transacción tiene el tenant fijado.
    const rows = await this.tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM patients
      WHERE deleted_at IS NULL
        AND (
          (first_name || ' ' || last_name) % ${q}
          OR code ILIKE ${'%' + q + '%'}
        )
      ORDER BY similarity(first_name || ' ' || last_name, ${q}) DESC NULLS LAST
      LIMIT ${limit}
    `;
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const items = await this.tx.patient.findMany({ where: { id: { in: ids } } });
    // Conservamos el orden del ranking pg_trgm.
    const byId = new Map(items.map((p) => [p.id, p]));
    return rows.map((r) => byId.get(r.id)).filter((x): x is NonNullable<typeof x> => Boolean(x)).map((p) => this.toEntity(p));
  }

  async list({
    limit,
    cursor,
    includeDeleted,
  }: {
    limit: number;
    cursor?: string;
    includeDeleted?: boolean;
  }) {
    const items = await this.tx.patient.findMany({
      where: includeDeleted ? {} : { deletedAt: null },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page.map((p) => this.toEntity(p)),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async create(args: Omit<patients.Patient, 'id' | 'createdAt' | 'updatedAt'>) {
    const p = await this.tx.patient.create({ data: args });
    return this.toEntity(p);
  }

  async update(
    id: string,
    patch: Partial<Omit<patients.Patient, 'id' | 'tenantId' | 'createdAt'>>,
  ) {
    const p = await this.tx.patient.update({ where: { id }, data: patch });
    return this.toEntity(p);
  }

  async softDelete(id: string, at: Date) {
    await this.tx.patient.update({ where: { id }, data: { deletedAt: at } });
  }

  private toEntity(p: {
    id: string;
    tenantId: string;
    clinicId: string;
    code: string;
    firstName: string;
    lastName: string;
    nationalId: string | null;
    nationalIdHash: string | null;
    birthDate: Date | null;
    sex: patients.PatientSex | null;
    email: string | null;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    postalCode: string | null;
    city: string | null;
    country: string;
    adminNotes: string | null;
    gdprConsentAt: Date | null;
    marketingConsent: boolean;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): patients.Patient {
    return {
      id: p.id,
      tenantId: p.tenantId,
      clinicId: p.clinicId,
      code: p.code,
      firstName: p.firstName,
      lastName: p.lastName,
      nationalId: p.nationalId,
      nationalIdHash: p.nationalIdHash,
      birthDate: p.birthDate,
      sex: p.sex,
      email: p.email,
      phone: p.phone,
      addressLine1: p.addressLine1,
      addressLine2: p.addressLine2,
      postalCode: p.postalCode,
      city: p.city,
      country: p.country,
      adminNotes: p.adminNotes,
      gdprConsentAt: p.gdprConsentAt,
      marketingConsent: p.marketingConsent,
      deletedAt: p.deletedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }
}
