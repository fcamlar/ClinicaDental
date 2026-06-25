import type { Treatment } from './entities.js';

export interface TreatmentRepository {
  findById(id: string): Promise<Treatment | null>;
  findByCode(code: string): Promise<Treatment | null>;
  list(args: { activeOnly?: boolean; category?: string; query?: string }): Promise<Treatment[]>;
  create(args: Omit<Treatment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Treatment>;
  update(id: string, patch: Partial<Omit<Treatment, 'id' | 'tenantId' | 'createdAt'>>): Promise<Treatment>;
  /**
   * Crea/actualiza en lote. Los códigos repetidos hacen upsert.
   * Útil para import CSV.
   */
  upsertMany(items: Array<Omit<Treatment, 'id' | 'createdAt' | 'updatedAt'>>): Promise<number>;
}
