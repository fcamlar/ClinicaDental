import type { Prisma, PrismaClient } from '@prisma/client';
import type { catalog } from '@castellar/core';

export class PrismaTreatmentRepository implements catalog.TreatmentRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async findById(id: string) {
    const t = await this.tx.treatment.findUnique({ where: { id } });
    return t ? this.toEntity(t) : null;
  }
  async findByCode(code: string) {
    const t = await this.tx.treatment.findFirst({ where: { code } });
    return t ? this.toEntity(t) : null;
  }
  async list({
    activeOnly = false,
    category,
    query,
  }: {
    activeOnly?: boolean;
    category?: string;
    query?: string;
  }) {
    const where: Prisma.TreatmentWhereInput = {};
    if (activeOnly) where.active = true;
    if (category) where.category = category;
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { code: { contains: query, mode: 'insensitive' } },
      ];
    }
    const items = await this.tx.treatment.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    return items.map((t) => this.toEntity(t));
  }
  async create(args: Omit<catalog.Treatment, 'id' | 'createdAt' | 'updatedAt'>) {
    const t = await this.tx.treatment.create({ data: args });
    return this.toEntity(t);
  }
  async update(
    id: string,
    patch: Partial<Omit<catalog.Treatment, 'id' | 'tenantId' | 'createdAt'>>,
  ) {
    const t = await this.tx.treatment.update({ where: { id }, data: patch });
    return this.toEntity(t);
  }
  async upsertMany(items: Array<Omit<catalog.Treatment, 'id' | 'createdAt' | 'updatedAt'>>) {
    let count = 0;
    for (const it of items) {
      await this.tx.treatment.upsert({
        where: { tenantId_code: { tenantId: it.tenantId, code: it.code } },
        create: it,
        update: {
          name: it.name,
          description: it.description,
          defaultPrice: it.defaultPrice,
          taxRegime: it.taxRegime,
          category: it.category,
          active: it.active,
        },
      });
      count += 1;
    }
    return count;
  }

  private toEntity(t: {
    id: string;
    tenantId: string;
    code: string;
    name: string;
    description: string | null;
    defaultPrice: number;
    taxRegime: catalog.TaxRegime;
    category: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): catalog.Treatment {
    return {
      id: t.id,
      tenantId: t.tenantId,
      code: t.code,
      name: t.name,
      description: t.description,
      defaultPrice: t.defaultPrice,
      taxRegime: t.taxRegime,
      category: t.category,
      active: t.active,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}
