import { PrismaClient } from '@prisma/client';

export { PrismaClient };
export type { Prisma } from '@prisma/client';
export * from './repositories/index.js';
export * from './token.js';

/**
 * Cliente Prisma compartido en proceso.
 * En dev/test se usa una única instancia para evitar saturar conexiones.
 */
let _prisma: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.LOG_LEVEL === 'debug' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return _prisma;
}

/**
 * Ejecuta `fn` dentro de una transacción Postgres con el tenant activo
 * fijado vía `SET LOCAL app.current_tenant_id`. Todas las consultas de Prisma
 * dentro del callback respetarán Row Level Security para ese tenant.
 *
 * IMPORTANTE: usar siempre esta función desde la capa API. Llamar a Prisma
 * directamente fuera de `withTenant` ejecuta las queries sin tenant activo
 * y RLS bloqueará todas las filas (deny by default) — eso es correcto, pero
 * indica que se olvidó el middleware en algún sitio.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (tx: PrismaClient) => Promise<T>,
): Promise<T> {
  const prisma = getPrismaClient();

  // Validación defensiva: el tenantId debe ser UUID.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
    throw new Error(`withTenant: tenantId inválido (${tenantId})`);
  }

  return prisma.$transaction(async (tx) => {
    // SET LOCAL solo afecta a la transacción en curso, no a la conexión.
    // set_config con is_local=true hace lo mismo y permite parametrización segura.
    await tx.$executeRawUnsafe(`SELECT set_config('app.current_tenant_id', $1, true)`, tenantId);
    return fn(tx as PrismaClient);
  });
}

/**
 * Ejecuta `fn` con privilegios de "sistema" — sin tenant activo y por tanto
 * BLOQUEADO POR RLS para todas las tablas tenant-scoped. Solo útil para
 * operaciones de plataforma (crear un tenant nuevo, migrar, etc.) donde se
 * conecta con el rol superuser/migrate.
 *
 * Usar con extrema cautela.
 */
export function withoutTenant(): PrismaClient {
  return getPrismaClient();
}
