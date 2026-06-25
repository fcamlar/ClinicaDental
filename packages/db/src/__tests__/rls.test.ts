import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient, withTenant, withoutTenant } from '../index.js';

/**
 * Spike RLS — Test de aceptación del Sprint 0.
 *
 * Criterio de aceptación (revisor externo):
 *   "Si Prisma conecta con un rol que bypassea RLS, o si SET LOCAL
 *    app.current_tenant_id no queda garantizado por transacción,
 *    NO GO para Sprint 1."
 *
 * Estos tests crean DOS tenants y verifican que:
 *   1. Con `withTenant(A)` solo se ven los datos de A.
 *   2. Con `withTenant(B)` solo se ven los datos de B.
 *   3. Sin contexto de tenant, NO se ve nada (RLS deny by default).
 *   4. Un INSERT con tenant_id de otro tenant es rechazado.
 *   5. El setting es local a la transacción: no persiste entre llamadas.
 */

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

let migrateClient: PrismaClient;

beforeAll(async () => {
  // Conectamos como superuser SOLO para preparar datos (bypassa RLS).
  // En la app real, este cliente solo lo usa la pipeline de migraciones.
  migrateClient = new PrismaClient({
    datasourceUrl: process.env.DATABASE_MIGRATE_URL,
  });

  // Limpiar y sembrar.
  await migrateClient.$executeRawUnsafe(`DELETE FROM clinic_members`);
  await migrateClient.$executeRawUnsafe(`DELETE FROM users`);
  await migrateClient.$executeRawUnsafe(`DELETE FROM clinics`);
  await migrateClient.$executeRawUnsafe(`DELETE FROM tenants`);

  await migrateClient.tenant.create({
    data: { id: TENANT_A, name: 'Clínica Alfa', country: 'ES' },
  });
  await migrateClient.tenant.create({
    data: { id: TENANT_B, name: 'Clínica Beta', country: 'ES' },
  });

  await migrateClient.clinic.create({
    data: { tenantId: TENANT_A, name: 'Sede Alfa Madrid' },
  });
  await migrateClient.clinic.create({
    data: { tenantId: TENANT_B, name: 'Sede Beta Barcelona' },
  });
});

afterAll(async () => {
  await migrateClient.$disconnect();
  await getPrismaClient().$disconnect();
});

describe('RLS — aislamiento multi-tenant', () => {
  it('withTenant(A) solo ve datos de A', async () => {
    const clinics = await withTenant(TENANT_A, (tx) => tx.clinic.findMany());
    expect(clinics).toHaveLength(1);
    expect(clinics[0]?.name).toBe('Sede Alfa Madrid');
    expect(clinics[0]?.tenantId).toBe(TENANT_A);
  });

  it('withTenant(B) solo ve datos de B', async () => {
    const clinics = await withTenant(TENANT_B, (tx) => tx.clinic.findMany());
    expect(clinics).toHaveLength(1);
    expect(clinics[0]?.name).toBe('Sede Beta Barcelona');
    expect(clinics[0]?.tenantId).toBe(TENANT_B);
  });

  it('sin contexto de tenant, RLS bloquea todo (deny by default)', async () => {
    // withoutTenant devuelve el cliente sin SET LOCAL. RLS está forzada,
    // así que app_current_tenant() = NULL y ninguna fila pasa la política.
    const prisma = withoutTenant();
    const clinics = await prisma.clinic.findMany();
    expect(clinics).toHaveLength(0);

    const tenants = await prisma.tenant.findMany();
    expect(tenants).toHaveLength(0);
  });

  it('INSERT con tenant_id ajeno es rechazado por la policy WITH CHECK', async () => {
    await expect(
      withTenant(TENANT_A, (tx) =>
        tx.clinic.create({
          data: { tenantId: TENANT_B, name: 'Sede pirata' },
        }),
      ),
    ).rejects.toThrow();

    // Verificamos que la sede pirata efectivamente no se creó.
    const allClinics = await migrateClient.clinic.findMany({
      where: { name: 'Sede pirata' },
    });
    expect(allClinics).toHaveLength(0);
  });

  it('el tenant activo NO persiste entre transacciones', async () => {
    // Primer call con tenant A.
    await withTenant(TENANT_A, (tx) => tx.clinic.findMany());

    // Inmediatamente después, sin contexto: deny by default.
    const prisma = withoutTenant();
    const leaked = await prisma.clinic.findMany();
    expect(leaked).toHaveLength(0);
  });

  it('UPDATE de otro tenant es invisible (USING filtra antes)', async () => {
    const updated = await withTenant(TENANT_A, (tx) =>
      tx.clinic.updateMany({
        where: { name: 'Sede Beta Barcelona' },
        data: { name: 'Hackeada' },
      }),
    );
    // updateMany devuelve count=0 porque la fila ni siquiera es visible.
    expect(updated.count).toBe(0);

    const beta = await migrateClient.clinic.findFirst({
      where: { tenantId: TENANT_B },
    });
    expect(beta?.name).toBe('Sede Beta Barcelona');
  });
});
